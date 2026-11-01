// @vitest-environment jsdom
// The classic CCNA lab gear added to the library: 2960-24TT, 3650 multilayer switch and ISR 2911.
import { beforeEach, describe, expect, it } from 'vitest';
import { DesignCli } from '@/lab/cli';
import { CATALOG } from '@/lab/catalog';
import { emptyDoc } from '@/lab/inventory';
import { ping } from '@/lab/simulate';
import { useLab } from '@/lab/store';
import { suggestCableType } from '@/lab/validate';

const st = () => useLab.getState();
const dev = (id: string) => st().doc!.devices.find((d) => d.id === id)!;
const port = (id: string, p: string) => dev(id).interfaces.find((i) => i.name === p)!;
const run = (id: string, ...lines: string[]) => {
  const c = new DesignCli(id);
  if (lines[0] !== 'enable') c.exec('enable');
  return lines.map((l) => c.exec(l)).join('\n');
};
let n = 0;
function add(model: string, name?: string) {
  const id = st().addDevice(model, (n += 160), 100);
  if (name) st().updateDevice(id, { name });
  return id;
}
function wire(a: string, pa: string, b: string, pb: string, type?: Parameters<ReturnType<typeof st>['connect']>[2]) {
  const t = type ?? suggestCableType(st().doc!, { device: a, port: pa }, { device: b, port: pb });
  const r = st().connect({ device: a, port: pa }, { device: b, port: pb }, t);
  expect(r.ok, JSON.stringify(r.issues)).toBe(true);
  return r.id!;
}
const host = (id: string, ip: string, gw?: string, prefix = 24) => st().updateIface(id, 'Ethernet', { ip, prefix, gateway: gw, dhcp: false });
const reach = (src: string, dst: string) => ping(st().doc!, src, dst, 1)[0];

beforeEach(() => {
  window.localStorage.clear();
  const d = emptyDoc();
  st().init('test', d, emptyDoc());
  n = 0;
});

describe('classic CCNA gear', () => {
  it('is in the library with the real port names', () => {
    const ports = (k: string) => CATALOG.find((m) => m.key === k)!.ports().map((p) => p.name);
    expect(ports('c2960-24tt')).toEqual(expect.arrayContaining(['Fa0/1', 'Fa0/24', 'Gi0/1', 'Gi0/2', 'Console']));
    expect(ports('c3650-24ps')).toEqual(expect.arrayContaining(['Gi1/0/1', 'Gi1/0/24', 'Gi1/1/4']));
    expect(ports('isr2911')).toEqual(expect.arrayContaining(['Gi0/0', 'Gi0/2', 'Se0/0/0', 'Se0/0/1']));
  });

  it('a 2960-24TT access port runs at Fast Ethernet speed and passes traffic', () => {
    const sw = add('c2960-24tt', 'SW1');
    const a = add('optiplex', 'PC1');
    const b = add('optiplex', 'PC2');
    host(a, '10.0.0.1');
    host(b, '10.0.0.2');
    wire(sw, 'Fa0/1', a, 'Ethernet');
    wire(sw, 'Fa0/2', b, 'Ethernet');
    expect(reach(a, '10.0.0.2').status).toBe('delivered');
    expect(run(sw, 'enable', 'show interfaces status')).toMatch(/Fa0\/1/);
  });

  it('the 3650 routes between VLANs once ip routing is on', () => {
    const l3 = add('c3650-24ps', 'DLS1');
    const a = add('optiplex', 'PC10');
    const b = add('optiplex', 'PC20');
    host(a, '192.168.10.10', '192.168.10.1');
    host(b, '192.168.20.10', '192.168.20.1');
    wire(l3, 'Gi1/0/1', a, 'Ethernet');
    wire(l3, 'Gi1/0/2', b, 'Ethernet');
    run(l3, 'enable', 'conf t', 'vlan 10', 'exit', 'vlan 20', 'exit', 'int g1/0/1', 'switchport access vlan 10', 'int g1/0/2', 'switchport access vlan 20', 'exit', 'interface vlan 10', 'ip address 192.168.10.1 255.255.255.0', 'no shut', 'exit', 'interface vlan 20', 'ip address 192.168.20.1 255.255.255.0', 'no shut', 'end');
    expect(reach(a, '192.168.20.10').status).toBe('dropped');
    run(l3, 'conf t', 'ip routing', 'end');
    expect(reach(a, '192.168.20.10').status).toBe('delivered');
  });

  it('cable and DSL internet: coax and phone cables only fit their own ports, and the modem bridges to the ISP', () => {
    const isp = add('internet', 'ISP');
    const cm = add('cable-modem', 'CM');
    const pc = add('optiplex', 'HOME-PC');
    expect(suggestCableType(st().doc!, { device: cm, port: 'Cable' }, { device: isp, port: 'cable0' })).toBe('coax');
    // a coax cable will not go on an RJ-45 port
    const bad = st().connect({ device: cm, port: 'Ethernet' }, { device: pc, port: 'Ethernet' }, 'coax');
    expect(bad.ok).toBe(false);
    wire(cm, 'Cable', isp, 'cable0');
    wire(cm, 'Ethernet', pc, 'Ethernet');
    st().updateIface(isp, 'cable0', { ip: '100.64.0.1', prefix: 24, shutdown: false });
    host(pc, '100.64.0.20', '100.64.0.1');
    expect(reach(pc, '100.64.0.1').status).toBe('delivered');
    const dsl = add('dsl-modem', 'DSL');
    expect(suggestCableType(st().doc!, { device: dsl, port: 'DSL' }, { device: isp, port: 'dsl0' })).toBe('phone');
    wire(dsl, 'DSL', isp, 'dsl0');
  });
});
