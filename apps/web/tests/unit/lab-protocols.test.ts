// @vitest-environment jsdom
// Control plane and CLI: STP, EtherChannel, OSPF, HSRP, NAT, DHCP relay, PoE, wireless and the IOS CLI.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Topology } from '@/api/types';
import { DesignCli } from '@/lab/cli';
import { buildDoc } from '@/lab/inventory';
import { controlPlane, poeUsage } from '@/lab/protocols';
import { simulatePacket } from '@/lab/simulate';
import { useLab } from '@/lab/store';
import { MockEngine } from '@/mock/engine';
import { initialLab } from '@/mock/lab';

let topo: Topology;
beforeAll(async () => {
  window.localStorage.clear();
  topo = await new MockEngine().getTopology();
});
beforeEach(() => {
  window.localStorage.removeItem('aegis.lab.draft.v1:simulated-lab');
  const doc = buildDoc(topo, initialLab());
  useLab.getState().init(doc.source, doc, buildDoc(topo, initialLab()));
});
const st = () => useLab.getState();
const dev = (id: string) => st().doc!.devices.find((d) => d.id === id)!;
const byName = (n: string) => st().doc!.devices.find((d) => d.name === n)!;
const run = (cli: DesignCli, ...lines: string[]) => lines.map((l) => cli.exec(l)).join('\n');

describe('DHCP', () => {
  it('a VLAN 20 workstation gets a lease from DC01 through the FW01 relay', () => {
    const ws = byName('WS-FIN-07');
    const r = st().renewDhcp(ws.id, 'Ethernet');
    expect(r.ok, r.reason).toBe(true);
    expect(r.ip).toMatch(/^10\.10\.20\./);
    expect(r.via).toContain('FW01');
    expect(r.server).toContain('DC01');
  });

  it('removing the relay explains exactly why there is no offer', () => {
    const fw = byName('FW01');
    st().updateIface(fw.id, 'igb1.20', { helper: undefined });
    const r = st().renewDhcp(byName('WS-FIN-07').id, 'Ethernet');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no DHCP server or relay/);
  });
});

describe('spanning tree and EtherChannel', () => {
  it('a triangle of switches elects a root and blocks exactly one port', () => {
    const a = st().addDevice('c2960x24', 0, 0);
    const b = st().addDevice('c2960x24', 300, 0);
    const c = st().addDevice('c2960x24', 150, 300);
    st().updateDevice(a, { stp: { enabled: true, priority: 4096 } });
    expect(st().connect({ device: a, port: 'Gi0/1' }, { device: b, port: 'Gi0/1' }, 'trunk').ok).toBe(true);
    expect(st().connect({ device: b, port: 'Gi0/2' }, { device: c, port: 'Gi0/2' }, 'trunk').ok).toBe(true);
    expect(st().connect({ device: c, port: 'Gi0/3' }, { device: a, port: 'Gi0/3' }, 'trunk').ok).toBe(true);
    const cp = controlPlane(st().doc!);
    expect(cp.stp[a].isRoot).toBe(true);
    const blocked = [...cp.l2.blocked].filter((k) => [a, b, c].some((id) => k.startsWith(id)));
    expect(blocked).toHaveLength(1);
    const cli = new DesignCli(b);
    expect(run(cli, 'enable', 'show spanning-tree')).toMatch(/Root/);
  });

  it('disabling STP on a looped pair reports a broadcast storm', () => {
    const a = st().addDevice('c2960x24', 0, 0);
    const b = st().addDevice('c2960x24', 300, 0);
    st().connect({ device: a, port: 'Gi0/1' }, { device: b, port: 'Gi0/1' }, 'trunk');
    st().connect({ device: a, port: 'Gi0/2' }, { device: b, port: 'Gi0/2' }, 'trunk');
    st().updateDevice(a, { stp: { enabled: false, priority: 32768 } });
    st().updateDevice(b, { stp: { enabled: false, priority: 32768 } });
    expect(controlPlane(st().doc!).storms.length).toBeGreaterThan(0);
  });

  it('LACP active/passive bundles; on/active is a mismatch the CLI shows', () => {
    const a = st().addDevice('c2960x24', 0, 0);
    const b = st().addDevice('c2960x24', 300, 0);
    st().connect({ device: a, port: 'Gi0/1' }, { device: b, port: 'Gi0/1' }, 'trunk');
    st().connect({ device: a, port: 'Gi0/2' }, { device: b, port: 'Gi0/2' }, 'trunk');
    const ca = new DesignCli(a);
    const cb = new DesignCli(b);
    run(ca, 'enable', 'conf t', 'interface range Gi0/1 - 2', 'channel-group 1 mode active', 'end');
    run(cb, 'enable', 'conf t', 'interface range Gi0/1 - 2', 'channel-group 1 mode passive', 'end');
    expect(controlPlane(st().doc!).channels.filter((c) => c.device === a)[0].ok).toBe(true);
    run(cb, 'conf t', 'interface range Gi0/1 - 2', 'channel-group 1 mode on', 'end');
    const ch = controlPlane(st().doc!).channels.find((c) => c.device === a)!;
    expect(ch.ok).toBe(false);
    expect(run(ca, 'show etherchannel summary')).toMatch(/SD/);
  });
});

describe('routing: OSPF, HSRP, NAT through the CLI', () => {
  function twoRouters() {
    const r1 = st().addDevice('isr4331', 0, 0);
    const r2 = st().addDevice('isr4331', 300, 0);
    st().connect({ device: r1, port: 'Gi0/0/1' }, { device: r2, port: 'Gi0/0/1' }, 'crossover');
    const c1 = new DesignCli(r1);
    const c2 = new DesignCli(r2);
    run(c1, 'enable', 'conf t', 'int g0/0/1', 'ip address 10.0.12.1 255.255.255.252', 'no shut', 'exit', 'interface loopback0', 'ip address 1.1.1.1 255.255.255.255', 'exit', 'router ospf 1', 'network 10.0.12.0 0.0.0.3 area 0', 'network 1.1.1.1 0.0.0.0 area 0', 'end');
    run(c2, 'enable', 'conf t', 'int g0/0/1', 'ip address 10.0.12.2 255.255.255.252', 'no shut', 'exit', 'interface loopback0', 'ip address 2.2.2.2 255.255.255.255', 'exit', 'router ospf 1', 'network 10.0.12.0 0.0.0.3 area 0', 'network 2.2.2.2 0.0.0.0 area 0', 'end');
    return { r1, r2, c1, c2 };
  }

  it('two routers form a FULL adjacency and learn each other’s loopback', () => {
    const { r1, c1 } = twoRouters();
    const cp = controlPlane(st().doc!);
    expect(cp.ospf.find((n) => n.device === r1)?.state).toBe('FULL');
    expect(cp.routes[r1].some((r) => r.prefix === '2.2.2.2/32' && r.kind === 'ospf')).toBe(true);
    expect(run(c1, 'show ip route')).toMatch(/O\s+2\.2\.2\.2\/32 \[110\//);
    expect(run(c1, 'ping 2.2.2.2')).toMatch(/Success rate is 100 percent/);
  });

  it('an area mismatch keeps the neighbour down and says why', () => {
    const { r1, c2 } = twoRouters();
    run(c2, 'conf t', 'int g0/0/1', 'ip ospf 1 area 1', 'end');
    const n = controlPlane(st().doc!).ospf.find((x) => x.device === r1);
    expect(n?.state).not.toBe('FULL');
    expect(n?.reason).toMatch(/area/i);
  });

  it('HSRP elects the higher priority router as active', () => {
    const { r1, r2, c1, c2 } = twoRouters();
    run(c1, 'conf t', 'int g0/0/0', 'ip address 10.9.0.2 255.255.255.0', 'standby 1 ip 10.9.0.1', 'standby 1 priority 110', 'standby 1 preempt', 'end');
    run(c2, 'conf t', 'int g0/0/0', 'ip address 10.9.0.3 255.255.255.0', 'standby 1 ip 10.9.0.1', 'end');
    const sw = st().addDevice('c2960x24', 150, 200);
    st().connect({ device: r1, port: 'Gi0/0/0' }, { device: sw, port: 'Gi0/1' }, 'straight');
    st().connect({ device: r2, port: 'Gi0/0/0' }, { device: sw, port: 'Gi0/2' }, 'straight');
    const g = controlPlane(st().doc!).hsrp.find((x) => x.vip === '10.9.0.1')!;
    expect(g.active?.device).toBe(r1);
    expect(run(c1, 'show standby brief')).toMatch(/Active/);
  });
});

describe('PoE and wireless', () => {
  it('a camera on a non-PoE switch stays off with the reason; on a PoE switch it powers up and uses budget', () => {
    const sw = st().addDevice('c2960x24', 0, 0);
    const cam = st().addDevice('axis-cam', 200, 0);
    st().connect({ device: sw, port: 'Gi0/5' }, { device: cam, port: dev(cam).interfaces[0].name }, 'straight');
    expect(dev(cam).power).toBe('stopped');
    expect(dev(cam).powerReason).toMatch(/does not supply power/);
    const ps = st().addDevice('c2960x24ps', 0, 300);
    const cable = st().doc!.cables.find((c) => c.a.device === cam || c.b.device === cam)!;
    st().reconnectCable(cable.id, cable.a.device === sw ? 'a' : 'b', { device: ps, port: 'Gi0/5' });
    expect(dev(cam).power).toBe('running');
    expect(poeUsage(st().doc!, ps).used).toBeCloseTo(6.5);
  });

  it('a laptop with the wrong passphrase cannot join; the right one associates', () => {
    const ap = st().addDevice('c9120', 0, 0);
    const ps = st().addDevice('c2960x24ps', 0, 300);
    st().connect({ device: ps, port: 'Gi0/1' }, { device: ap, port: dev(ap).interfaces.find((i) => i.type === 'copper')!.name }, 'straight');
    expect(dev(ap).power).toBe('running');
    const lap = st().addDevice('thinkpad', 200, 0, { wireless: { ssid: 'AEGIS-LAB', security: 'wpa2', key: 'nope' } });
    expect(st().associateWireless(lap, ap).reason).toMatch(/passphrase/);
    st().updateDevice(lap, { wireless: { ssid: 'AEGIS-LAB', security: 'wpa2', key: 'changeme123' } });
    expect(st().associateWireless(lap, ap).ok).toBe(true);
  });
});

describe('host command prompt', () => {
  it('ipconfig /renew and ping from a workstation', () => {
    const ws = byName('WS-FIN-07');
    const cli = new DesignCli(ws.id);
    expect(cli.exec('ipconfig /renew')).toMatch(/IPv4 Address.*10\.10\.20\./);
    // The finance VLAN may only reach SalonePay on 443: ICMP is denied, and the prompt says by which rule.
    expect(cli.exec('ping 10.10.30.20')).toMatch(/Lost = 4[\s\S]*Blocked by FW01 .*rule 99/);
    expect(cli.exec('arp -a')).toMatch(/10\.10\.20\.1 /);
  });

  it('the switch CLI lists its MAC table and VLANs', () => {
    const cli = new DesignCli(byName('SW-ACC-01').id);
    expect(run(cli, 'enable', 'show vlan brief')).toMatch(/VLAN Name/);
    expect(cli.exec('show mac address-table')).toMatch(/DYNAMIC/);
    expect(cli.exec('show cdp neighbors')).toMatch(/FW01/);
  });

  it('a static route typed in the CLI changes packet simulation', () => {
    const r1 = st().addDevice('isr4331', 0, 0);
    const c = new DesignCli(r1);
    run(c, 'enable', 'conf t', 'ip route 10.77.0.0 255.255.0.0 10.0.0.2', 'end');
    expect(dev(r1).routes.some((r) => r.prefix === '10.77.0.0/16')).toBe(true);
    const t = simulatePacket(st().doc!, { srcDevice: r1, dst: '10.77.1.1', proto: 'icmp' });
    expect(t.status).not.toBe('delivered');
  });
});

describe('engineering tools', () => {
  it('pcap: frames for a ping carry valid IPv4 checksums and a libpcap header', async () => {
    const { framesFor, toPcap, checksum, dissect } = await import('@/lab/pcap');
    const { ping } = await import('@/lab/simulate');
    const doc = st().doc!;
    const traces = ping(doc, byName('WS-FIN-07').id, '10.10.20.1', 1);
    const frames = framesFor(doc, traces);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.some((f) => f.protocol === 'ARP')).toBe(true);
    const ipFrame = frames.find((f) => f.protocol === 'ICMP')!;
    const off = ipFrame.bytes[12] === 0x81 ? 18 : 14;
    expect(checksum(Array.from(ipFrame.bytes.slice(off, off + 20)))).toBe(0);
    expect(dissect(ipFrame).map((l) => l.layer)).toContain('Internet Control Message Protocol');
    const pcap = toPcap(frames);
    expect(Array.from(pcap.slice(0, 4))).toEqual([0xd4, 0xc3, 0xb2, 0xa1]);
    expect(pcap.length).toBe(24 + frames.reduce((s, f) => s + 16 + f.bytes.length, 0));
  });

  it('audit flags telnet, duplicate IPs and an off-subnet gateway with fixes', async () => {
    const { auditDoc } = await import('@/lab/audit');
    const r = st().addDevice('isr4331', 0, 0);
    const a = byName('WS-FIN-07');
    st().updateIface(a.id, 'Ethernet', { ip: '10.10.20.1', prefix: 24, gateway: '10.99.0.1', dhcp: false });
    const f = auditDoc(st().doc!);
    expect(f.some((x) => x.title.includes(`${dev(r).name} allows Telnet`))).toBe(true);
    expect(f.some((x) => x.title === 'Duplicate address 10.10.20.1')).toBe(true);
    expect(f.some((x) => x.title.includes('gateway is off-subnet') && x.fix)).toBe(true);
  });

  it('challenges inject a hidden fault that breaks a goal; undo restores it', async () => {
    const { prepareChallenge, checkGoals } = await import('@/lab/challenges');
    const ws = byName('WS-FIN-07');
    st().addGoal({ src: ws.id, dst: '10.10.30.20', proto: 'tcp', port: 443, expect: 'reach' });
    const before = checkGoals(st().doc!)[0];
    expect(before.pass, before.reason).toBe(true);
    const p = prepareChallenge(st().doc!, 'gateway-typo', () => 0.1)!;
    expect(p).not.toBeNull();
    st().startChallenge({ title: p.def.title, brief: p.brief, fault: p.fault }, p.apply);
    expect(st().doc!.challenge?.revealed).toBe(false);
    const victim = st().doc!.devices.find((d) => p.fault.startsWith(`${d.name} `))!;
    expect(victim, p.fault).toBeDefined();
    const gw = victim.interfaces.find((i) => i.gateway)!.gateway;
    expect(p.fault).toContain(`to ${gw}`);
    if (victim.id === ws.id) expect(checkGoals(st().doc!)[0].pass).toBe(false);
    st().undo();
    const after = checkGoals(st().doc!)[0];
    expect(after.pass, after.reason).toBe(true);
  });
});
