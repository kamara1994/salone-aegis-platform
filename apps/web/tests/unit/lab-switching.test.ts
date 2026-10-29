// @vitest-environment jsdom
// CCNA/CCNP switching and routing features: port security, BPDU/root guard, DTP, VTP, DHCP snooping,
// DAI, layer 3 switching, IOS ACLs, static NAT, VRRP/GLBP and EIGRP, driven through the CLI.
import { beforeEach, describe, expect, it } from 'vitest';
import { DesignCli } from '@/lab/cli';
import { emptyDoc } from '@/lab/inventory';
import { controlPlane } from '@/lab/protocols';
import { ping, simulatePacket } from '@/lab/simulate';
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

describe('port security', () => {
  it('sticky learns the first PC; a swapped PC err-disables the port; shutdown/no shutdown recovers', () => {
    const sw = add('c2960x24', 'SW1');
    const pc1 = add('optiplex', 'PC1');
    const pc9 = add('optiplex', 'PC9');
    host(pc1, '10.1.1.11');
    host(pc9, '10.1.1.99');
    const srv = add('optiplex', 'SRV');
    host(srv, '10.1.1.200');
    wire(sw, 'Gi0/2', srv, 'Ethernet');
    const c = wire(sw, 'Gi0/1', pc1, 'Ethernet');
    run(sw, 'enable', 'conf t', 'interface g0/1', 'switchport mode access', 'switchport port-security', 'switchport port-security mac-address sticky', 'end');
    expect(port(sw, 'Gi0/1').portSecurity!.macs).toEqual([port(pc1, 'Ethernet').mac.toLowerCase()]);
    expect(reach(pc1, '10.1.1.200').status).toBe('delivered');
    // An unknown laptop is plugged into the same wall jack.
    st().removeCable(c);
    wire(sw, 'Gi0/1', pc9, 'Ethernet');
    expect(port(sw, 'Gi0/1').errDisabled).toMatch(/port-security violation/);
    const t = reach(pc9, '10.1.1.200');
    expect(t.status).toBe('dropped');
    expect(t.reason).toMatch(/err-disabled/);
    expect(run(sw, 'enable', 'show interfaces status err-disabled')).toMatch(/Gi0\/1.*psecure-violation/);
    expect(st().log.some((l) => /PSECURE_VIOLATION/.test(l.text))).toBe(true);
    // Put the right PC back and bounce the port.
    st().removeCable(st().doc!.cables.find((x) => x.a.device === pc9 || x.b.device === pc9)!.id);
    wire(sw, 'Gi0/1', pc1, 'Ethernet');
    run(sw, 'enable', 'conf t', 'int g0/1', 'shutdown', 'no shutdown', 'end');
    expect(port(sw, 'Gi0/1').errDisabled).toBeUndefined();
    expect(reach(pc1, '10.1.1.200').status).toBe('delivered');
  });

  it('restrict mode drops frames from an unknown MAC without err-disabling', () => {
    const sw = add('c2960x24');
    const pc = add('optiplex');
    const srv = add('optiplex');
    host(pc, '10.1.1.11');
    host(srv, '10.1.1.200');
    wire(sw, 'Gi0/1', pc, 'Ethernet');
    wire(sw, 'Gi0/2', srv, 'Ethernet');
    run(sw, 'enable', 'conf t', 'int g0/1', 'switchport mode access', 'switchport port-security', 'switchport port-security violation restrict', 'switchport port-security mac-address 0011.2233.4455', 'end');
    expect(port(sw, 'Gi0/1').errDisabled).toBeUndefined();
    const t = reach(pc, '10.1.1.200');
    expect(t.status).toBe('dropped');
    expect(t.reason).toMatch(/port security .*restrict/);
  });

  it('refuses port security on a dynamic port, like IOS', () => {
    const sw = add('c2960x24');
    expect(run(sw, 'enable', 'conf t', 'int g0/3', 'switchport mode dynamic auto', 'switchport port-security')).toMatch(/dynamic port/);
  });
});

describe('spanning-tree protection', () => {
  it('BPDU guard err-disables an edge port when a switch is plugged in', () => {
    const a = add('c2960x24', 'ACC1');
    const rogue = add('c2960x24', 'ROGUE');
    run(a, 'enable', 'conf t', 'spanning-tree portfast bpduguard default', 'int g0/5', 'spanning-tree portfast', 'end');
    wire(a, 'Gi0/5', rogue, 'Gi0/1', 'crossover');
    expect(port(a, 'Gi0/5').errDisabled).toMatch(/BPDU guard/);
    expect(st().log.some((l) => /BLOCK_BPDUGUARD/.test(l.text))).toBe(true);
  });

  it('root guard keeps the core as root when a new switch claims priority 0', () => {
    const core = add('c2960x24', 'CORE');
    const dist = add('c2960x24', 'DIST');
    const rogue = add('c2960x24', 'ROGUE');
    run(core, 'enable', 'conf t', 'spanning-tree vlan 1 priority 4096', 'end');
    wire(core, 'Gi0/1', dist, 'Gi0/1', 'trunk');
    run(dist, 'enable', 'conf t', 'int g0/2', 'spanning-tree guard root', 'end');
    wire(dist, 'Gi0/2', rogue, 'Gi0/1', 'trunk');
    run(rogue, 'enable', 'conf t', 'spanning-tree vlan 1 priority 0', 'end');
    const cp = controlPlane(st().doc!);
    expect(cp.stp[core].isRoot).toBe(true);
    expect(cp.stp[dist].ports['Gi0/2'].role).toBe('root-inconsistent');
    expect(run(dist, 'enable', 'show spanning-tree')).toMatch(/ROOT_Inc/);
  });
});

describe('DTP and VTP', () => {
  it('dynamic auto + auto stays access; desirable + auto becomes a trunk', () => {
    const a = add('c2960x24');
    const b = add('c2960x24');
    wire(a, 'Gi0/1', b, 'Gi0/1', 'crossover');
    run(a, 'enable', 'conf t', 'int g0/1', 'switchport mode dynamic auto', 'end');
    run(b, 'enable', 'conf t', 'int g0/1', 'switchport mode dynamic auto', 'end');
    expect(port(a, 'Gi0/1').mode).toBe('access');
    run(b, 'conf t', 'int g0/1', 'switchport mode dynamic desirable', 'end');
    expect(port(a, 'Gi0/1').mode).toBe('trunk');
    expect(port(b, 'Gi0/1').mode).toBe('trunk');
  });

  it('a VTP client learns VLANs from the server; a client cannot create VLANs', () => {
    const srv = add('c2960x24', 'VTP-SRV');
    const cli = add('c2960x24', 'VTP-CLI');
    run(srv, 'enable', 'conf t', 'vtp domain LAB', 'vtp mode server', 'int g0/1', 'switchport mode trunk', 'exit', 'vlan 10', 'name SALES', 'exit', 'vlan 20', 'name HR', 'end');
    run(cli, 'enable', 'conf t', 'vtp domain LAB', 'vtp mode client', 'int g0/1', 'switchport mode trunk', 'end');
    wire(srv, 'Gi0/1', cli, 'Gi0/1', 'trunk');
    expect(dev(cli).vlans[10]).toBe('SALES');
    expect(dev(cli).vtp!.revision).toBe(dev(srv).vtp!.revision);
    expect(run(cli, 'enable', 'conf t', 'vlan 30')).toMatch(/not allowed when device is in CLIENT mode/);
  });

  it('the VTP bomb: a lab switch with a higher revision wipes production VLANs', () => {
    const prod = add('c2960x24', 'PROD');
    const lab = add('c2960x24', 'OLD-LAB');
    run(prod, 'enable', 'conf t', 'vtp domain CORP', 'vtp mode server', 'vlan 10', 'name USERS', 'exit', 'vlan 20', 'name VOICE', 'end');
    run(lab, 'enable', 'conf t', 'vtp domain CORP', 'vtp mode server');
    for (let k = 0; k < 6; k++) run(lab, 'conf t', `vlan ${100 + k}`, 'exit');
    expect(dev(lab).vtp!.revision).toBeGreaterThan(dev(prod).vtp!.revision);
    run(prod, 'conf t', 'int g0/24', 'switchport mode trunk', 'end');
    run(lab, 'int g0/24', 'switchport mode trunk', 'end');
    wire(prod, 'Gi0/24', lab, 'Gi0/24', 'trunk');
    expect(dev(prod).vlans[10]).toBeUndefined();
    expect(st().log.some((l) => l.deviceId === prod && /VLANs removed: .*10/.test(l.text))).toBe(true);
  });
});

describe('DHCP snooping and dynamic ARP inspection', () => {
  function lan() {
    const sw = add('c2960x24', 'SW');
    const r = add('isr4331', 'R1');
    const srv = add('services-server', 'DHCP');
    const pc = add('optiplex', 'PC');
    const kali = add('kali-workstation', 'KALI');
    run(r, 'enable', 'conf t', 'int g0/0/0', 'ip address 10.10.10.1 255.255.255.0', 'no shut', 'end');
    st().updateIface(srv, 'eno1', { ip: '10.10.10.5', prefix: 24, gateway: '10.10.10.1' });
    st().updateDevice(srv, { dhcpPools: [{ name: 'LAN', network: '10.10.10.0/24', start: '10.10.10.100', end: '10.10.10.150', gateway: '10.10.10.1' }] });
    st().updateIface(kali, 'Ethernet', { ip: '10.10.10.66', prefix: 24 });
    st().updateDevice(kali, { dhcpPools: [{ name: 'EVIL', network: '10.10.10.0/24', start: '10.10.10.200', end: '10.10.10.210', gateway: '10.10.10.66' }] });
    st().updateIface(pc, 'Ethernet', { dhcp: true });
    wire(sw, 'Gi0/1', pc, 'Ethernet');
    wire(sw, 'Gi0/2', kali, 'Ethernet');
    wire(sw, 'Gi0/23', srv, 'eno1');
    wire(sw, 'Gi0/24', r, 'Gi0/0/0');
    return { sw, r, srv, pc, kali };
  }

  it('without snooping the closest (rogue) server can win; snooping with a trusted uplink stops it', () => {
    const { sw, pc } = lan();
    const before = st().renewDhcp(pc, 'Ethernet');
    expect(before.ok).toBe(true);
    expect(before.server).toMatch(/KALI|DHCP/);
    run(sw, 'enable', 'conf t', 'ip dhcp snooping', 'ip dhcp snooping vlan 1', 'end');
    const blocked = st().renewDhcp(pc, 'Ethernet');
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/DHCP snooping on SW dropped the DHCPOFFER/);
    run(sw, 'conf t', 'int g0/23', 'ip dhcp snooping trust', 'end');
    const good = st().renewDhcp(pc, 'Ethernet');
    expect(good.ok, good.reason).toBe(true);
    expect(good.server).toMatch(/^DHCP/);
    expect(good.gateway).toBe('10.10.10.1');
    expect(run(sw, 'enable', 'show ip dhcp snooping binding')).toMatch(/dhcp-snooping/);
  });

  it('DAI drops ARP from a static host on an untrusted port and lets DHCP clients through', () => {
    const { sw, pc, kali } = lan();
    run(sw, 'enable', 'conf t', 'ip dhcp snooping', 'ip dhcp snooping vlan 1', 'ip arp inspection vlan 1', 'int g0/23', 'ip dhcp snooping trust', 'int g0/24', 'ip dhcp snooping trust', 'end');
    expect(st().renewDhcp(pc, 'Ethernet').ok).toBe(true);
    expect(reach(pc, '10.10.10.1').status).toBe('delivered');
    const t = reach(kali, '10.10.10.1');
    expect(t.status).toBe('dropped');
    expect(t.reason).toMatch(/dynamic ARP inspection on SW dropped the ARP from KALI/);
  });
});

describe('routing features', () => {
  it('inter-VLAN routing on a layer 3 switch needs ip routing', () => {
    const l3 = add('c9300-24t', 'CORE');
    const a = add('optiplex', 'PC10');
    const b = add('optiplex', 'PC20');
    host(a, '192.168.10.10', '192.168.10.1');
    host(b, '192.168.20.10', '192.168.20.1');
    wire(l3, 'Gi1/0/1', a, 'Ethernet');
    wire(l3, 'Gi1/0/2', b, 'Ethernet');
    run(l3, 'enable', 'conf t', 'vlan 10', 'exit', 'vlan 20', 'exit', 'int g1/0/1', 'switchport access vlan 10', 'int g1/0/2', 'switchport access vlan 20', 'exit', 'interface vlan 10', 'ip address 192.168.10.1 255.255.255.0', 'no shut', 'exit', 'interface vlan 20', 'ip address 192.168.20.1 255.255.255.0', 'no shut', 'end');
    const off = reach(a, '192.168.20.10');
    expect(off.status).toBe('dropped');
    expect(off.reason).toMatch(/switch without ip routing/);
    run(l3, 'conf t', 'ip routing', 'end');
    expect(reach(a, '192.168.20.10').status).toBe('delivered');
  });

  function twoNets() {
    const r = add('isr4331', 'R1');
    const a = add('optiplex', 'LAN-PC');
    const b = add('services-server', 'SRV');
    host(a, '10.1.1.10', '10.1.1.1');
    st().updateIface(b, 'eno1', { ip: '10.2.2.10', prefix: 24, gateway: '10.2.2.1' });
    st().updateDevice(b, { listening: [22, 80, 443] });
    wire(r, 'Gi0/0/0', a, 'Ethernet');
    wire(r, 'Gi0/0/1', b, 'eno1');
    run(r, 'enable', 'conf t', 'int g0/0/0', 'ip address 10.1.1.1 255.255.255.0', 'no shut', 'int g0/0/1', 'ip address 10.2.2.1 255.255.255.0', 'no shut', 'end');
    return { r, a, b };
  }

  it('an extended named ACL denies SSH, permits web, and ends with an implicit deny', () => {
    const { r, a } = twoNets();
    run(r, 'enable', 'conf t', 'ip access-list extended LAN-IN', 'deny tcp 10.1.1.0 0.0.0.255 host 10.2.2.10 eq 22', 'permit tcp any any eq www', 'exit', 'int g0/0/0', 'ip access-group LAN-IN in', 'end');
    const ssh = simulatePacket(st().doc!, { srcDevice: a, dst: '10.2.2.10', proto: 'tcp', port: 22 });
    st().addTrace([ssh]);
    expect(ssh.status).toBe('blocked');
    expect(ssh.reason).toMatch(/LAN-IN inbound on R1 Gi0\/0\/0: 10 deny tcp/);
    expect(simulatePacket(st().doc!, { srcDevice: a, dst: '10.2.2.10', proto: 'tcp', port: 80 }).status).toBe('delivered');
    const icmp = reach(a, '10.2.2.10');
    expect(icmp.status).toBe('blocked');
    expect(icmp.reason).toMatch(/implicit deny/);
    expect(run(r, 'enable', 'show access-lists')).toMatch(/Extended IP access list LAN-IN[\s\S]*10 deny tcp .*\(1 matches\)/);
  });

  it('a standard numbered ACL applied outbound filters by source', () => {
    const { r, a } = twoNets();
    run(r, 'enable', 'conf t', 'access-list 10 deny host 10.1.1.10', 'access-list 10 permit any', 'int g0/0/1', 'ip access-group 10 out', 'end');
    const t = reach(a, '10.2.2.10');
    expect(t.status).toBe('blocked');
    expect(t.reason).toMatch(/access list 10 outbound/);
  });

  it('static NAT publishes an inside server on an outside address', () => {
    const r = add('isr4331', 'EDGE');
    const web = add('services-server', 'WEB');
    const isp = add('optiplex', 'INTERNET-PC');
    st().updateIface(web, 'eno1', { ip: '192.168.1.10', prefix: 24, gateway: '192.168.1.1' });
    host(isp, '203.0.113.50', '203.0.113.1');
    wire(r, 'Gi0/0/0', web, 'eno1');
    wire(r, 'Gi0/0/1', isp, 'Ethernet');
    run(r, 'enable', 'conf t', 'int g0/0/0', 'ip address 192.168.1.1 255.255.255.0', 'ip nat inside', 'no shut', 'int g0/0/1', 'ip address 203.0.113.1 255.255.255.0', 'ip nat outside', 'no shut', 'exit', 'ip nat inside source static 192.168.1.10 203.0.113.10', 'end');
    const t = reach(isp, '203.0.113.10');
    expect(t.status, t.reason).toBe('delivered');
    expect(t.hops.some((h) => h.decision === 'nat' && /203\.0\.113\.10 translated to inside local 192\.168\.1\.10/.test(h.info))).toBe(true);
    expect(run(r, 'enable', 'show ip nat translations')).toMatch(/203\.0\.113\.10\s+192\.168\.1\.10/);
  });

  it('VRRP elects a master; GLBP spreads hosts across forwarders', () => {
    const r1 = add('isr4331', 'R1');
    const r2 = add('isr4331', 'R2');
    const sw = add('c2960x24', 'SW');
    wire(r1, 'Gi0/0/0', sw, 'Gi0/1');
    wire(r2, 'Gi0/0/0', sw, 'Gi0/2');
    run(r1, 'enable', 'conf t', 'int g0/0/0', 'ip address 10.0.0.2 255.255.255.0', 'no shut', 'vrrp 1 ip 10.0.0.1', 'vrrp 1 priority 120', 'end');
    run(r2, 'enable', 'conf t', 'int g0/0/0', 'ip address 10.0.0.3 255.255.255.0', 'no shut', 'vrrp 1 ip 10.0.0.1', 'end');
    const g = controlPlane(st().doc!).hsrp.find((x) => x.proto === 'vrrp')!;
    expect(g.active?.device).toBe(r1);
    expect(run(r1, 'enable', 'show vrrp brief')).toMatch(/Master/);
    run(r1, 'conf t', 'int g0/0/0', 'no vrrp 1', 'glbp 1 ip 10.0.0.1', 'end');
    run(r2, 'conf t', 'int g0/0/0', 'no vrrp 1', 'glbp 1 ip 10.0.0.1', 'end');
    expect(controlPlane(st().doc!).l2.glbp?.get('10.0.0.1')).toHaveLength(2);
  });

  it('EIGRP learns remote networks with AD 90 and explains an AS mismatch', () => {
    const r1 = add('isr4331', 'R1');
    const r2 = add('isr4331', 'R2');
    wire(r1, 'Gi0/0/1', r2, 'Gi0/0/1', 'crossover');
    run(r1, 'enable', 'conf t', 'int g0/0/1', 'ip address 10.12.0.1 255.255.255.252', 'no shut', 'int lo0', 'ip address 1.1.1.1 255.255.255.255', 'exit', 'router eigrp 100', 'network 10.12.0.0 0.0.0.3', 'network 1.1.1.1 0.0.0.0', 'no auto-summary', 'end');
    run(r2, 'enable', 'conf t', 'int g0/0/1', 'ip address 10.12.0.2 255.255.255.252', 'no shut', 'int lo0', 'ip address 2.2.2.2 255.255.255.255', 'exit', 'router eigrp 100', 'network 10.0.0.0', 'network 2.2.2.2 0.0.0.0', 'end');
    const routes = controlPlane(st().doc!).routes[r1];
    expect(routes.some((x) => x.prefix === '2.2.2.2/32' && x.code === 'D' && x.ad === 90)).toBe(true);
    expect(run(r1, 'enable', 'show ip route')).toMatch(/D\s+2\.2\.2\.2\/32 \[90\//);
    expect(run(r1, 'show ip eigrp neighbors')).toMatch(/10\.12\.0\.2/);
    expect(reach(r1, '2.2.2.2').status).toBe('delivered');
    run(r2, 'conf t', 'no router eigrp 100', 'router eigrp 200', 'network 10.0.0.0', 'end');
    const nb = controlPlane(st().doc!).eigrp.find((x) => x.device === r1)!;
    expect(nb.up).toBe(false);
    expect(nb.reason).toMatch(/autonomous system mismatch/);
  });
});
