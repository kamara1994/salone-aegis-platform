// @vitest-environment jsdom
// The newer lab types (getting started, enterprise builds, security, SOC, wireless): each one is
// solved the way a student would, through the CLI and the editor actions, and must turn fully green.
import { beforeEach, describe, expect, it } from 'vitest';
import { DesignCli } from '@/lab/cli';
import { emptyDoc } from '@/lab/inventory';
import { useLab } from '@/lab/store';
import { gradeWorkbook, labCategory, LAB_CATEGORIES, WORKBOOKS } from '@/lab/workbooks';

const st = () => useLab.getState();
const run = (id: string, ...lines: string[]) => {
  const c = new DesignCli(id);
  c.exec('enable');
  return lines.map((l) => c.exec(l)).join('\n');
};
const start = (id: string) => {
  const wb = WORKBOOKS.find((w) => w.id === id)!;
  st().startWorkbook(wb.build(), wb.id, wb.title);
};
const grade = (id: string) => gradeWorkbook(WORKBOOKS.find((w) => w.id === id)!, st().doc!, st().log);
const failing = (id: string) => grade(id).filter((r) => !r.ok);
const plug = (a: string, pa: string, b: string, pb: string, type: Parameters<ReturnType<typeof st>['connect']>[2]) => {
  const r = st().connect({ device: a, port: pa }, { device: b, port: pb }, type);
  expect(r.ok, JSON.stringify(r.issues)).toBe(true);
};
const netsh = (id: string, nic: string, ip: string, mask: string, gw = '') => run(id, `netsh interface ip set address "${nic}" static ${ip} ${mask} ${gw}`.trim());

beforeEach(() => {
  window.localStorage.clear();
  st().init('wb', emptyDoc(), emptyDoc());
});

describe('lab categories', () => {
  it('every lab has a category, and every category has labs', () => {
    for (const w of WORKBOOKS) expect(LAB_CATEGORIES).toContain(labCategory(w));
    for (const c of LAB_CATEGORIES) expect(WORKBOOKS.some((w) => labCategory(w) === c), c).toBe(true);
  });
});

describe('new labs solve end to end', () => {
  it('first network', () => {
    start('first-network');
    expect(failing('first-network').map((r) => r.id)).toEqual(['cable', 'ip', 'ping', 'console']);
    plug('pc1', 'Ethernet', 's1', 'Gi0/1', 'straight');
    plug('pc2', 'Ethernet', 's1', 'Gi0/2', 'straight');
    netsh('pc1', 'Ethernet', '192.168.1.10', '255.255.255.0');
    netsh('pc2', 'Ethernet', '192.168.1.11', '255.255.255.0');
    plug('lap', 'USB-Console', 's1', 'Console', 'console');
    expect(failing('first-network')).toEqual([]);
  });

  it('cable types', () => {
    start('cable-types');
    plug('la', 'FastEthernet0', 'lb', 'FastEthernet0', 'crossover');
    plug('s1', 'Gi0/25', 's2', 'Gi0/25', 'fiber');
    plug('r1', 'Se0/1/0', 'r2', 'Se0/1/0', 'serial');
    expect(failing('cable-types')).toEqual([]);
  });

  it('a straight cable between legacy PCs stays down with a reason', () => {
    start('cable-types');
    st().connect({ device: 'la', port: 'FastEthernet0' }, { device: 'lb', port: 'FastEthernet0' }, 'straight');
    expect(failing('cable-types').find((r) => r.id === 'xover')?.detail).toMatch(/no link|not cabled/);
  });

  it('subnet plan', () => {
    start('subnet-plan');
    run('r1', 'conf t', 'int g0/0/0', 'ip address 192.168.50.1 255.255.255.192', 'int g0/0/1', 'ip address 192.168.50.65 255.255.255.192', 'int g0/0/2', 'ip address 192.168.50.129 255.255.255.192', 'end');
    netsh('pc1', 'Ethernet', '192.168.50.2', '255.255.255.192', '192.168.50.1');
    netsh('pc2', 'Ethernet', '192.168.50.66', '255.255.255.192', '192.168.50.65');
    netsh('pc3', 'Ethernet', '192.168.50.130', '255.255.255.192', '192.168.50.129');
    expect(failing('subnet-plan')).toEqual([]);
  });

  it('small office', () => {
    start('small-office');
    plug('sw', 'Gi0/24', 'edge', 'Gi0/0/0', 'straight');
    plug('prn', 'eth0', 'sw', 'Gi0/5', 'straight');
    run('edge', 'conf t', 'int g0/0/0', 'ip address 192.168.10.1 255.255.255.0', 'ip nat inside', 'no shutdown', 'int g0/0/1', 'ip nat outside', 'exit', 'ip dhcp pool OFFICE', 'network 192.168.10.0 255.255.255.0', 'default-router 192.168.10.1', 'dns-server 203.0.113.53', 'exit', 'access-list 1 permit 192.168.10.0 0.0.0.255', 'ip nat inside source list 1 interface g0/0/1 overload', 'end');
    for (const pc of ['pc1', 'pc2', 'pc3']) run(pc, 'ipconfig /renew');
    st().updateIface('prn', 'eth0', { ip: '192.168.10.5', prefix: 24, gateway: '192.168.10.1', dhcp: false });
    expect(failing('small-office')).toEqual([]);
  });

  it('enterprise campus', () => {
    start('enterprise-campus');
    for (const s of ['core', 'a1', 'a2']) run(s, 'conf t', 'vlan 10', 'name STAFF', 'vlan 20', 'name SERVERS', 'vlan 30', 'name GUEST', 'end');
    run('a1', 'conf t', 'int g0/1', 'switchport mode access', 'switchport access vlan 10', 'int g0/24', 'switchport mode trunk', 'end');
    run('a2', 'conf t', 'int g0/1', 'switchport mode access', 'switchport access vlan 10', 'int g0/2', 'switchport mode access', 'switchport access vlan 30', 'int g0/24', 'switchport mode trunk', 'end');
    run('core', 'conf t', 'int g1/0/1', 'switchport mode trunk', 'int g1/0/2', 'switchport mode trunk', 'int g1/0/10', 'switchport mode access', 'switchport access vlan 20', 'exit', 'ip routing', 'int vlan 10', 'ip address 10.10.10.1 255.255.255.0', 'no shutdown', 'int vlan 20', 'ip address 10.10.20.1 255.255.255.0', 'no shutdown', 'int vlan 30', 'ip address 10.10.30.1 255.255.255.0', 'no shutdown', 'int g1/0/24', 'no switchport', 'ip address 10.255.0.1 255.255.255.252', 'no shutdown', 'exit', 'ip route 0.0.0.0 0.0.0.0 10.255.0.2', 'end');
    expect(failing('enterprise-campus').map((r) => r.id)).toEqual(['guest']);
    run('core', 'conf t', 'ip access-list extended GUEST-IN', 'deny ip 10.10.30.0 0.0.0.255 10.10.20.0 0.0.0.255', 'permit ip any any', 'exit', 'int vlan 30', 'ip access-group GUEST-IN in', 'end');
    expect(failing('enterprise-campus')).toEqual([]);
  });

  it('firewall DMZ', () => {
    start('firewall-dmz');
    expect(failing('firewall-dmz').map((r) => r.id)).toEqual(expect.arrayContaining(['lan-out', 'publish']));
    st().setRules('fw', [
      { id: 1, iface: 'LAN', src: 'LAN net', dst: 'any', proto: 'any', port: 'any', action: 'pass', log: false, enabled: true, descr: 'LAN out' },
      { id: 2, iface: 'WAN', src: 'any', dst: '172.16.50.10', proto: 'tcp', port: '443', action: 'pass', log: true, enabled: true, descr: 'Publish WEB' },
      { id: 3, iface: 'DMZ', src: 'any', dst: 'LAN net', proto: 'any', port: 'any', action: 'block', log: true, enabled: true, descr: 'DMZ never into LAN' },
    ]);
    expect(failing('firewall-dmz')).toEqual([]);
  });

  it('SOC investigation', () => {
    start('soc-investigate');
    run('sw', 'conf t', 'monitor session 1 source interface g0/10', 'monitor session 1 destination interface g0/20', 'int g0/7', 'description SUSPECT INC-4471', 'exit', 'vlan 999', 'name QUARANTINE', 'exit', 'int g0/7', 'switchport access vlan 999', 'end');
    for (const p of ['g0/3', 'g0/4', 'g0/8']) run('sw', 'conf t', `int ${p}`, 'switchport mode access', 'switchport port-security', 'switchport port-security maximum 1', 'switchport port-security mac-address sticky', 'switchport port-security violation restrict', 'end');
    expect(failing('soc-investigate')).toEqual([]);
  });

  it('wireless office', () => {
    start('wireless-office');
    plug('ap', 'Gi0', 'sw', 'Gi0/1', 'straight');
    st().updateDevice('ap', { wireless: { ssid: 'OFFICE-WIFI', security: 'wpa2', key: 'Salone2026!' } });
    st().updateDevice('lap', { wireless: { ssid: 'OFFICE-WIFI', security: 'wpa2', key: 'Salone2026!' } });
    plug('lap', 'Wi-Fi', 'ap', 'radio0', 'virtual');
    run('lap', 'ipconfig /renew');
    expect(failing('wireless-office')).toEqual([]);
  });
});
