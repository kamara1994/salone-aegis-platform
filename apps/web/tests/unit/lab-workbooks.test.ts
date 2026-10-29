// @vitest-environment jsdom
// Guided lab workbooks: every starter topology is valid, nothing is solved at the start, and solving
// a workbook through the CLI (the way a student would) turns its tasks green.
import { beforeEach, describe, expect, it } from 'vitest';
import { DesignCli } from '@/lab/cli';
import { emptyDoc } from '@/lab/inventory';
import { useLab } from '@/lab/store';
import { cableStatus } from '@/lab/validate';
import { gradeWorkbook, WORKBOOKS } from '@/lab/workbooks';

const st = () => useLab.getState();
const run = (id: string, ...lines: string[]) => {
  const c = new DesignCli(id);
  c.exec('enable');
  return lines.map((l) => c.exec(l)).join('\n');
};
const start = (id: string) => {
  const wb = WORKBOOKS.find((w) => w.id === id)!;
  st().startWorkbook(wb.build(), wb.id, wb.title);
  return wb;
};
const grade = (id: string) => gradeWorkbook(WORKBOOKS.find((w) => w.id === id)!, st().doc!, st().log);
const okIds = (id: string) => grade(id).filter((r) => r.ok).map((r) => r.id);

beforeEach(() => {
  window.localStorage.clear();
  st().init('wb', emptyDoc(), emptyDoc());
});

describe('lab workbooks', () => {
  it.each(WORKBOOKS.map((w) => [w.id, w]))('%s builds a valid starter topology with no physical cabling errors', (_id, wb) => {
    const doc = wb.build();
    expect(doc.devices.length).toBeGreaterThan(1);
    for (const c of doc.cables) expect(cableStatus(doc, c).issues.filter((i) => i.severity === 'error'), `${wb.id} ${c.a.device}/${c.a.port}-${c.b.device}/${c.b.port}`).toEqual([]);
    expect(new Set(wb.tasks.map((t) => t.id)).size).toBe(wb.tasks.length);
    const r = gradeWorkbook(wb, doc, []);
    expect(r).toHaveLength(wb.tasks.length);
    // Informational tasks pass on their own; real tasks must not be solved before the student starts.
    expect(r.filter((x) => x.ok).length).toBeLessThan(wb.tasks.length);
  });

  it('VLANs and trunking: solved through the CLI', () => {
    start('vlans-trunking');
    for (const sw of ['s1', 's2']) run(sw, 'conf t', 'vlan 10', 'name SALES', 'exit', 'vlan 20', 'name HR', 'exit', 'vlan 99', 'name NATIVE', 'exit', 'int g0/1', 'switchport mode access', 'switchport access vlan 10', 'int g0/2', 'switchport mode access', 'switchport access vlan 20', 'int g0/24', 'switchport mode trunk', 'switchport trunk native vlan 99', 'switchport trunk allowed vlan 10,20,99', 'end');
    const r = grade('vlans-trunking');
    expect(r.filter((x) => !x.ok), JSON.stringify(r)).toEqual([]);
  });

  it('port security: config, sticky, violation by moving the cable, recovery', () => {
    start('port-security');
    run('s1', 'conf t', 'int g0/1', 'switchport mode access', 'switchport port-security', 'switchport port-security maximum 1', 'switchport port-security violation shutdown', 'switchport port-security mac-address sticky', 'exit', 'interface range g0/2 - 23', 'shutdown', 'end');
    expect(okIds('port-security')).toEqual(expect.arrayContaining(['config', 'learned', 'unused']));
    const c = st().doc!.cables.find((x) => x.b.device === 'pc1' || x.a.device === 'pc1')!;
    st().reconnectCable(c.id, c.a.device === 'pc1' ? 'a' : 'b', { device: 'rogue', port: 'Ethernet' });
    expect(okIds('port-security')).toContain('violate');
    expect(okIds('port-security')).not.toContain('recover');
    const c2 = st().doc!.cables.find((x) => x.b.device === 'rogue' || x.a.device === 'rogue')!;
    st().reconnectCable(c2.id, c2.a.device === 'rogue' ? 'a' : 'b', { device: 'pc1', port: 'Ethernet' });
    run('s1', 'conf t', 'int g0/1', 'shutdown', 'no shutdown', 'end');
    const r = grade('port-security');
    expect(r.filter((x) => !x.ok), JSON.stringify(r)).toEqual([]);
  });

  it('ACL workbook: extended then standard ACL, graded by real packets', () => {
    start('acl');
    run('r1', 'conf t', 'ip access-list extended USERS-IN', 'permit tcp host 10.1.1.5 host 10.2.2.10 eq 22', 'deny tcp any host 10.2.2.10 eq 22', 'permit tcp any host 10.2.2.10 eq www', 'permit tcp any host 10.2.2.10 eq 443', 'deny ip any 10.2.2.0 0.0.0.255', 'permit ip any any', 'exit', 'int g0/0/0', 'ip access-group USERS-IN in', 'end');
    expect(okIds('acl')).toEqual(['ext', 'web', 'admin']);
    run('r1', 'conf t', 'access-list 10 deny host 10.1.1.30', 'access-list 10 permit any', 'int g0/0/1', 'ip access-group 10 out', 'end');
    const r = grade('acl');
    expect(r.filter((x) => !x.ok), JSON.stringify(r)).toEqual([]);
  });

  it('DHCP snooping workbook end to end', () => {
    start('dhcp-snooping');
    run('sw', 'conf t', 'ip dhcp snooping', 'ip dhcp snooping vlan 1', 'int g0/23', 'ip dhcp snooping trust', 'end');
    expect(st().renewDhcp('pc', 'Ethernet').ok).toBe(true);
    run('sw', 'conf t', 'ip arp inspection vlan 1', 'int g0/24', 'ip arp inspection trust', 'end');
    const r = grade('dhcp-snooping');
    expect(r.filter((x) => !x.ok), JSON.stringify(r)).toEqual([]);
  });

  it('starting a workbook saves the previous design as a layout', () => {
    st().addDevice('isr4331', 10, 10);
    start('basic-switch');
    expect(st().layouts().some((l) => l.name.startsWith('Before lab: Basic switch'))).toBe(true);
    expect(st().doc!.workbook?.id).toBe('basic-switch');
    expect(st().doc!.devices.some((d) => d.model === 'isr4331')).toBe(false);
  });
});
