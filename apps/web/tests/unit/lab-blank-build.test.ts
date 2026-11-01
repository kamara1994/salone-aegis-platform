// @vitest-environment jsdom
// Blank-canvas labs: the student places, names, cables and configures everything, like Packet Tracer
// with no starting network. Grading matches devices by hostname against the lab's reference design.
import { beforeEach, describe, expect, it } from 'vitest';
import { arenaLab } from '@/lab/arena';
import { gradeArena } from '@/lab/arena/grade';
import { resetArenaCache } from '@/lab/arena/progress';
import { startArena } from '@/lab/arena/session';
import { DesignCli } from '@/lab/cli';
import { emptyDoc } from '@/lab/inventory';
import { useLab } from '@/lab/store';

const st = () => useLab.getState();
const grade = (id: string) => gradeArena(arenaLab(id)!, st().doc!, st().log);
const sh = (id: string, ...lines: string[]) => {
  const c = new DesignCli(id);
  if (!st().doc!.devices.find((d) => d.id === id)!.model.includes('optiplex')) c.exec('enable');
  return lines.map((l) => c.exec(l)).join('\n');
};

beforeEach(() => {
  window.localStorage.clear();
  resetArenaCache();
  st().init('blank', emptyDoc(), emptyDoc());
});

/** What a student does in "Your first VLANs": place, name, cable, address, configure. */
function buildFirstVlans(opts: { pc3Port?: string; swName?: string } = {}) {
  startArena('vlan-first');
  expect(st().doc!.devices).toHaveLength(0);
  const sw = st().addDevice('c2960x24', 400, 100);
  sh(sw, 'conf t', `hostname ${opts.swName ?? 'ACC1'}`, 'end');
  const pcs: [string, string, string][] = [
    ['STAFF-PC1', 'Gi0/1', '10.10.10.11'],
    ['STAFF-PC2', 'Gi0/2', '10.10.10.12'],
    ['GUEST-PC1', opts.pc3Port ?? 'Gi0/3', '10.10.20.21'],
    ['GUEST-PC2', 'Gi0/4', '10.10.20.22'],
  ];
  for (const [name, port, ip] of pcs) {
    const pc = st().addDevice('optiplex', 100, 300);
    st().updateDevice(pc, { name });
    expect(st().connect({ device: pc, port: 'Ethernet' }, { device: sw, port }, 'straight').ok).toBe(true);
    expect(sh(pc, `netsh interface ip set address "Ethernet" static ${ip} 255.255.255.0`)).toBe('Ok.');
  }
  sh(sw, 'conf t', 'vlan 10', 'name STAFF', 'vlan 20', 'name GUEST', 'exit', 'interface range g0/1 - 2', 'switchport mode access', 'switchport access vlan 10', 'exit', 'interface range g0/3 - 4', 'switchport mode access', 'switchport access vlan 20', 'end');
}

describe('blank-canvas build labs', () => {
  it('start empty and score nothing until the student builds', () => {
    startArena('vlan-first');
    const g = grade('vlan-first');
    expect(st().doc!.devices).toHaveLength(0);
    expect(g.topology.filter((t) => t.ok)).toHaveLength(0);
    expect(g.pct).toBeLessThan(30); // only the "blocked" isolation test passes on an empty canvas
  });

  it('a student who builds and configures it from scratch scores 100%', () => {
    buildFirstVlans();
    const g = grade('vlan-first');
    expect([...g.topology, ...g.items, ...g.tests].filter((x) => !x.ok).map((x) => `${x.id}: ${x.detail}`)).toEqual([]);
    expect(g.pct).toBe(100);
  });

  it('a cable on the wrong port is marked, with the reason', () => {
    buildFirstVlans({ pc3Port: 'Gi0/7' });
    const cab = grade('vlan-first').topology.find((t) => t.text.startsWith('ACC1 Gi0/3') || t.text.includes('ACC1 Gi0/3'))!;
    expect(cab.ok).toBe(false);
    expect(cab.detail).toMatch(/not on Gi0\/3|not connected/);
  });

  it('a device with the wrong hostname is not found', () => {
    buildFirstVlans({ swName: 'Switch0' });
    const dev = grade('vlan-first').topology.find((t) => t.id === 'dev:sw1')!;
    expect(dev.ok).toBe(false);
    expect(dev.detail).toMatch(/no device named ACC1/);
  });

  it('routers start with their interfaces shut down, like IOS', () => {
    const r = st().addDevice('isr4331', 0, 0);
    expect(st().doc!.devices.find((d) => d.id === r)!.interfaces.find((i) => i.name === 'Gi0/0/0')!.shutdown).toBe(true);
  });
});
