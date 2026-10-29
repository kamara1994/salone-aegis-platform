// Guided lab workbooks, in the spirit of Cisco NetAcad Packet Tracer activities and CCNA/CCNP lab
// guides: each one builds a starter topology, lists the tasks, and grades them automatically from
// the live design (configuration, control plane and real packet simulation), not from typed answers.
import { ifaceFromTemplate, MODEL_BY_KEY } from './catalog';
import { macsBehind } from './l2features';
import { controlPlane, type ControlPlane } from './protocols';
import { ping, simulatePacket } from './simulate';
import type { Cable, CableType, Device, Iface, LabDoc } from './types';
import { cableStatus, suggestCableType } from './validate';

export type Level = 'Foundations' | 'CCNA' | 'CCNP' | 'Security' | 'SOC' | 'Enterprise';
/** How the Labs picker groups labs. */
export type LabCategory = 'Getting started' | 'Switching' | 'Routing' | 'Enterprise builds' | 'Security' | 'SOC and monitoring' | 'Services' | 'Wireless';
export interface TaskResult {
  ok: boolean;
  detail?: string;
}
export interface Ctx {
  doc: LabDoc;
  cp: ControlPlane;
  d: (id: string) => Device | undefined;
  i: (id: string, port: string) => Iface | undefined;
  /** one ICMP echo, true when a reply comes back */
  ping: (src: string, dst: string) => TaskResult;
  tcp: (src: string, dst: string, port: number) => TaskResult;
  log: { deviceId: string; text: string }[];
}
export interface WorkbookTask {
  id: string;
  text: string;
  hint: string;
  check: (c: Ctx) => TaskResult | boolean;
}
export interface Workbook {
  id: string;
  title: string;
  level: Level;
  topic: string;
  minutes: number;
  intro: string;
  build: () => LabDoc;
  tasks: WorkbookTask[];
  category?: LabCategory;
}

// ---------------- topology builder ----------------

function builder() {
  const doc: LabDoc = { version: 1, devices: [], cables: [], sites: [], racks: [], vlans: [], subnets: [], groups: [], annotations: [], goals: [], source: 'blank', generatedAt: new Date().toISOString() };
  const api = {
    doc,
    dev(id: string, model: string, name: string, x: number, y: number, patch: Partial<Device> = {}) {
      const m = MODEL_BY_KEY[model];
      const d: Device = {
        id,
        origin: 'design',
        name,
        kind: m.kind,
        model,
        x,
        y,
        power: 'running',
        health: 'healthy',
        interfaces: m.ports().map((t) => ifaceFromTemplate(t, id, m.macPrefix)).map((i) => (m.kind === 'switch' && i.type !== 'console' ? { ...i, mode: 'access' as const, vlan: 1 } : i)),
        routes: [],
        vlans: m.kind === 'switch' ? { 1: 'default' } : {},
        firewall: [],
        listening: [...m.listening],
        consoles: [],
        ...(m.kind === 'switch' ? { stp: { enabled: true, priority: 32768 } } : {}),
        ...(m.kind === 'switch' || m.kind === 'router' ? { security: { ssh: false, telnet: true, enableSecret: false } } : {}),
        ...patch,
      };
      doc.devices.push(d);
      return d;
    },
    ip(id: string, port: string, ip: string, prefix = 24, gateway?: string) {
      const i = doc.devices.find((d) => d.id === id)!.interfaces.find((x) => x.name === port)!;
      Object.assign(i, { ip, prefix, gateway, dhcp: false });
    },
    set(id: string, port: string, patch: Partial<Iface>) {
      Object.assign(doc.devices.find((d) => d.id === id)!.interfaces.find((x) => x.name === port)!, patch);
    },
    cable(a: string, pa: string, b: string, pb: string, type?: CableType) {
      const t = type ?? suggestCableType(doc, { device: a, port: pa }, { device: b, port: pb });
      const c: Cable = { id: `wb-c-${doc.cables.length + 1}`, a: { device: a, port: pa }, b: { device: b, port: pb }, type: t, disabled: false };
      doc.cables.push(c);
      return c;
    },
    note(text: string, x: number, y: number, w = 260, h = 70) {
      doc.annotations!.push({ id: `wb-n-${doc.annotations!.length + 1}`, kind: 'text', x, y, w, h, text, color: 'amber' });
    },
  };
  return api;
}

// ---------------- check helpers ----------------

export function makeCtx(doc: LabDoc, log: { deviceId: string; text: string }[] = []): Ctx {
  const cp = controlPlane(doc);
  const d = (id: string) => doc.devices.find((x) => x.id === id);
  const reach = (t: ReturnType<typeof simulatePacket>) => ({ ok: t.status === 'delivered' || t.status === 'delayed', detail: t.reason });
  return {
    doc,
    cp,
    d,
    i: (id, port) => d(id)?.interfaces.find((x) => x.name === port),
    ping: (src, dst) => reach(ping(doc, src, dst, 1)[0]),
    tcp: (src, dst, port) => reach(simulatePacket(doc, { srcDevice: src, dst, proto: 'tcp', port }, cp)),
    log,
  };
}

const no = (detail: string): TaskResult => ({ ok: false, detail });
const vlanIs = (c: Ctx, sw: string, id: number, name?: string) => {
  const v = c.d(sw)?.vlans[id];
  return !!v && (!name || v.toUpperCase() === name.toUpperCase());
};
const access = (c: Ctx, sw: string, port: string, vlan: number) => {
  const i = c.i(sw, port);
  return !!i && (i.mode ?? 'access') === 'access' && (i.vlan ?? 1) === vlan;
};
const trunk = (c: Ctx, sw: string, port: string) => c.i(sw, port)?.mode === 'trunk';
const linkUp = (c: Ctx, dev: string, port: string) => {
  const cab = c.doc.cables.find((x) => (x.a.device === dev && x.a.port === port) || (x.b.device === dev && x.b.port === port));
  return !!cab && cableStatus(c.doc, cab).state !== 'down' && cableStatus(c.doc, cab).state !== 'disabled';
};
const all = (...r: (TaskResult | boolean)[]): TaskResult => {
  for (const x of r) {
    const v = typeof x === 'boolean' ? { ok: x } : x;
    if (!v.ok) return v;
  }
  return { ok: true };
};
const not = (r: TaskResult, why: string): TaskResult => (r.ok ? no(why) : { ok: true });
const hardened = (c: Ctx, id: string): TaskResult => {
  const s = c.d(id)?.security;
  if (!s?.enableSecret) return no('enable secret is not set');
  if (!s.ssh) return no('SSH is not enabled (crypto key generate rsa)');
  if (s.telnet) return no('Telnet is still allowed on the VTY lines (transport input ssh)');
  if (!s.banner) return no('no MOTD banner');
  return { ok: true };
};

const P = (n: number) => `PC${n}`;

// ---------------- the workbooks ----------------

export const WORKBOOKS: Workbook[] = [
  {
    id: 'basic-switch',
    title: 'Basic switch configuration and SSH',
    level: 'CCNA',
    topic: 'Device management',
    minutes: 20,
    intro: 'A new access switch arrived. Name it, secure management access, give it a management address and make sure the admin PC can reach it.',
    build() {
      const b = builder();
      b.dev('s1', 'c2960x24', 'Switch', 360, 120);
      b.dev('pc1', 'optiplex', 'ADMIN-PC', 360, 340);
      b.ip('pc1', 'Ethernet', '192.168.1.10', 24, '192.168.1.1');
      b.cable('s1', 'Gi0/1', 'pc1', 'Ethernet');
      b.note('Management VLAN 1: 192.168.1.0/24. Switch address 192.168.1.2, gateway 192.168.1.1.', 560, 120);
      return b.doc;
    },
    tasks: [
      { id: 'host', text: 'Name the switch HQ-SW1.', hint: 'conf t → hostname HQ-SW1', check: (c) => c.d('s1')?.name === 'HQ-SW1' || no(`the switch is still called ${c.d('s1')?.name}`) },
      { id: 'secure', text: 'Set an enable secret, a MOTD banner, enable SSH and allow only SSH on the VTY lines.', hint: 'enable secret …, banner motd #Authorised access only#, ip domain-name lab.local, crypto key generate rsa, line vty 0 15 → transport input ssh', check: (c) => hardened(c, 's1') },
      { id: 'svi', text: 'Give interface VLAN 1 the address 192.168.1.2/24, bring it up, and set the default gateway 192.168.1.1.', hint: 'interface vlan 1 → ip address 192.168.1.2 255.255.255.0 → no shutdown; ip default-gateway 192.168.1.1', check: (c) => all(c.i('s1', 'Vlan1')?.ip === '192.168.1.2' || no('Vlan1 has no 192.168.1.2 address'), !c.i('s1', 'Vlan1')?.shutdown || no('Vlan1 is shut down'), c.d('s1')!.routes.some((r) => r.prefix === '0.0.0.0/0' && r.via === '192.168.1.1') || no('no default gateway 192.168.1.1')) },
      { id: 'reach', text: 'From ADMIN-PC, ping the switch at 192.168.1.2.', hint: 'Open ADMIN-PC → Terminal → Design CLI → ping 192.168.1.2', check: (c) => c.ping('pc1', '192.168.1.2') },
      { id: 'save', text: 'Save the configuration (copy running-config startup-config).', hint: 'write memory', check: (c) => !!c.d('s1')?.startupSaved || no('startup-config is empty') },
    ],
  },
  {
    id: 'vlans-trunking',
    title: 'VLANs and 802.1Q trunking',
    level: 'CCNA',
    topic: 'VLANs',
    minutes: 30,
    intro: 'Sales and HR share two switches. Separate them into VLANs, carry both VLANs over one trunk with a dedicated native VLAN, and prove that each department can reach only its own hosts.',
    build() {
      const b = builder();
      b.dev('s1', 'c2960x24', 'S1', 200, 120);
      b.dev('s2', 'c2960x24', 'S2', 560, 120);
      b.cable('s1', 'Gi0/24', 's2', 'Gi0/24', 'crossover');
      const pcs: [string, string, string, string, number][] = [
        ['pc1', 's1', 'Gi0/1', '172.16.10.11', 100],
        ['pc2', 's1', 'Gi0/2', '172.16.20.12', 280],
        ['pc3', 's2', 'Gi0/1', '172.16.10.13', 480],
        ['pc4', 's2', 'Gi0/2', '172.16.20.14', 660],
      ];
      pcs.forEach(([id, sw, port, ip, x], k) => {
        b.dev(id, 'optiplex', P(k + 1), x, 340);
        b.ip(id, 'Ethernet', ip, 24);
        b.cable(sw, port, id, 'Ethernet');
      });
      b.note('VLAN 10 SALES: PC1, PC3 (172.16.10.0/24)\nVLAN 20 HR: PC2, PC4 (172.16.20.0/24)\nVLAN 99 NATIVE on the trunk', 760, 100, 300, 90);
      return b.doc;
    },
    tasks: [
      { id: 'vlans', text: 'Create VLAN 10 SALES, VLAN 20 HR and VLAN 99 NATIVE on both switches.', hint: 'vlan 10 → name SALES (repeat for 20 and 99) on S1 and S2', check: (c) => all(...['s1', 's2'].flatMap((s) => [vlanIs(c, s, 10, 'SALES') || no(`${c.d(s)?.name} has no VLAN 10 SALES`), vlanIs(c, s, 20, 'HR') || no(`${c.d(s)?.name} has no VLAN 20 HR`), vlanIs(c, s, 99) || no(`${c.d(s)?.name} has no VLAN 99`)])) },
      { id: 'access', text: 'Put Gi0/1 in VLAN 10 and Gi0/2 in VLAN 20 on both switches (access mode).', hint: 'interface g0/1 → switchport mode access → switchport access vlan 10', check: (c) => all(...['s1', 's2'].flatMap((s) => [access(c, s, 'Gi0/1', 10) || no(`${c.d(s)?.name} Gi0/1 is not an access port in VLAN 10`), access(c, s, 'Gi0/2', 20) || no(`${c.d(s)?.name} Gi0/2 is not an access port in VLAN 20`)])) },
      { id: 'trunk', text: 'Make Gi0/24 a trunk on both switches with native VLAN 99, allowing only VLANs 10, 20 and 99.', hint: 'switchport mode trunk, switchport trunk native vlan 99, switchport trunk allowed vlan 10,20,99', check: (c) => all(...['s1', 's2'].flatMap((s) => { const i = c.i(s, 'Gi0/24')!; return [trunk(c, s, 'Gi0/24') || no(`${c.d(s)?.name} Gi0/24 is not a trunk`), i.nativeVlan === 99 || no(`${c.d(s)?.name} native VLAN is ${i.nativeVlan ?? 1}`), (Array.isArray(i.allowedVlans) && [10, 20, 99].every((v) => (i.allowedVlans as number[]).includes(v)) && i.allowedVlans.length === 3) || no(`${c.d(s)?.name} Gi0/24 allowed VLANs are ${JSON.stringify(i.allowedVlans ?? 'all')}`)]; })) },
      { id: 'same', text: 'PC1 reaches PC3 (SALES) and PC2 reaches PC4 (HR) across the trunk.', hint: 'Use the Simulation panel or ping from each PC.', check: (c) => all(c.ping('pc1', '172.16.10.13'), c.ping('pc2', '172.16.20.14')) },
      { id: 'isolated', text: 'Prove isolation: PC1 cannot reach PC2 (different VLAN, no router).', hint: 'A ping between VLANs must fail until a router is added.', check: (c) => not(c.ping('pc1', '172.16.20.12'), 'PC1 can reach PC2; the VLANs are not separated') },
    ],
  },
  {
    id: 'router-on-a-stick',
    title: 'Inter-VLAN routing: router-on-a-stick',
    level: 'CCNA',
    topic: 'Inter-VLAN routing',
    minutes: 30,
    intro: 'Route between VLAN 10 and VLAN 20 with one router interface and 802.1Q sub-interfaces.',
    build() {
      const b = builder();
      b.dev('r1', 'isr4331', 'R1', 360, 40);
      b.dev('s1', 'c2960x24', 'S1', 360, 200);
      b.dev('pc1', 'optiplex', 'PC1', 220, 380);
      b.dev('pc2', 'optiplex', 'PC2', 500, 380);
      b.ip('pc1', 'Ethernet', '192.168.10.10', 24, '192.168.10.1');
      b.ip('pc2', 'Ethernet', '192.168.20.10', 24, '192.168.20.1');
      b.cable('r1', 'Gi0/0/0', 's1', 'Gi0/24');
      b.cable('s1', 'Gi0/1', 'pc1', 'Ethernet');
      b.cable('s1', 'Gi0/2', 'pc2', 'Ethernet');
      b.note('Gateways: 192.168.10.1 (VLAN 10) and 192.168.20.1 (VLAN 20) on R1 Gi0/0/0 sub-interfaces.', 560, 40);
      return b.doc;
    },
    tasks: [
      { id: 'sw', text: 'On S1, create VLANs 10 and 20, put Gi0/1 in VLAN 10 and Gi0/2 in VLAN 20, and make Gi0/24 a trunk.', hint: 'vlan 10 / vlan 20; interface g0/1 → switchport access vlan 10; interface g0/24 → switchport mode trunk', check: (c) => all(vlanIs(c, 's1', 10) || no('no VLAN 10'), vlanIs(c, 's1', 20) || no('no VLAN 20'), access(c, 's1', 'Gi0/1', 10) || no('Gi0/1 not in VLAN 10'), access(c, 's1', 'Gi0/2', 20) || no('Gi0/2 not in VLAN 20'), trunk(c, 's1', 'Gi0/24') || no('Gi0/24 is not a trunk')) },
      { id: 'subif', text: 'On R1, create Gi0/0/0.10 (dot1Q 10, 192.168.10.1/24) and Gi0/0/0.20 (dot1Q 20, 192.168.20.1/24), and bring Gi0/0/0 up.', hint: 'interface g0/0/0.10 → encapsulation dot1Q 10 → ip address 192.168.10.1 255.255.255.0; interface g0/0/0 → no shutdown', check: (c) => all(c.i('r1', 'Gi0/0/0.10')?.ip === '192.168.10.1' || no('Gi0/0/0.10 missing or wrong address'), c.i('r1', 'Gi0/0/0.10')?.vlan === 10 || no('Gi0/0/0.10 is not dot1Q 10'), c.i('r1', 'Gi0/0/0.20')?.ip === '192.168.20.1' || no('Gi0/0/0.20 missing or wrong address'), c.i('r1', 'Gi0/0/0.20')?.vlan === 20 || no('Gi0/0/0.20 is not dot1Q 20'), !c.i('r1', 'Gi0/0/0')?.shutdown || no('Gi0/0/0 is shut down')) },
      { id: 'route', text: 'PC1 reaches PC2 through R1.', hint: 'Check the routing table on R1: show ip route', check: (c) => c.ping('pc1', '192.168.20.10') },
    ],
  },
  {
    id: 'l3-switch',
    title: 'Inter-VLAN routing on a layer 3 switch',
    level: 'CCNA',
    topic: 'Inter-VLAN routing',
    minutes: 20,
    intro: 'Replace the router with SVIs on a Catalyst 9300. Remember that a switch only routes after ip routing.',
    build() {
      const b = builder();
      b.dev('core', 'c9300-24t', 'CORE', 360, 120);
      b.dev('pc1', 'optiplex', 'PC1', 200, 340);
      b.dev('pc2', 'optiplex', 'PC2', 520, 340);
      b.ip('pc1', 'Ethernet', '10.10.10.10', 24, '10.10.10.1');
      b.ip('pc2', 'Ethernet', '10.20.20.10', 24, '10.20.20.1');
      b.cable('core', 'Gi1/0/1', 'pc1', 'Ethernet');
      b.cable('core', 'Gi1/0/2', 'pc2', 'Ethernet');
      return b.doc;
    },
    tasks: [
      { id: 'vlans', text: 'Create VLANs 10 and 20; Gi1/0/1 in VLAN 10, Gi1/0/2 in VLAN 20.', hint: 'vlan 10, vlan 20; interface g1/0/1 → switchport access vlan 10', check: (c) => all(access(c, 'core', 'Gi1/0/1', 10) || no('Gi1/0/1 not in VLAN 10'), access(c, 'core', 'Gi1/0/2', 20) || no('Gi1/0/2 not in VLAN 20'), vlanIs(c, 'core', 10) || no('VLAN 10 missing'), vlanIs(c, 'core', 20) || no('VLAN 20 missing')) },
      { id: 'svis', text: 'Create SVIs: Vlan10 10.10.10.1/24 and Vlan20 10.20.20.1/24.', hint: 'interface vlan 10 → ip address 10.10.10.1 255.255.255.0 → no shutdown', check: (c) => all(c.i('core', 'Vlan10')?.ip === '10.10.10.1' || no('Vlan10 missing'), c.i('core', 'Vlan20')?.ip === '10.20.20.1' || no('Vlan20 missing')) },
      { id: 'routing', text: 'Enable ip routing and verify PC1 reaches PC2.', hint: 'conf t → ip routing', check: (c) => all(!!c.d('core')?.ipRouting || no('ip routing is off'), c.ping('pc1', '10.20.20.10')) },
    ],
  },
  {
    id: 'stp',
    title: 'Spanning tree: root bridge, Rapid PVST+, PortFast and BPDU guard',
    level: 'CCNA',
    topic: 'STP',
    minutes: 30,
    intro: 'Three switches form a triangle. Make DSW1 the root, run Rapid PVST+, protect edge ports, and check which port blocks.',
    build() {
      const b = builder();
      b.dev('d1', 'c2960x24', 'DSW1', 360, 40);
      b.dev('a1', 'c2960x24', 'ASW1', 180, 240);
      b.dev('a2', 'c2960x24', 'ASW2', 540, 240);
      for (const id of ['d1', 'a1', 'a2']) for (const p of ['Gi0/23', 'Gi0/24']) b.set(id, p, { mode: 'trunk', allowedVlans: 'all', nativeVlan: 1 });
      b.cable('d1', 'Gi0/23', 'a1', 'Gi0/24', 'trunk');
      b.cable('d1', 'Gi0/24', 'a2', 'Gi0/23', 'trunk');
      b.cable('a1', 'Gi0/23', 'a2', 'Gi0/24', 'trunk');
      b.dev('pc1', 'optiplex', 'PC1', 120, 420);
      b.dev('pc2', 'optiplex', 'PC2', 600, 420);
      b.ip('pc1', 'Ethernet', '10.0.0.11', 24);
      b.ip('pc2', 'Ethernet', '10.0.0.12', 24);
      b.cable('a1', 'Gi0/1', 'pc1', 'Ethernet');
      b.cable('a2', 'Gi0/1', 'pc2', 'Ethernet');
      // A low-MAC access switch wins the election by default: the classic accident.
      b.doc.devices.find((d) => d.id === 'a2')!.interfaces.forEach((i, k) => i.mac && (i.mac = `00:00:0c:00:00:${(k + 16).toString(16).padStart(2, '0')}`));
      return b.doc;
    },
    tasks: [
      { id: 'find', text: 'Find the current root bridge (show spanning-tree). Which switch won, and why?', hint: 'Lowest bridge ID wins: priority first, then the lowest MAC address.', check: () => ({ ok: true, detail: 'Read show spanning-tree on any switch.' }) },
      { id: 'root', text: 'Make DSW1 the root bridge (priority 24576 or lower, or spanning-tree vlan 1 root primary).', hint: 'spanning-tree vlan 1 priority 4096', check: (c) => c.cp.stp.d1?.isRoot || no('DSW1 is not the root bridge') },
      { id: 'rapid', text: 'Run Rapid PVST+ on all three switches.', hint: 'spanning-tree mode rapid-pvst', check: (c) => all(...['d1', 'a1', 'a2'].map((s) => c.d(s)?.stp?.mode === 'rapid-pvst' || no(`${c.d(s)?.name} is not in rapid-pvst mode`))) },
      { id: 'edge', text: 'Enable PortFast and BPDU guard on the PC ports (ASW1 Gi0/1, ASW2 Gi0/1).', hint: 'interface g0/1 → spanning-tree portfast → spanning-tree bpduguard enable', check: (c) => all(...[['a1', 'Gi0/1'], ['a2', 'Gi0/1']].map(([s, p]) => (c.i(s, p)?.portfast && (c.i(s, p)?.bpduGuard || c.d(s)?.stp?.bpduGuardDefault)) || no(`${c.d(s)?.name} ${p} lacks PortFast or BPDU guard`))) },
      { id: 'block', text: 'Exactly one port in the triangle is blocking, on the link between the access switches.', hint: 'Look for Altn BLK in show spanning-tree on ASW1 or ASW2.', check: (c) => { const blk = ['a1', 'a2'].flatMap((s) => Object.entries(c.cp.stp[s]?.ports ?? {}).filter(([p, v]) => v.state === 'blocking' && p === (s === 'a1' ? 'Gi0/23' : 'Gi0/24')).map(([p]) => `${s}/${p}`)); return blk.length === 1 || no(`blocking ports on the access link: ${blk.length}`); } },
      { id: 'ping', text: 'PC1 still reaches PC2.', hint: 'Traffic takes the forwarding path through DSW1.', check: (c) => c.ping('pc1', '10.0.0.12') },
    ],
  },
  {
    id: 'etherchannel',
    title: 'EtherChannel with LACP',
    level: 'CCNA',
    topic: 'EtherChannel',
    minutes: 20,
    intro: 'Two uplinks between the distribution and access switch should act as one logical trunk.',
    build() {
      const b = builder();
      b.dev('s1', 'c2960x24', 'DSW1', 200, 120);
      b.dev('s2', 'c2960x24', 'ASW1', 560, 120);
      b.cable('s1', 'Gi0/1', 's2', 'Gi0/1', 'crossover');
      b.cable('s1', 'Gi0/2', 's2', 'Gi0/2', 'crossover');
      b.dev('pc1', 'optiplex', 'PC1', 200, 340);
      b.dev('pc2', 'optiplex', 'PC2', 560, 340);
      b.ip('pc1', 'Ethernet', '10.1.1.11', 24);
      b.ip('pc2', 'Ethernet', '10.1.1.12', 24);
      b.cable('s1', 'Gi0/10', 'pc1', 'Ethernet');
      b.cable('s2', 'Gi0/10', 'pc2', 'Ethernet');
      return b.doc;
    },
    tasks: [
      { id: 'see', text: 'Before bundling, check show spanning-tree: one of the two links blocks.', hint: 'STP sees two parallel links as a loop.', check: () => ({ ok: true }) },
      { id: 'lacp', text: 'Bundle Gi0/1-2 into channel-group 1 using LACP (active on DSW1, passive or active on ASW1).', hint: 'interface range g0/1 - 2 → channel-group 1 mode active', check: (c) => { const ch = c.cp.channels.find((x) => x.device === 's1' && x.group === 1); return (ch?.ok && ch.protocol === 'LACP') || no(ch ? `Po1: ${ch.reason ?? `protocol ${ch.protocol}`}` : 'no channel-group 1 on DSW1'); } },
      { id: 'trunk', text: 'Make the member ports trunks on both switches (identical settings on every member).', hint: 'interface range g0/1 - 2 → switchport mode trunk', check: (c) => all(...['s1', 's2'].flatMap((s) => ['Gi0/1', 'Gi0/2'].map((p) => trunk(c, s, p) || no(`${c.d(s)?.name} ${p} is not a trunk`)))) },
      { id: 'up', text: 'show etherchannel summary shows Po1(SU) with both ports (P), and PC1 reaches PC2.', hint: 'Both members bundled; no blocked member.', check: (c) => all(c.cp.channels.filter((x) => x.ok).length >= 2 || no('the bundle is not up on both switches'), c.ping('pc1', '10.1.1.12')) },
    ],
  },
  {
    id: 'port-security',
    title: 'Port security: sticky MACs, violations and recovery',
    level: 'CCNA',
    topic: 'Switch security',
    minutes: 25,
    intro: 'Lock the reception PC port to that PC. Then test what happens when someone plugs in a different laptop, and recover the port the right way.',
    build() {
      const b = builder();
      b.dev('s1', 'c2960x24', 'SW-RECEPTION', 360, 100);
      b.dev('pc1', 'optiplex', 'RECEPTION-PC', 220, 320);
      b.dev('srv', 'services-server', 'FILESRV', 560, 320);
      b.dev('rogue', 'kali-workstation', 'VISITOR-LAPTOP', 80, 460);
      b.ip('pc1', 'Ethernet', '10.5.5.10', 24);
      b.ip('srv', 'eno1', '10.5.5.200', 24);
      b.ip('rogue', 'Ethernet', '10.5.5.66', 24);
      b.cable('s1', 'Gi0/1', 'pc1', 'Ethernet');
      b.cable('s1', 'Gi0/24', 'srv', 'eno1');
      b.note('VISITOR-LAPTOP is not plugged in yet. You will move the Gi0/1 cable to it in task 3.', 260, 470, 320, 60);
      return b.doc;
    },
    tasks: [
      { id: 'config', text: 'On Gi0/1: static access mode, port security, maximum 1, violation shutdown, sticky MAC learning.', hint: 'switchport mode access, switchport port-security, switchport port-security maximum 1, switchport port-security violation shutdown, switchport port-security mac-address sticky', check: (c) => { const ps = c.i('s1', 'Gi0/1')?.portSecurity; return all(ps?.enabled || no('port security is off'), ps?.max === 1 || no(`maximum is ${ps?.max}`), ps?.violation === 'shutdown' || no(`violation mode is ${ps?.violation}`), ps?.sticky || no('sticky learning is off')); } },
      { id: 'learned', text: 'Verify the sticky MAC of RECEPTION-PC was learned (show port-security interface g0/1).', hint: 'Sticky MACs appear in the running-config.', check: (c) => (c.i('s1', 'Gi0/1')?.portSecurity?.macs ?? []).includes(c.i('pc1', 'Ethernet')!.mac.toLowerCase()) || no('RECEPTION-PC MAC is not a sticky secure address') },
      { id: 'violate', text: 'Move the Gi0/1 cable from RECEPTION-PC to VISITOR-LAPTOP and watch the port err-disable.', hint: 'Right-click the cable → reconnect the end, or delete it and cable the laptop to Gi0/1.', check: (c) => c.log.some((l) => l.deviceId === 's1' && /PSECURE_VIOLATION/.test(l.text)) || no('no port-security violation has happened yet') },
      { id: 'recover', text: 'Plug RECEPTION-PC back into Gi0/1 and recover the port (shutdown, then no shutdown). It must reach FILESRV again.', hint: 'An err-disabled port stays down until you bounce it (or errdisable recovery is configured).', check: (c) => all(!c.i('s1', 'Gi0/1')?.errDisabled || no('Gi0/1 is still err-disabled'), c.ping('pc1', '10.5.5.200')) },
      { id: 'unused', text: 'Shut down every unused port (Gi0/2 to Gi0/23).', hint: 'interface range g0/2 - 23 → shutdown', check: (c) => { const open = Array.from({ length: 22 }, (_, k) => `Gi0/${k + 2}`).filter((p) => !c.i('s1', p)?.shutdown); return open.length === 0 || no(`still enabled: ${open.slice(0, 4).join(', ')}${open.length > 4 ? '…' : ''}`); } },
    ],
  },
  {
    id: 'dhcp',
    title: 'DHCP server on a router and DHCP relay',
    level: 'CCNA',
    topic: 'IP services',
    minutes: 25,
    intro: 'R1 hands out addresses on its own LAN. The second LAN gets addresses from a central server through a relay.',
    build() {
      const b = builder();
      b.dev('r1', 'isr4331', 'R1', 360, 100);
      b.dev('pc1', 'optiplex', 'PC1', 160, 320);
      b.dev('pc2', 'optiplex', 'PC2', 560, 320);
      b.dev('srv', 'services-server', 'DHCP-SRV', 760, 100);
      b.dev('s1', 'c2960x24', 'S2', 560, 200);
      b.ip('r1', 'Gi0/0/0', '192.168.1.1', 24);
      b.ip('r1', 'Gi0/0/1', '192.168.2.1', 24);
      b.ip('r1', 'Gi0/0/2', '10.99.0.1', 24);
      b.ip('srv', 'eno1', '10.99.0.10', 24, '10.99.0.1');
      b.set('pc1', 'Ethernet', { dhcp: true });
      b.set('pc2', 'Ethernet', { dhcp: true });
      b.cable('r1', 'Gi0/0/0', 'pc1', 'Ethernet');
      b.cable('r1', 'Gi0/0/1', 's1', 'Gi0/24');
      b.cable('s1', 'Gi0/1', 'pc2', 'Ethernet');
      b.dev('s9', 'c2960x24', 'SRV-SW', 760, 0);
      b.cable('r1', 'Gi0/0/2', 's9', 'Gi0/25', 'fiber');
      b.cable('s9', 'Gi0/1', 'srv', 'eno1');
      b.doc.devices.find((d) => d.id === 'srv')!.dhcpPools = [{ name: 'LAN2', network: '192.168.2.0/24', start: '192.168.2.100', end: '192.168.2.199', gateway: '192.168.2.1', dns: ['10.99.0.10'] }];
      return b.doc;
    },
    tasks: [
      { id: 'pool', text: 'On R1, create pool LAN1: network 192.168.1.0/24, default-router 192.168.1.1, dns-server 8.8.8.8.', hint: 'ip dhcp pool LAN1 → network 192.168.1.0 255.255.255.0 → default-router 192.168.1.1 → dns-server 8.8.8.8', check: (c) => { const p = c.d('r1')?.dhcpPools?.find((x) => x.network === '192.168.1.0/24'); return all(!!p || no('no pool for 192.168.1.0/24'), p?.gateway === '192.168.1.1' || no('default-router is not 192.168.1.1')); } },
      { id: 'pc1', text: 'PC1 gets an address from R1 (ipconfig /renew).', hint: 'Design CLI on PC1 → ipconfig /renew', check: (c) => { const i = c.i('pc1', 'Ethernet'); return (!!i?.ip && i.ip.startsWith('192.168.1.') && i.gateway === '192.168.1.1') || no(`PC1 has ${i?.ip ?? 'no address'}`); } },
      { id: 'relay', text: 'Configure ip helper-address 10.99.0.10 on R1 Gi0/0/1 so PC2 gets an address from DHCP-SRV.', hint: 'interface g0/0/1 → ip helper-address 10.99.0.10, then ipconfig /renew on PC2', check: (c) => { const i = c.i('pc2', 'Ethernet'); return all(c.i('r1', 'Gi0/0/1')?.helper === '10.99.0.10' || no('no helper on Gi0/0/1'), (!!i?.ip && i.ip.startsWith('192.168.2.1')) || no(`PC2 has ${i?.ip ?? 'no address'}`)); } },
      { id: 'reach', text: 'PC1 reaches PC2.', hint: 'Both should now have gateways on R1.', check: (c) => { const ip = c.i('pc2', 'Ethernet')?.ip; return ip ? c.ping('pc1', ip) : no('PC2 has no address'); } },
    ],
  },
  {
    id: 'dhcp-snooping',
    title: 'DHCP snooping and dynamic ARP inspection',
    level: 'CCNA',
    topic: 'Switch security',
    minutes: 25,
    intro: 'Someone plugged a laptop running a rogue DHCP server into the LAN. Stop it with DHCP snooping, then stop ARP spoofing with DAI.',
    build() {
      const b = builder();
      b.dev('sw', 'c2960x24', 'SW1', 360, 120);
      b.dev('r1', 'isr4331', 'R1', 360, -60);
      b.dev('srv', 'services-server', 'DHCP-SRV', 640, 120);
      b.dev('pc', 'optiplex', 'PC1', 200, 320);
      b.dev('kali', 'kali-workstation', 'ROGUE', 520, 320);
      b.ip('r1', 'Gi0/0/0', '10.10.10.1', 24);
      b.ip('srv', 'eno1', '10.10.10.5', 24, '10.10.10.1');
      b.ip('kali', 'Ethernet', '10.10.10.66', 24);
      b.set('pc', 'Ethernet', { dhcp: true });
      b.doc.devices.find((d) => d.id === 'srv')!.dhcpPools = [{ name: 'LAN', network: '10.10.10.0/24', start: '10.10.10.100', end: '10.10.10.150', gateway: '10.10.10.1', dns: ['10.10.10.5'] }];
      b.doc.devices.find((d) => d.id === 'kali')!.dhcpPools = [{ name: 'EVIL', network: '10.10.10.0/24', start: '10.10.10.200', end: '10.10.10.210', gateway: '10.10.10.66' }];
      b.cable('sw', 'Gi0/24', 'r1', 'Gi0/0/0');
      b.cable('sw', 'Gi0/23', 'srv', 'eno1');
      b.cable('sw', 'Gi0/1', 'pc', 'Ethernet');
      b.cable('sw', 'Gi0/2', 'kali', 'Ethernet');
      return b.doc;
    },
    tasks: [
      { id: 'attack', text: 'On PC1 run ipconfig /renew: notice the gateway it gets (10.10.10.66 means the rogue won).', hint: 'The closest server answers first.', check: () => ({ ok: true }) },
      { id: 'snoop', text: 'Enable DHCP snooping globally and for VLAN 1 on SW1, and trust only the port facing DHCP-SRV.', hint: 'ip dhcp snooping, ip dhcp snooping vlan 1, interface g0/23 → ip dhcp snooping trust', check: (c) => all(c.d('sw')?.dhcpSnooping?.enabled || no('DHCP snooping is off'), (c.d('sw')?.dhcpSnooping?.vlans ?? []).includes(1) || no('VLAN 1 is not snooped'), c.i('sw', 'Gi0/23')?.dhcpTrust || no('Gi0/23 is not trusted'), !c.i('sw', 'Gi0/2')?.dhcpTrust || no('the rogue port is trusted')) },
      { id: 'lease', text: 'Renew on PC1: it must get 10.10.10.100-150 with gateway 10.10.10.1.', hint: 'ipconfig /renew', check: (c) => { const i = c.i('pc', 'Ethernet'); return (i?.gateway === '10.10.10.1' && !!i.ip && /^10\.10\.10\.1[0-5]\d$/.test(i.ip)) || no(`PC1 has ${i?.ip ?? 'no address'} via ${i?.gateway ?? 'no gateway'}`); } },
      { id: 'dai', text: 'Enable dynamic ARP inspection on VLAN 1 and trust the router port Gi0/24. PC1 must still reach R1; ROGUE (static address) must not.', hint: 'ip arp inspection vlan 1; interface g0/24 → ip arp inspection trust', check: (c) => all((c.d('sw')?.dai?.vlans ?? []).includes(1) || no('DAI is off for VLAN 1'), c.i('sw', 'Gi0/24')?.dhcpTrust || no('Gi0/24 is not trusted'), c.ping('pc', '10.10.10.1'), not(c.ping('kali', '10.10.10.1'), 'ROGUE can still reach R1')) },
    ],
  },
  {
    id: 'static-routing',
    title: 'Static and default routing',
    level: 'CCNA',
    topic: 'Routing',
    minutes: 25,
    intro: 'Three routers in a line. Connect the two LANs with static routes, and give the edge a default route.',
    build() {
      const b = builder();
      b.dev('r1', 'isr4331', 'R1', 100, 120);
      b.dev('r2', 'isr4331', 'R2', 360, 120);
      b.dev('r3', 'isr4331', 'R3', 620, 120);
      b.dev('pc1', 'optiplex', 'PC1', 100, 320);
      b.dev('pc3', 'optiplex', 'PC3', 620, 320);
      b.ip('r1', 'Gi0/0/0', '192.168.1.1', 24);
      b.ip('r1', 'Gi0/0/1', '10.0.12.1', 30);
      b.ip('r2', 'Gi0/0/0', '10.0.12.2', 30);
      b.ip('r2', 'Gi0/0/1', '10.0.23.1', 30);
      b.ip('r3', 'Gi0/0/0', '10.0.23.2', 30);
      b.ip('r3', 'Gi0/0/1', '192.168.3.1', 24);
      b.ip('pc1', 'Ethernet', '192.168.1.10', 24, '192.168.1.1');
      b.ip('pc3', 'Ethernet', '192.168.3.10', 24, '192.168.3.1');
      b.cable('r1', 'Gi0/0/1', 'r2', 'Gi0/0/0', 'crossover');
      b.cable('r2', 'Gi0/0/1', 'r3', 'Gi0/0/0', 'crossover');
      b.cable('r1', 'Gi0/0/0', 'pc1', 'Ethernet');
      b.cable('r3', 'Gi0/0/1', 'pc3', 'Ethernet');
      return b.doc;
    },
    tasks: [
      { id: 'r1', text: 'R1: a default route to R2 (0.0.0.0/0 via 10.0.12.2).', hint: 'ip route 0.0.0.0 0.0.0.0 10.0.12.2', check: (c) => c.d('r1')!.routes.some((r) => r.prefix === '0.0.0.0/0' && r.via === '10.0.12.2') || no('no default route via 10.0.12.2') },
      { id: 'r2', text: 'R2: static routes to 192.168.1.0/24 and 192.168.3.0/24.', hint: 'ip route 192.168.1.0 255.255.255.0 10.0.12.1 (and the other LAN via 10.0.23.2)', check: (c) => all(c.d('r2')!.routes.some((r) => r.prefix === '192.168.1.0/24') || no('R2 has no route to 192.168.1.0/24'), c.d('r2')!.routes.some((r) => r.prefix === '192.168.3.0/24') || no('R2 has no route to 192.168.3.0/24')) },
      { id: 'r3', text: 'R3: a static route back to 192.168.1.0/24.', hint: 'ip route 192.168.1.0 255.255.255.0 10.0.23.1', check: (c) => c.d('r3')!.routes.some((r) => r.prefix === '192.168.1.0/24' || r.prefix === '0.0.0.0/0') || no('R3 has no route back to PC1') },
      { id: 'e2e', text: 'PC1 reaches PC3 (and traceroute shows R1, R2, R3).', hint: 'Return traffic needs a route too.', check: (c) => c.ping('pc1', '192.168.3.10') },
    ],
  },
  {
    id: 'ospf',
    title: 'OSPF single-area and multi-area',
    level: 'CCNA',
    topic: 'Routing',
    minutes: 35,
    intro: 'Bring up OSPF on three routers, set router IDs, keep LANs passive, then move R3’s LAN into area 1.',
    build() {
      const b = builder();
      b.dev('r1', 'isr4331', 'R1', 360, 40);
      b.dev('r2', 'isr4331', 'R2', 160, 260);
      b.dev('r3', 'isr4331', 'R3', 560, 260);
      b.dev('pc1', 'optiplex', 'PC1', 360, -140);
      b.dev('pc3', 'optiplex', 'PC3', 760, 380);
      b.ip('r1', 'Gi0/0/0', '10.0.12.1', 30);
      b.ip('r2', 'Gi0/0/0', '10.0.12.2', 30);
      b.ip('r1', 'Gi0/0/1', '10.0.13.1', 30);
      b.ip('r3', 'Gi0/0/0', '10.0.13.2', 30);
      b.ip('r2', 'Gi0/0/1', '10.0.23.1', 30);
      b.ip('r3', 'Gi0/0/1', '10.0.23.2', 30);
      b.ip('r1', 'Gi0/0/2', '192.168.1.1', 24);
      b.ip('r3', 'Gi0/0/2', '192.168.3.1', 24);
      b.ip('pc1', 'Ethernet', '192.168.1.10', 24, '192.168.1.1');
      b.ip('pc3', 'Ethernet', '192.168.3.10', 24, '192.168.3.1');
      b.cable('r1', 'Gi0/0/0', 'r2', 'Gi0/0/0', 'crossover');
      b.cable('r1', 'Gi0/0/1', 'r3', 'Gi0/0/0', 'crossover');
      b.cable('r2', 'Gi0/0/1', 'r3', 'Gi0/0/1', 'crossover');
      // Gi0/0/2 on the ISR 4331 is an SFP port: the LANs hang off a small switch each.
      b.dev('s1', 'c2960x24', 'LAN1-SW', 360, -60);
      b.dev('s3', 'c2960x24', 'LAN3-SW', 760, 260);
      b.cable('r1', 'Gi0/0/2', 's1', 'Gi0/25', 'fiber');
      b.cable('r3', 'Gi0/0/2', 's3', 'Gi0/25', 'fiber');
      b.cable('s1', 'Gi0/1', 'pc1', 'Ethernet');
      b.cable('s3', 'Gi0/1', 'pc3', 'Ethernet');
      return b.doc;
    },
    tasks: [
      { id: 'rid', text: 'Set router IDs 1.1.1.1, 2.2.2.2 and 3.3.3.3.', hint: 'router ospf 1 → router-id 1.1.1.1', check: (c) => all(...[['r1', '1.1.1.1'], ['r2', '2.2.2.2'], ['r3', '3.3.3.3']].map(([r, id]) => c.cp.routerIds[r] === id || no(`${c.d(r)?.name} router ID is ${c.cp.routerIds[r] ?? 'unset'}`))) },
      { id: 'adj', text: 'Advertise every link in area 0; all three adjacencies reach FULL.', hint: 'network 10.0.0.0 0.0.255.255 area 0 on each router', check: (c) => { const full = c.cp.ospf.filter((n) => n.state === 'FULL').length; return full >= 6 || no(`${full / 2} of 3 adjacencies are FULL${c.cp.ospf.find((n) => n.reason) ? `: ${c.cp.ospf.find((n) => n.reason)!.reason}` : ''}`); } },
      { id: 'passive', text: 'Advertise both LANs and make the LAN interfaces passive.', hint: 'network 192.168.1.0 0.0.0.255 area 0; passive-interface g0/0/2', check: (c) => all(c.i('r1', 'Gi0/0/2')?.ospf?.passive || no('R1 Gi0/0/2 is not a passive OSPF interface'), c.i('r3', 'Gi0/0/2')?.ospf?.passive || no('R3 Gi0/0/2 is not a passive OSPF interface')) },
      { id: 'ping', text: 'PC1 reaches PC3.', hint: 'Every router needs both LANs in its table (show ip route ospf).', check: (c) => c.ping('pc1', '192.168.3.10') },
      { id: 'area1', text: 'Move R3’s LAN (Gi0/0/2) into area 1: R1 now sees it as O IA.', hint: 'router ospf 1 on R3 → network 192.168.3.0 0.0.0.255 area 1 (and remove the area 0 statement)', check: (c) => (c.cp.routes.r1 ?? []).some((r) => r.prefix === '192.168.3.0/24' && r.code === 'O IA') || no('R1 does not have 192.168.3.0/24 as O IA') },
    ],
  },
  {
    id: 'acl',
    title: 'Standard and extended ACLs',
    level: 'CCNA',
    topic: 'Security',
    minutes: 30,
    intro: 'Users may browse the intranet server but not SSH to it; only the admin PC may SSH. Then block one user from the server LAN entirely.',
    build() {
      const b = builder();
      b.dev('r1', 'isr4331', 'R1', 360, 120);
      b.dev('s1', 'c2960x24', 'USERS-SW', 160, 300);
      b.dev('user', 'optiplex', 'USER-PC', 60, 480);
      b.dev('admin', 'optiplex', 'ADMIN-PC', 260, 480);
      b.dev('srv', 'services-server', 'INTRANET', 600, 300);
      b.ip('r1', 'Gi0/0/0', '10.1.1.1', 24);
      b.ip('r1', 'Gi0/0/1', '10.2.2.1', 24);
      b.ip('user', 'Ethernet', '10.1.1.20', 24, '10.1.1.1');
      b.ip('admin', 'Ethernet', '10.1.1.5', 24, '10.1.1.1');
      b.ip('srv', 'eno1', '10.2.2.10', 24, '10.2.2.1');
      b.doc.devices.find((d) => d.id === 'srv')!.listening = [22, 80, 443];
      b.cable('r1', 'Gi0/0/0', 's1', 'Gi0/24');
      b.cable('s1', 'Gi0/1', 'user', 'Ethernet');
      b.cable('s1', 'Gi0/2', 'admin', 'Ethernet');
      b.dev('guest', 'thinkpad', 'GUEST-LAPTOP', 460, 480);
      b.ip('guest', 'Ethernet', '10.1.1.30', 24, '10.1.1.1');
      b.cable('s1', 'Gi0/3', 'guest', 'Ethernet');
      b.cable('r1', 'Gi0/0/1', 'srv', 'eno1');
      return b.doc;
    },
    tasks: [
      { id: 'ext', text: 'Create extended ACL USERS-IN: permit SSH from 10.1.1.5 to 10.2.2.10, deny other SSH to it, permit web (80 and 443), deny everything else to 10.2.2.0/24, permit any. Apply it inbound on Gi0/0/0.', hint: 'ip access-list extended USERS-IN → permit tcp host 10.1.1.5 host 10.2.2.10 eq 22 → deny tcp any host 10.2.2.10 eq 22 → permit tcp any host 10.2.2.10 eq 80 … → ip access-group USERS-IN in', check: (c) => all(c.i('r1', 'Gi0/0/0')?.aclIn === 'USERS-IN' || no('USERS-IN is not applied inbound on Gi0/0/0'), !!c.d('r1')?.acls?.find((a) => a.name === 'USERS-IN' && a.type === 'extended') || no('USERS-IN is not defined')) },
      { id: 'web', text: 'USER-PC can open http://10.2.2.10 but not SSH to it.', hint: 'Simulation: TCP 80 delivered, TCP 22 blocked.', check: (c) => all(c.tcp('user', '10.2.2.10', 80), not(c.tcp('user', '10.2.2.10', 22), 'USER-PC can still SSH to INTRANET')) },
      { id: 'admin', text: 'ADMIN-PC can SSH to INTRANET.', hint: 'Order matters: the permit for 10.1.1.5 must come before the deny.', check: (c) => c.tcp('admin', '10.2.2.10', 22) },
      { id: 'std', text: 'With a standard ACL (number 10) applied outbound on Gi0/0/1, block GUEST-LAPTOP (10.1.1.30) from the server LAN entirely; USER-PC still browses and ADMIN-PC still uses SSH.', hint: 'access-list 10 deny host 10.1.1.30 → access-list 10 permit any → interface g0/0/1 → ip access-group 10 out (standard ACLs go close to the destination)', check: (c) => all(c.i('r1', 'Gi0/0/1')?.aclOut === '10' || no('ACL 10 is not applied outbound on Gi0/0/1'), not(c.tcp('guest', '10.2.2.10', 80), 'GUEST-LAPTOP still reaches the server'), c.tcp('user', '10.2.2.10', 80), c.tcp('admin', '10.2.2.10', 22)) },
    ],
  },
  {
    id: 'nat',
    title: 'NAT: PAT for users and static NAT for a server',
    level: 'CCNA',
    topic: 'IP services',
    minutes: 25,
    intro: 'Give the office internet access through one public address, and publish the web server on its own public address.',
    build() {
      const b = builder();
      b.dev('edge', 'isr4331', 'EDGE', 360, 120);
      b.dev('s1', 'c2960x24', 'LAN-SW', 160, 300);
      b.dev('pc1', 'optiplex', 'PC1', 60, 480);
      b.dev('web', 'services-server', 'WEB', 260, 480);
      b.dev('inet', 'optiplex', 'INTERNET-HOST', 640, 300);
      b.ip('edge', 'Gi0/0/0', '192.168.1.1', 24);
      b.ip('edge', 'Gi0/0/1', '203.0.113.1', 24);
      b.ip('pc1', 'Ethernet', '192.168.1.20', 24, '192.168.1.1');
      b.ip('web', 'eno1', '192.168.1.10', 24, '192.168.1.1');
      b.ip('inet', 'Ethernet', '203.0.113.50', 24, '203.0.113.1');
      b.doc.devices.find((d) => d.id === 'web')!.listening = [22, 80, 443];
      b.cable('edge', 'Gi0/0/0', 's1', 'Gi0/24');
      b.cable('s1', 'Gi0/1', 'pc1', 'Ethernet');
      b.cable('s1', 'Gi0/2', 'web', 'eno1');
      b.cable('edge', 'Gi0/0/1', 'inet', 'Ethernet');
      b.note('Pretend INTERNET-HOST has no route back to 192.168.1.0/24: only translated traffic is realistic.', 560, 120, 300, 60);
      return b.doc;
    },
    tasks: [
      { id: 'roles', text: 'Mark Gi0/0/0 as ip nat inside and Gi0/0/1 as ip nat outside.', hint: 'interface g0/0/0 → ip nat inside', check: (c) => all(c.i('edge', 'Gi0/0/0')?.nat === 'inside' || no('Gi0/0/0 is not inside'), c.i('edge', 'Gi0/0/1')?.nat === 'outside' || no('Gi0/0/1 is not outside')) },
      { id: 'pat', text: 'Configure PAT: access-list 1 for 192.168.1.0/24 and ip nat inside source list 1 interface Gi0/0/1 overload. PC1 reaches INTERNET-HOST from 203.0.113.1.', hint: 'access-list 1 permit 192.168.1.0 0.0.0.255; ip nat inside source list 1 interface g0/0/1 overload', check: (c) => { const t = ping(c.doc, 'pc1', '203.0.113.50', 1)[0]; return all(c.d('edge')?.natOverload?.outside === 'Gi0/0/1' || no('no PAT overload on Gi0/0/1'), t.status === 'delivered' || no(t.reason), t.hops.some((h) => h.decision === 'nat') || no('the packet was not translated')); } },
      { id: 'static', text: 'Publish WEB (192.168.1.10) as 203.0.113.10 with static NAT; INTERNET-HOST opens http://203.0.113.10.', hint: 'ip nat inside source static 192.168.1.10 203.0.113.10', check: (c) => all(!!c.d('edge')?.staticNat?.some((n) => n.inside === '192.168.1.10' && n.outside === '203.0.113.10') || no('no static NAT for WEB'), c.tcp('inet', '203.0.113.10', 80)) },
    ],
  },
  {
    id: 'fhrp',
    title: 'First-hop redundancy with HSRP',
    level: 'CCNA',
    topic: 'Redundancy',
    minutes: 25,
    intro: 'Two routers share the gateway 10.0.0.1. R1 should be active; when it fails, R2 takes over and users keep working.',
    build() {
      const b = builder();
      b.dev('r1', 'isr4331', 'R1', 200, 60);
      b.dev('r2', 'isr4331', 'R2', 520, 60);
      b.dev('s1', 'c2960x24', 'SW1', 360, 220);
      b.dev('pc1', 'optiplex', 'PC1', 360, 400);
      b.dev('srv', 'services-server', 'DC-SRV', 360, -120);
      b.dev('core', 'c2960x24', 'CORE-SW', 360, -20);
      b.ip('r1', 'Gi0/0/0', '10.0.0.2', 24);
      b.ip('r2', 'Gi0/0/0', '10.0.0.3', 24);
      b.ip('r1', 'Gi0/0/1', '10.9.9.2', 24);
      b.ip('r2', 'Gi0/0/1', '10.9.9.3', 24);
      b.ip('srv', 'eno1', '10.9.9.10', 24, '10.9.9.2');
      b.ip('pc1', 'Ethernet', '10.0.0.50', 24, '10.0.0.1');
      b.cable('r1', 'Gi0/0/0', 's1', 'Gi0/1');
      b.cable('r2', 'Gi0/0/0', 's1', 'Gi0/2');
      b.cable('s1', 'Gi0/10', 'pc1', 'Ethernet');
      b.cable('r1', 'Gi0/0/1', 'core', 'Gi0/1');
      b.cable('r2', 'Gi0/0/1', 'core', 'Gi0/2');
      b.cable('core', 'Gi0/10', 'srv', 'eno1');
      b.doc.devices.find((d) => d.id === 'srv')!.routes = [{ prefix: '10.0.0.0/24', via: '10.9.9.3', kind: 'static' }];
      return b.doc;
    },
    tasks: [
      { id: 'hsrp', text: 'Configure HSRP group 1 with virtual IP 10.0.0.1 on both routers’ Gi0/0/0.', hint: 'standby 1 ip 10.0.0.1', check: (c) => { const g = c.cp.hsrp.find((x) => x.vip === '10.0.0.1' && x.proto === 'hsrp'); return (g && g.members.length === 2) || no('HSRP group 1 does not have both routers'); } },
      { id: 'active', text: 'Make R1 active: priority 110 with preempt.', hint: 'standby 1 priority 110, standby 1 preempt', check: (c) => { const g = c.cp.hsrp.find((x) => x.vip === '10.0.0.1'); return (g?.active?.device === 'r1' && !!c.i('r1', 'Gi0/0/0')?.hsrp?.preempt) || no(`active router is ${g?.active ? c.d(g.active.device)?.name : 'none'}`); } },
      { id: 'reach', text: 'PC1 reaches DC-SRV through the virtual gateway.', hint: 'show standby brief', check: (c) => c.ping('pc1', '10.9.9.10') },
      { id: 'failover', text: 'Shut down R1 Gi0/0/0: R2 becomes active and PC1 still reaches DC-SRV.', hint: 'interface g0/0/0 on R1 → shutdown', check: (c) => { const g = c.cp.hsrp.find((x) => x.vip === '10.0.0.1'); return all(!!c.i('r1', 'Gi0/0/0')?.shutdown || no('R1 Gi0/0/0 is still up'), g?.active?.device === 'r2' || no('R2 is not active'), c.ping('pc1', '10.9.9.10')); } },
    ],
  },
  {
    id: 'eigrp',
    title: 'EIGRP: neighbours, routes and a broken adjacency',
    level: 'CCNP',
    topic: 'Routing',
    minutes: 30,
    intro: 'Three routers run EIGRP AS 100. R3 was configured by someone else and will not peer. Find out why and fix it.',
    build() {
      const b = builder();
      b.dev('r1', 'isr4331', 'R1', 360, 40);
      b.dev('r2', 'isr4331', 'R2', 160, 260);
      b.dev('r3', 'isr4331', 'R3', 560, 260);
      b.ip('r1', 'Gi0/0/0', '10.0.12.1', 30);
      b.ip('r2', 'Gi0/0/0', '10.0.12.2', 30);
      b.ip('r1', 'Gi0/0/1', '10.0.13.1', 30);
      b.ip('r3', 'Gi0/0/0', '10.0.13.2', 30);
      b.ip('r3', 'Gi0/0/1', '172.16.3.1', 24);
      b.ip('r2', 'Gi0/0/1', '172.16.2.1', 24);
      for (const [r, p] of [['r3', 'Gi0/0/0'], ['r3', 'Gi0/0/1']]) b.set(r, p, { eigrp: { as: 200 } });
      b.doc.devices.find((d) => d.id === 'r3')!.eigrpProcess = { as: 200 };
      b.cable('r1', 'Gi0/0/0', 'r2', 'Gi0/0/0', 'crossover');
      b.cable('r1', 'Gi0/0/1', 'r3', 'Gi0/0/0', 'crossover');
      return b.doc;
    },
    tasks: [
      { id: 'r1r2', text: 'Run EIGRP AS 100 on R1 and R2 for all their networks (no auto-summary). R1 and R2 become neighbours.', hint: 'router eigrp 100 → network 10.0.0.0 → network 172.16.0.0 → no auto-summary', check: (c) => c.cp.eigrp.some((n) => n.device === 'r1' && n.peer === 'r2' && n.up) || no('R1 and R2 are not EIGRP neighbours') },
      { id: 'why', text: 'show ip eigrp neighbors on R1: why is R3 missing? Fix R3 without changing R1.', hint: 'Compare the AS numbers: they must match.', check: (c) => c.cp.eigrp.some((n) => n.device === 'r1' && n.peer === 'r3' && n.up) || no(c.cp.eigrp.find((n) => n.device === 'r1' && n.peer === 'r3')?.reason ?? 'R1 and R3 are not neighbours') },
      { id: 'routes', text: 'R2 learns 172.16.3.0/24 as a D route (AD 90).', hint: 'show ip route eigrp on R2', check: (c) => (c.cp.routes.r2 ?? []).some((r) => r.prefix === '172.16.3.0/24' && r.code === 'D') || no('R2 has no EIGRP route to 172.16.3.0/24') },
      { id: 'passive', text: 'Make the LAN interfaces (Gi0/0/1 on R2 and R3) passive.', hint: 'passive-interface g0/0/1', check: (c) => all(c.i('r2', 'Gi0/0/1')?.eigrp?.passive || no('R2 Gi0/0/1 not passive'), c.i('r3', 'Gi0/0/1')?.eigrp?.passive || no('R3 Gi0/0/1 not passive')) },
    ],
  },
  {
    id: 'vtp-dtp',
    title: 'VTP and DTP: propagate VLANs safely',
    level: 'CCNP',
    topic: 'VLANs',
    minutes: 30,
    intro: 'Use VTP to push VLANs from the distribution switch, let DTP build the trunks, and avoid the VTP bomb when an old lab switch shows up.',
    build() {
      const b = builder();
      b.dev('d1', 'c2960x24', 'DSW1', 360, 40);
      b.dev('a1', 'c2960x24', 'ASW1', 160, 240);
      b.dev('a2', 'c2960x24', 'ASW2', 560, 240);
      b.dev('old', 'c2960x24', 'OLD-LAB-SW', 760, 420, { vtp: { mode: 'server', domain: 'CORP', revision: 42 }, vlans: { 1: 'default', 500: 'TEST' } });
      b.cable('d1', 'Gi0/1', 'a1', 'Gi0/24', 'crossover');
      b.cable('d1', 'Gi0/2', 'a2', 'Gi0/24', 'crossover');
      b.note('OLD-LAB-SW has VTP revision 42 in domain CORP. Do not trunk it to the network until task 4.', 760, 320, 300, 60);
      return b.doc;
    },
    tasks: [
      { id: 'vtp', text: 'VTP domain CORP everywhere: DSW1 server, ASW1 and ASW2 clients.', hint: 'vtp domain CORP; vtp mode server (DSW1) / vtp mode client (access)', check: (c) => all(c.d('d1')?.vtp?.mode === 'server' || no('DSW1 is not a VTP server'), ...['a1', 'a2'].map((s) => (c.d(s)?.vtp?.mode === 'client' && c.d(s)?.vtp?.domain === 'CORP') || no(`${c.d(s)?.name} is not a CORP client`))) },
      { id: 'dtp', text: 'Let DTP form the trunks: DSW1 Gi0/1-2 dynamic desirable, access uplinks left as dynamic auto.', hint: 'interface range g0/1 - 2 → switchport mode dynamic desirable; uplinks: switchport mode dynamic auto', check: (c) => all(...[['d1', 'Gi0/1'], ['d1', 'Gi0/2'], ['a1', 'Gi0/24'], ['a2', 'Gi0/24']].map(([s, p]) => trunk(c, s, p) || no(`${c.d(s)?.name} ${p} is not trunking`))) },
      { id: 'push', text: 'Create VLAN 10 USERS and VLAN 20 VOICE on DSW1; they appear on both access switches.', hint: 'show vtp status shows the same revision everywhere', check: (c) => all(...['a1', 'a2'].flatMap((s) => [vlanIs(c, s, 10, 'USERS') || no(`${c.d(s)?.name} has no VLAN 10 USERS`), vlanIs(c, s, 20, 'VOICE') || no(`${c.d(s)?.name} has no VLAN 20 VOICE`)])) },
      { id: 'safe', text: 'Connect OLD-LAB-SW to ASW2 Gi0/1 as a trunk without losing VLANs 10 and 20 (reset its revision first: set it to transparent, then client).', hint: 'Changing to transparent mode resets the configuration revision to 0.', check: (c) => all(linkUp(c, 'old', c.d('old')!.interfaces.find((i) => c.doc.cables.some((x) => (x.a.device === 'old' && x.a.port === i.name) || (x.b.device === 'old' && x.b.port === i.name)))?.name ?? 'Gi0/1') || no('OLD-LAB-SW is not connected yet'), vlanIs(c, 'a1', 10) || no('VLAN 10 was wiped: VTP bomb!'), vlanIs(c, 'd1', 20) || no('VLAN 20 was wiped on DSW1')) },
    ],
  },
  {
    id: 'stp-guard',
    title: 'STP protection: root guard and BPDU guard',
    level: 'CCNP',
    topic: 'STP',
    minutes: 20,
    intro: 'Keep the core as root no matter what gets plugged in, and shut edge ports that receive BPDUs.',
    build() {
      const b = builder();
      b.dev('core', 'c2960x24', 'CORE', 360, 40, { stp: { enabled: true, priority: 4096, mode: 'rapid-pvst' } });
      b.dev('acc', 'c2960x24', 'ACCESS', 360, 240);
      b.dev('rogue', 'c2960x24', 'DESK-SWITCH', 640, 420, { stp: { enabled: true, priority: 0 } });
      b.dev('pc', 'optiplex', 'PC1', 160, 420);
      b.ip('pc', 'Ethernet', '10.0.0.20', 24);
      b.set('core', 'Gi0/1', { mode: 'trunk', allowedVlans: 'all', nativeVlan: 1 });
      b.set('acc', 'Gi0/24', { mode: 'trunk', allowedVlans: 'all', nativeVlan: 1 });
      b.cable('core', 'Gi0/1', 'acc', 'Gi0/24', 'trunk');
      b.cable('acc', 'Gi0/1', 'pc', 'Ethernet');
      b.note('DESK-SWITCH (priority 0) is not plugged in yet.', 640, 330, 240, 50);
      return b.doc;
    },
    tasks: [
      { id: 'root', text: 'CORE is the root bridge.', hint: 'Its priority is already 4096.', check: (c) => c.cp.stp.core?.isRoot || no('CORE is not root') },
      { id: 'guards', text: 'On ACCESS: root guard on Gi0/2 (towards future switches); PortFast + BPDU guard on Gi0/1 and Gi0/3.', hint: 'interface g0/2 → spanning-tree guard root; interface range g0/1 , g0/3 → spanning-tree portfast → spanning-tree bpduguard enable', check: (c) => all(c.i('acc', 'Gi0/2')?.rootGuard || no('no root guard on Gi0/2'), ...['Gi0/1', 'Gi0/3'].map((p) => (c.i('acc', p)?.portfast && c.i('acc', p)?.bpduGuard) || no(`${p} lacks PortFast or BPDU guard`))) },
      { id: 'rg', text: 'Plug DESK-SWITCH into ACCESS Gi0/2 with a trunk: CORE stays root and Gi0/2 goes root-inconsistent.', hint: 'Cable DESK-SWITCH Gi0/1 to ACCESS Gi0/2 (make both trunks).', check: (c) => all(c.cp.stp.core?.isRoot || no('CORE lost the root role'), c.cp.stp.acc?.ports['Gi0/2']?.role === 'root-inconsistent' || no('Gi0/2 is not root-inconsistent (is DESK-SWITCH cabled to it?)')) },
      { id: 'bg', text: 'Move DESK-SWITCH to Gi0/3: BPDU guard err-disables the port.', hint: 'Reconnect the cable end from Gi0/2 to Gi0/3.', check: (c) => /BPDU/.test(c.i('acc', 'Gi0/3')?.errDisabled ?? '') || c.log.some((l) => l.deviceId === 'acc' && /BPDUGUARD/.test(l.text)) || no('Gi0/3 has not been err-disabled by BPDU guard') },
    ],
  },
];


// ---------------- more labs: getting started, enterprise builds, security, SOC, wireless ----------------

/** A working, error-free cable between two devices (optionally on specific ports). */
const cabled = (c: Ctx, a: string, b: string, pa?: string, pb?: string): TaskResult => {
  const cab = c.doc.cables.find((x) => (x.a.device === a && x.b.device === b && (!pa || x.a.port === pa) && (!pb || x.b.port === pb)) || (x.a.device === b && x.b.device === a && (!pb || x.a.port === pb) && (!pa || x.b.port === pa)));
  if (!cab) return no(`${c.d(a)?.name} is not cabled to ${c.d(b)?.name}${pa ? ` ${pa}` : ''}${pb ? ` → ${pb}` : ''}`);
  const st = cableStatus(c.doc, cab);
  if (st.state === 'down' || st.state === 'disabled') return no(`the cable between ${c.d(a)?.name} and ${c.d(b)?.name} has no link: ${st.issues[0]?.message ?? st.state}`);
  return { ok: true };
};
const hasIp = (c: Ctx, dev: string, port: string, ip: string, prefix?: number): TaskResult => {
  const i = c.i(dev, port);
  if (i?.ip !== ip) return no(`${c.d(dev)?.name} ${port} has ${i?.ip ?? 'no address'}, expected ${ip}`);
  if (prefix !== undefined && i.prefix !== prefix) return no(`${c.d(dev)?.name} ${port} has /${i.prefix}, expected /${prefix}`);
  return { ok: true };
};
const rule = (dev: Device | undefined, f: (r: Device['firewall'][number]) => boolean) => !!dev?.firewall.some((r) => r.enabled && f(r));

const MORE: Workbook[] = [
  {
    id: 'first-network',
    title: 'Your first network: cable it, address it, ping it',
    level: 'Foundations',
    category: 'Getting started',
    topic: 'Cabling and IP addressing',
    minutes: 15,
    intro: 'Two PCs, one switch and a laptop, all still in their boxes. Cable everything, give the PCs addresses, prove they can talk, then plug a console cable into the switch the way you would on day one.',
    build() {
      const b = builder();
      b.dev('s1', 'c2960x24', 'SW1', 360, 120);
      b.dev('pc1', 'optiplex', 'PC1', 180, 340);
      b.dev('pc2', 'optiplex', 'PC2', 540, 340);
      b.dev('lap', 'thinkpad', 'ADMIN-LAPTOP', 640, 120);
      b.note('Plan: PC1 192.168.1.10/24, PC2 192.168.1.11/24.\nUse the Cable tool (C): click a device, pick a port, click the other device.', 120, 40, 330, 70);
      return b.doc;
    },
    tasks: [
      { id: 'cable', text: 'Cable PC1 and PC2 to SW1 with copper Ethernet; both links must come up (green lights).', hint: 'Cable tool → click PC1 → Ethernet → click SW1 → any free Gi port. Straight-through is right for PC to switch.', check: (c) => all(cabled(c, 'pc1', 's1'), cabled(c, 'pc2', 's1')) },
      { id: 'ip', text: 'Give PC1 192.168.1.10/24 and PC2 192.168.1.11/24.', hint: 'Select the PC → Interfaces tab, or Terminal → netsh interface ip set address "Ethernet" static 192.168.1.10 255.255.255.0', check: (c) => all(hasIp(c, 'pc1', 'Ethernet', '192.168.1.10', 24), hasIp(c, 'pc2', 'Ethernet', '192.168.1.11', 24)) },
      { id: 'ping', text: 'Ping PC2 from PC1.', hint: 'PC1 → Terminal → Design CLI → ping 192.168.1.11', check: (c) => c.ping('pc1', '192.168.1.11') },
      { id: 'console', text: 'Connect a console cable from ADMIN-LAPTOP (USB-Console) to the switch Console port.', hint: 'Choose the console (rollover) cable type in the Cable tool, or let it pick the right one automatically.', check: (c) => { const r = cabled(c, 'lap', 's1', 'USB-Console', 'Console'); return r.ok ? (c.doc.cables.find((x) => [x.a.device, x.b.device].includes('lap') && [x.a.device, x.b.device].includes('s1'))?.type === 'console' || no('that is not a console cable')) : r; } },
    ],
  },
  {
    id: 'cable-types',
    title: 'Pick the right cable: crossover, fibre and serial',
    level: 'Foundations',
    category: 'Getting started',
    topic: 'Cabling',
    minutes: 15,
    intro: 'Old PCs without auto-MDIX, switches joined by SFP fibre, and two routers on a serial WAN. Each pair only links with the right cable. Wrong cables are refused or stay down, with the reason.',
    build() {
      const b = builder();
      b.dev('la', 'legacy-pc', 'LEGACY-A', 80, 120);
      b.dev('lb', 'legacy-pc', 'LEGACY-B', 280, 120);
      b.dev('s1', 'c2960x24', 'SW1', 80, 340);
      b.dev('s2', 'c2960x24', 'SW2', 360, 340);
      b.dev('r1', 'isr4331', 'R1', 560, 120);
      b.dev('r2', 'isr4331', 'R2', 760, 120);
      b.ip('la', 'FastEthernet0', '10.0.0.1', 24);
      b.ip('lb', 'FastEthernet0', '10.0.0.2', 24);
      b.ip('r1', 'Se0/1/0', '10.1.1.1', 30);
      b.ip('r2', 'Se0/1/0', '10.1.1.2', 30);
      b.note('LEGACY PCs: 100 Mb NICs, no auto-MDIX.\nSW1–SW2: use the SFP ports (Gi0/25-28).\nR1–R2: serial Se0/1/0 on both.', 520, 300, 320, 80);
      return b.doc;
    },
    tasks: [
      { id: 'xover', text: 'Join LEGACY-A directly to LEGACY-B so the link comes up, and ping 10.0.0.2 from LEGACY-A.', hint: 'Two PCs without auto-MDIX need a crossover cable.', check: (c) => all(cabled(c, 'la', 'lb'), c.ping('la', '10.0.0.2')) },
      { id: 'fiber', text: 'Join SW1 and SW2 on their SFP ports with fibre; the link must come up.', hint: 'Gi0/25 to Gi0/25, cable type fibre.', check: (c) => { const cab = c.doc.cables.find((x) => [x.a.device, x.b.device].sort().join() === 's1,s2'); return all(cabled(c, 's1', 's2'), cab?.type === 'fiber' || no('the switches are joined, but not with fibre on SFP ports')); } },
      { id: 'serial', text: 'Join R1 Se0/1/0 to R2 Se0/1/0 with a serial cable and ping 10.1.1.2 from R1.', hint: 'Cable type serial; then R1 Terminal → ping 10.1.1.2', check: (c) => all(cabled(c, 'r1', 'r2', 'Se0/1/0', 'Se0/1/0'), c.ping('r1', '10.1.1.2')) },
    ],
  },
  {
    id: 'subnet-plan',
    title: 'Subnet a /24 into four LANs and route between them',
    level: 'Foundations',
    category: 'Getting started',
    topic: 'Subnetting',
    minutes: 25,
    intro: 'You were given 192.168.50.0/24 for three departments. Split it into /26 subnets, give the router the first address in each, and address one PC per department so everyone can reach everyone.',
    build() {
      const b = builder();
      b.dev('r1', 'isr4331', 'R1', 360, 60);
      b.dev('pc1', 'optiplex', 'SALES-PC', 120, 320);
      b.dev('pc2', 'optiplex', 'HR-PC', 360, 320);
      b.dev('pc3', 'optiplex', 'IT-PC', 600, 320);
      b.dev('s3', 'c2960x24', 'IT-SW', 600, 180);
      b.cable('r1', 'Gi0/0/0', 'pc1', 'Ethernet');
      b.cable('r1', 'Gi0/0/1', 'pc2', 'Ethernet');
      b.cable('r1', 'Gi0/0/2', 's3', 'Gi0/25', 'fiber');
      b.cable('s3', 'Gi0/1', 'pc3', 'Ethernet');
      b.note('192.168.50.0/24 → /26 blocks of 64:\nSALES first block, HR second, IT third.\nRouter = first usable, PC = second usable.', 680, 20, 300, 80);
      return b.doc;
    },
    tasks: [
      { id: 'router', text: 'R1: Gi0/0/0 192.168.50.1/26, Gi0/0/1 192.168.50.65/26, Gi0/0/2 192.168.50.129/26.', hint: '/26 = 255.255.255.192. Blocks start at .0, .64, .128, .192.', check: (c) => all(hasIp(c, 'r1', 'Gi0/0/0', '192.168.50.1', 26), hasIp(c, 'r1', 'Gi0/0/1', '192.168.50.65', 26), hasIp(c, 'r1', 'Gi0/0/2', '192.168.50.129', 26)) },
      { id: 'pcs', text: 'Give each PC the second usable address of its subnet, mask /26, gateway = the router address.', hint: 'SALES-PC 192.168.50.2, HR-PC 192.168.50.66, IT-PC 192.168.50.130', check: (c) => all(hasIp(c, 'pc1', 'Ethernet', '192.168.50.2', 26), hasIp(c, 'pc2', 'Ethernet', '192.168.50.66', 26), hasIp(c, 'pc3', 'Ethernet', '192.168.50.130', 26), c.i('pc1', 'Ethernet')?.gateway === '192.168.50.1' || no('SALES-PC gateway is wrong'), c.i('pc2', 'Ethernet')?.gateway === '192.168.50.65' || no('HR-PC gateway is wrong'), c.i('pc3', 'Ethernet')?.gateway === '192.168.50.129' || no('IT-PC gateway is wrong')) },
      { id: 'reach', text: 'SALES-PC reaches HR-PC and IT-PC.', hint: 'If one fails, compare the PC mask and gateway with the router interface.', check: (c) => all(c.ping('pc1', '192.168.50.66'), c.ping('pc1', '192.168.50.130')) },
    ],
  },
  {
    id: 'small-office',
    title: 'Set up a small office: router, DHCP, printer and internet',
    level: 'Enterprise',
    category: 'Enterprise builds',
    topic: 'Small office build',
    minutes: 35,
    intro: 'A new branch office: one router, one PoE switch, three PCs and a printer. Finish the cabling, address the router, hand out addresses with DHCP, give the printer a fixed address and share one public IP for internet access.',
    build() {
      const b = builder();
      b.dev('edge', 'isr4331', 'EDGE', 360, 40);
      b.dev('sw', 'c2960x24ps', 'OFFICE-SW', 360, 220);
      b.dev('inet', 'optiplex', 'INTERNET-HOST', 700, 40);
      b.dev('prn', 'network-printer', 'PRINTER', 640, 380);
      ['pc1', 'pc2', 'pc3'].forEach((id, k) => {
        b.dev(id, 'optiplex', `STAFF-PC${k + 1}`, 120 + k * 160, 420);
        b.set(id, 'Ethernet', { dhcp: true });
        b.cable('sw', `Gi0/${k + 1}`, id, 'Ethernet');
      });
      b.ip('edge', 'Gi0/0/1', '203.0.113.2', 24);
      b.ip('inet', 'Ethernet', '203.0.113.50', 24, '203.0.113.2');
      b.cable('edge', 'Gi0/0/1', 'inet', 'Ethernet');
      b.note('LAN 192.168.10.0/24, gateway 192.168.10.1\nPrinter fixed 192.168.10.5\nISP gave us 203.0.113.2 (already on Gi0/0/1)', 40, 40, 300, 80);
      return b.doc;
    },
    tasks: [
      { id: 'cable', text: 'Cable OFFICE-SW Gi0/24 to EDGE Gi0/0/0, and the PRINTER to a free switch port.', hint: 'Cable tool (C). Router to switch is straight-through.', check: (c) => all(cabled(c, 'sw', 'edge', 'Gi0/24', 'Gi0/0/0'), cabled(c, 'prn', 'sw')) },
      { id: 'gw', text: 'Give EDGE Gi0/0/0 the address 192.168.10.1/24.', hint: 'interface g0/0/0 → ip address 192.168.10.1 255.255.255.0 → no shutdown', check: (c) => hasIp(c, 'edge', 'Gi0/0/0', '192.168.10.1', 24) },
      { id: 'dhcp', text: 'Create DHCP pool OFFICE on EDGE (network 192.168.10.0/24, default-router 192.168.10.1, dns-server 203.0.113.53) and renew all three PCs.', hint: 'ip dhcp pool OFFICE → network 192.168.10.0 255.255.255.0 → default-router 192.168.10.1 → dns-server 203.0.113.53; then ipconfig /renew on each PC', check: (c) => all(!!c.d('edge')?.dhcpPools?.some((p) => p.network === '192.168.10.0/24' && p.gateway === '192.168.10.1') || no('no OFFICE pool with gateway 192.168.10.1'), ...['pc1', 'pc2', 'pc3'].map((id) => (c.i(id, 'Ethernet')?.ip?.startsWith('192.168.10.') ?? false) || no(`${c.d(id)?.name} has ${c.i(id, 'Ethernet')?.ip ?? 'no address'}`))) },
      { id: 'printer', text: 'Give PRINTER the fixed address 192.168.10.5/24 (gateway 192.168.10.1); STAFF-PC2 can reach it.', hint: 'Printers need an address that never changes so PCs can find them. Select PRINTER → Interfaces.', check: (c) => { const ip = c.i('pc2', 'Ethernet')?.ip; return all(hasIp(c, 'prn', 'eth0', '192.168.10.5', 24), ip ? true : no('STAFF-PC2 has no address yet'), c.ping('pc2', '192.168.10.5')); } },
      { id: 'pat', text: 'Share the public address: NAT inside on Gi0/0/0, outside on Gi0/0/1, PAT overload. STAFF-PC1 reaches INTERNET-HOST.', hint: 'ip nat inside / ip nat outside; access-list 1 permit 192.168.10.0 0.0.0.255; ip nat inside source list 1 interface g0/0/1 overload', check: (c) => { const src = c.i('pc1', 'Ethernet')?.ip; if (!src) return no('STAFF-PC1 has no address yet'); const t = ping(c.doc, 'pc1', '203.0.113.50', 1)[0]; return all(c.d('edge')?.natOverload?.outside === 'Gi0/0/1' || no('no PAT overload on Gi0/0/1'), t.status === 'delivered' || no(t.reason), t.hops.some((h) => h.decision === 'nat') || no('the packet was not translated')); } },
    ],
  },
  {
    id: 'enterprise-campus',
    title: 'Build an enterprise campus: core, access, VLANs, routing and guest isolation',
    level: 'Enterprise',
    category: 'Enterprise builds',
    topic: 'Campus network',
    minutes: 50,
    intro: 'A two-tier campus: one layer 3 core and two access switches. Staff, servers and guests each get a VLAN; the core routes between them and sends internet traffic to the firewall. Guests must reach the internet but never the servers.',
    build() {
      const b = builder();
      b.dev('core', 'c9300-24t', 'CORE', 400, 140);
      b.dev('a1', 'c2960x24', 'ACCESS-1', 200, 300);
      b.dev('a2', 'c2960x24', 'ACCESS-2', 600, 300);
      b.dev('fw', 'dec2750', 'FW', 400, -20);
      b.dev('inet', 'optiplex', 'INTERNET-HOST', 700, -20);
      b.dev('srv', 'r650', 'APP-SRV', 760, 140);
      b.dev('st1', 'optiplex', 'STAFF-1', 120, 460);
      b.dev('st2', 'optiplex', 'STAFF-2', 520, 460);
      b.dev('g1', 'thinkpad', 'GUEST-1', 700, 460);
      b.cable('core', 'Gi1/0/1', 'a1', 'Gi0/24');
      b.cable('core', 'Gi1/0/2', 'a2', 'Gi0/24');
      b.cable('core', 'Gi1/0/10', 'srv', b.doc.devices.find((d) => d.id === 'srv')!.interfaces.find((i) => i.type === 'copper')!.name);
      b.cable('core', 'Gi1/0/24', 'fw', 'igb1');
      b.cable('fw', 'igb0', 'inet', 'Ethernet');
      b.cable('a1', 'Gi0/1', 'st1', 'Ethernet');
      b.cable('a2', 'Gi0/1', 'st2', 'Ethernet');
      b.cable('a2', 'Gi0/2', 'g1', 'Ethernet');
      const srvNic = b.doc.devices.find((d) => d.id === 'srv')!.interfaces.find((i) => i.type === 'copper')!.name;
      b.ip('srv', srvNic, '10.10.20.10', 24, '10.10.20.1');
      b.ip('st1', 'Ethernet', '10.10.10.11', 24, '10.10.10.1');
      b.ip('st2', 'Ethernet', '10.10.10.12', 24, '10.10.10.1');
      b.ip('g1', 'Ethernet', '10.10.30.21', 24, '10.10.30.1');
      b.ip('fw', 'igb0', '203.0.113.2', 24);
      b.ip('fw', 'igb1', '10.255.0.2', 30);
      b.set('fw', 'igb0', { alias: 'WAN' });
      b.set('fw', 'igb1', { alias: 'LAN' });
      b.ip('inet', 'Ethernet', '203.0.113.50', 24, '203.0.113.2');
      b.doc.devices.find((d) => d.id === 'srv')!.listening = [22, 443];
      b.doc.devices.find((d) => d.id === 'inet')!.listening = [80, 443];
      const fw = b.doc.devices.find((d) => d.id === 'fw')!;
      fw.routes = [{ prefix: '10.10.0.0/16', via: '10.255.0.1', kind: 'static', description: 'campus via CORE' }];
      fw.firewall = [{ id: 1, iface: 'LAN', src: '10.10.0.0/16', dst: 'any', proto: 'any', port: 'any', action: 'pass', log: false, enabled: true, descr: 'Campus to anywhere' }];
      b.note('VLAN 10 STAFF 10.10.10.0/24 · VLAN 20 SERVERS 10.10.20.0/24 · VLAN 30 GUEST 10.10.30.0/24\nGateways .1 on CORE SVIs. CORE Gi1/0/24 is a routed link 10.255.0.1/30 to FW (10.255.0.2).\nFW is already configured.', 40, -120, 560, 70);
      return b.doc;
    },
    tasks: [
      { id: 'vlans', text: 'Create VLAN 10 STAFF, 20 SERVERS and 30 GUEST on CORE, ACCESS-1 and ACCESS-2.', hint: 'vlan 10 → name STAFF … on each switch (or set up VTP).', check: (c) => all(...['core', 'a1', 'a2'].flatMap((s) => [vlanIs(c, s, 10, 'STAFF') || no(`${c.d(s)?.name} has no VLAN 10 STAFF`), vlanIs(c, s, 20, 'SERVERS') || no(`${c.d(s)?.name} has no VLAN 20 SERVERS`), vlanIs(c, s, 30, 'GUEST') || no(`${c.d(s)?.name} has no VLAN 30 GUEST`)])) },
      { id: 'ports', text: 'Access ports: STAFF-1 and STAFF-2 in VLAN 10, GUEST-1 in VLAN 30, APP-SRV (CORE Gi1/0/10) in VLAN 20. Uplinks (ACCESS Gi0/24, CORE Gi1/0/1-2) are trunks.', hint: 'switchport mode access / switchport access vlan …; switchport mode trunk on the uplinks', check: (c) => all(access(c, 'a1', 'Gi0/1', 10) || no('ACCESS-1 Gi0/1 is not in VLAN 10'), access(c, 'a2', 'Gi0/1', 10) || no('ACCESS-2 Gi0/1 is not in VLAN 10'), access(c, 'a2', 'Gi0/2', 30) || no('ACCESS-2 Gi0/2 is not in VLAN 30'), access(c, 'core', 'Gi1/0/10', 20) || no('CORE Gi1/0/10 is not in VLAN 20'), ...([['a1', 'Gi0/24'], ['a2', 'Gi0/24'], ['core', 'Gi1/0/1'], ['core', 'Gi1/0/2']] as const).map(([s, p]) => trunk(c, s, p) || no(`${c.d(s)?.name} ${p} is not a trunk`))) },
      { id: 'svis', text: 'On CORE: SVIs Vlan10 10.10.10.1, Vlan20 10.10.20.1, Vlan30 10.10.30.1 (/24) and ip routing. STAFF-1 reaches APP-SRV.', hint: 'ip routing; interface vlan 10 → ip address 10.10.10.1 255.255.255.0 → no shutdown', check: (c) => all(hasIp(c, 'core', 'Vlan10', '10.10.10.1'), hasIp(c, 'core', 'Vlan20', '10.10.20.1'), hasIp(c, 'core', 'Vlan30', '10.10.30.1'), !!c.d('core')?.ipRouting || no('ip routing is off on CORE'), c.ping('st1', '10.10.20.10')) },
      { id: 'edge', text: 'Make CORE Gi1/0/24 a routed port 10.255.0.1/30 and add a default route to the firewall (10.255.0.2). STAFF-2 opens https://203.0.113.50.', hint: 'interface g1/0/24 → no switchport → ip address 10.255.0.1 255.255.255.252; ip route 0.0.0.0 0.0.0.0 10.255.0.2', check: (c) => all(hasIp(c, 'core', 'Gi1/0/24', '10.255.0.1', 30), c.d('core')!.routes.some((r) => r.prefix === '0.0.0.0/0' && r.via === '10.255.0.2') || no('no default route to 10.255.0.2'), c.tcp('st2', '203.0.113.50', 443)) },
      { id: 'guest', text: 'Guest isolation: GUEST-1 opens https://203.0.113.50 but cannot reach APP-SRV; staff still can.', hint: 'Extended ACL inbound on interface Vlan30: deny ip 10.10.30.0 0.0.0.255 10.10.20.0 0.0.0.255, permit ip any any', check: (c) => all(c.tcp('g1', '203.0.113.50', 443), not(c.tcp('g1', '10.10.20.10', 443), 'GUEST-1 can still reach APP-SRV'), c.tcp('st1', '10.10.20.10', 443)) },
    ],
  },
  {
    id: 'firewall-dmz',
    title: 'Firewall zones: LAN, DMZ and a published web server',
    level: 'Security',
    category: 'Security',
    topic: 'Firewall rules',
    minutes: 30,
    intro: 'The firewall starts with no rules, so it blocks everything (implicit deny). Write the rules: staff may go out, the internet may reach the web server on HTTPS only, and the DMZ may never start connections into the LAN.',
    build() {
      const b = builder();
      b.dev('fw', 'dec2750', 'FW', 400, 120);
      b.dev('lan', 'optiplex', 'STAFF-PC', 160, 320);
      b.dev('web', 'services-server', 'WEB', 640, 320);
      b.dev('inet', 'optiplex', 'INTERNET-HOST', 400, -80);
      b.ip('fw', 'igb0', '203.0.113.1', 24);
      b.ip('fw', 'igb1', '10.0.10.1', 24);
      b.ip('fw', 'igb2', '172.16.50.1', 24);
      b.set('fw', 'igb0', { alias: 'WAN' });
      b.set('fw', 'igb1', { alias: 'LAN' });
      b.set('fw', 'igb2', { alias: 'DMZ' });
      b.ip('lan', 'Ethernet', '10.0.10.20', 24, '10.0.10.1');
      b.ip('web', 'eno1', '172.16.50.10', 24, '172.16.50.1');
      b.ip('inet', 'Ethernet', '203.0.113.50', 24, '203.0.113.1');
      b.doc.devices.find((d) => d.id === 'web')!.listening = [22, 80, 443];
      b.doc.devices.find((d) => d.id === 'inet')!.listening = [80, 443];
      b.cable('fw', 'igb0', 'inet', 'Ethernet');
      b.cable('fw', 'igb1', 'lan', 'Ethernet');
      b.cable('fw', 'igb2', 'web', 'eno1');
      b.note('Interfaces: WAN igb0, LAN igb1, DMZ igb2.\nRules are first match, top to bottom. Select FW → Firewall tab.\n(Simplified: no NAT, the lab treats all addresses as routable.)', 620, 40, 330, 80);
      return b.doc;
    },
    tasks: [
      { id: 'lan-out', text: 'Allow the LAN out: STAFF-PC opens https://203.0.113.50 and can SSH to WEB.', hint: 'Rule on interface LAN: source LAN net, destination any, protocol any, pass.', check: (c) => all(c.tcp('lan', '203.0.113.50', 443), c.tcp('lan', '172.16.50.10', 22)) },
      { id: 'publish', text: 'Publish WEB: the internet reaches 172.16.50.10 on TCP 443 only (not SSH), and the rule is logged.', hint: 'Rule on WAN: source any, destination 172.16.50.10, TCP, port 443, pass, log on.', check: (c) => all(c.tcp('inet', '172.16.50.10', 443), not(c.tcp('inet', '172.16.50.10', 22), 'the internet can SSH to WEB'), rule(c.d('fw'), (r) => r.iface.toUpperCase() === 'WAN' && r.action === 'pass' && r.log && (r.dst === '172.16.50.10' || r.dst.startsWith('172.16.50.')) ) || no('no logged WAN pass rule for WEB')) },
      { id: 'dmz', text: 'Contain the DMZ: WEB cannot open connections to STAFF-PC (if WEB is hacked, the attacker must not reach the LAN).', hint: 'Leave DMZ → LAN to the implicit deny, or add an explicit block rule on DMZ with log on.', check: (c) => all(not(c.tcp('web', '10.0.10.20', 445), 'WEB can reach STAFF-PC on SMB'), not(c.ping('web', '10.0.10.20'), 'WEB can ping STAFF-PC')) },
      { id: 'no-any', text: 'No lazy rules: there is no enabled WAN rule that passes any → any.', hint: 'A WAN "pass any any" rule publishes every internal host to the internet.', check: (c) => !rule(c.d('fw'), (r) => r.iface.toUpperCase() === 'WAN' && r.action === 'pass' && r.src === 'any' && r.dst === 'any' && r.port === 'any') || no('a WAN pass any → any rule exists') },
    ],
  },
  {
    id: 'soc-investigate',
    title: 'SOC: mirror traffic to the sensor, find the scanning host and contain it',
    level: 'SOC',
    category: 'SOC and monitoring',
    topic: 'Detection and containment',
    minutes: 30,
    intro: 'Ticket from the SIEM: "10.20.0.66 is port-scanning FILESRV". Nobody knows which desk that is. Send a copy of the server traffic to the IDS sensor, find the switch port behind 10.20.0.66, and contain it without cutting off anyone else.',
    build() {
      const b = builder();
      b.dev('sw', 'c2960x24', 'FLOOR2-SW', 400, 140);
      b.dev('r1', 'isr4331', 'R1', 400, -40);
      b.dev('fs', 'services-server', 'FILESRV', 720, 40);
      b.dev('ids', 'services-server', 'IDS-SENSOR', 720, 240);
      b.dev('u1', 'optiplex', 'DESK-11', 120, 340);
      b.dev('u2', 'optiplex', 'DESK-12', 280, 340);
      b.dev('bad', 'kali-workstation', 'DESK-14', 440, 340);
      b.dev('u3', 'optiplex', 'DESK-15', 600, 340);
      b.ip('r1', 'Gi0/0/0', '10.20.0.1', 24);
      b.ip('fs', 'eno1', '10.20.0.10', 24, '10.20.0.1');
      b.ip('ids', 'eno1', '10.20.0.250', 24, '10.20.0.1');
      b.ip('u1', 'Ethernet', '10.20.0.31', 24, '10.20.0.1');
      b.ip('u2', 'Ethernet', '10.20.0.32', 24, '10.20.0.1');
      b.ip('bad', 'Ethernet', '10.20.0.66', 24, '10.20.0.1');
      b.ip('u3', 'Ethernet', '10.20.0.35', 24, '10.20.0.1');
      b.doc.devices.find((d) => d.id === 'fs')!.listening = [22, 445, 443];
      b.cable('sw', 'Gi0/24', 'r1', 'Gi0/0/0');
      b.cable('sw', 'Gi0/10', 'fs', 'eno1');
      b.cable('sw', 'Gi0/20', 'ids', 'eno1');
      b.cable('sw', 'Gi0/3', 'u1', 'Ethernet');
      b.cable('sw', 'Gi0/4', 'u2', 'Ethernet');
      b.cable('sw', 'Gi0/7', 'bad', 'Ethernet');
      b.cable('sw', 'Gi0/8', 'u3', 'Ethernet');
      b.note('SIEM alert #4471: 10.20.0.66 → 10.20.0.10, 1,024 ports in 40 s.\nIDS sensor listens on FLOOR2-SW Gi0/20.\nDesk labels on the canvas are not trusted: prove it from the switch.', 20, -60, 360, 80);
      return b.doc;
    },
    tasks: [
      { id: 'span', text: 'Mirror FILESRV’s port (Gi0/10) to the IDS sensor on Gi0/20 with a SPAN session.', hint: 'monitor session 1 source interface g0/10; monitor session 1 destination interface g0/20', check: (c) => { const s = c.d('sw')?.span?.find((x) => x.dest === 'Gi0/20'); return all(!!s || no('no SPAN session with destination Gi0/20'), (s?.sources ?? []).includes('Gi0/10') || no('Gi0/10 is not a SPAN source')); } },
      { id: 'find', text: 'Find the port behind 10.20.0.66: look up its MAC in the ARP table on R1, then in the MAC address table on FLOOR2-SW. Add the port number to its description (e.g. "SUSPECT INC-4471").', hint: 'R1: show ip arp 10.20.0.66 → MAC; FLOOR2-SW: show mac address-table address <mac> → port. interface g0/… → description SUSPECT INC-4471', check: (c) => /suspect/i.test(c.i('sw', 'Gi0/7')?.description ?? '') || no('the port behind 10.20.0.66 is not described as SUSPECT') },
      { id: 'contain', text: 'Contain without unplugging (keep the evidence): create VLAN 999 QUARANTINE and move that port into it. DESK-14 can no longer reach FILESRV; the other desks still can.', hint: 'vlan 999 → name QUARANTINE; interface g0/7 → switchport access vlan 999', check: (c) => all(vlanIs(c, 'sw', 999, 'QUARANTINE') || no('no VLAN 999 QUARANTINE'), access(c, 'sw', 'Gi0/7', 999) || no('the suspect port is not in VLAN 999'), !c.i('sw', 'Gi0/7')?.shutdown || no('the port is shut down: quarantine it instead, so forensics can still reach it'), not(c.tcp('bad', '10.20.0.10', 445), 'DESK-14 still reaches FILESRV'), c.tcp('u1', '10.20.0.10', 445), c.tcp('u3', '10.20.0.10', 445)) },
      { id: 'harden', text: 'Stop the next rogue device: port security (maximum 1, sticky, violation restrict) on the other desk ports Gi0/3, Gi0/4 and Gi0/8.', hint: 'interface range g0/3 - 4 , g0/8 → switchport port-security, maximum 1, mac-address sticky, violation restrict', check: (c) => all(...['Gi0/3', 'Gi0/4', 'Gi0/8'].map((p) => { const ps = c.i('sw', p)?.portSecurity; return (ps?.enabled && ps.max === 1 && ps.sticky && ps.violation === 'restrict') || no(`${p} port security is not max 1 / sticky / restrict`); })) },
    ],
  },
  {
    id: 'wireless-office',
    title: 'Wireless office: power the AP, set WPA2 and join a laptop',
    level: 'Foundations',
    category: 'Wireless',
    topic: 'Wi-Fi',
    minutes: 20,
    intro: 'The new access point is still in its box. It gets power from the switch (PoE+), so cable it to the PoE switch, create a WPA2 network and join the manager’s laptop to it.',
    build() {
      const b = builder();
      b.dev('r1', 'isr4331', 'R1', 400, -20);
      b.dev('sw', 'c2960x24ps', 'POE-SW', 400, 140);
      b.dev('ap', 'c9120', 'AP-1', 640, 140);
      b.dev('lap', 'thinkpad', 'MANAGER-LAPTOP', 760, 340);
      b.ip('r1', 'Gi0/0/0', '10.30.0.1', 24);
      b.cable('sw', 'Gi0/24', 'r1', 'Gi0/0/0');
      b.doc.devices.find((d) => d.id === 'r1')!.dhcpPools = [{ name: 'WIFI', network: '10.30.0.0/24', start: '10.30.0.100', end: '10.30.0.199', gateway: '10.30.0.1', dns: ['10.30.0.1'] }];
      b.set('lap', 'Wi-Fi', { dhcp: true });
      b.note('SSID: OFFICE-WIFI · WPA2 · passphrase Salone2026!\nR1 already hands out 10.30.0.100-199.', 120, 40, 300, 60);
      return b.doc;
    },
    tasks: [
      { id: 'power', text: 'Cable AP-1 Gi0 to a POE-SW port. The AP must power up from PoE.', hint: 'A Catalyst 9120 draws 25.5 W; the 2960-X 24PS supplies PoE+.', check: (c) => all(cabled(c, 'ap', 'sw'), c.d('ap')?.power === 'running' || no(`AP-1 is ${c.d('ap')?.power}${c.d('ap')?.powerReason ? `: ${c.d('ap')?.powerReason}` : ''}`)) },
      { id: 'ssid', text: 'On AP-1, broadcast SSID OFFICE-WIFI with WPA2 and the passphrase from the note.', hint: 'Select AP-1 → Services → Wireless.', check: (c) => { const w = c.d('ap')?.wireless; return all(w?.ssid === 'OFFICE-WIFI' || no(`SSID is ${w?.ssid ?? 'not set'}`), w?.security === 'wpa2' || no(`security is ${w?.security ?? 'not set'}`), w?.key === 'Salone2026!' || no('the passphrase does not match the note')); } },
      { id: 'join', text: 'Join MANAGER-LAPTOP: same SSID, WPA2 and passphrase on the laptop, then connect its Wi-Fi to AP-1.', hint: 'Laptop → Services → Wireless profile; then Cable tool → laptop Wi-Fi → AP-1 radio0.', check: (c) => { const cab = c.doc.cables.find((x) => [x.a.device, x.b.device].includes('lap') && [x.a.device, x.b.device].includes('ap')); if (!cab) return no('the laptop is not connected to AP-1'); const st = cableStatus(c.doc, cab); return st.state === 'up' || st.state === 'degraded' || no(st.issues[0]?.message ?? 'not associated'); } },
      { id: 'dhcp', text: 'The laptop gets an address from R1 and pings 10.30.0.1.', hint: 'Laptop Terminal → ipconfig /renew → ping 10.30.0.1', check: (c) => { const ip = c.i('lap', 'Wi-Fi')?.ip; return all((!!ip && ip.startsWith('10.30.0.')) || no(`the laptop has ${ip ?? 'no address'}`), c.ping('lap', '10.30.0.1')); } },
    ],
  },
];
WORKBOOKS.push(...MORE);

const CATEGORY: Record<string, LabCategory> = {
  'basic-switch': 'Getting started',
  'vlans-trunking': 'Switching',
  stp: 'Switching',
  etherchannel: 'Switching',
  'vtp-dtp': 'Switching',
  'router-on-a-stick': 'Routing',
  'l3-switch': 'Routing',
  'static-routing': 'Routing',
  ospf: 'Routing',
  eigrp: 'Routing',
  fhrp: 'Routing',
  'port-security': 'Security',
  'dhcp-snooping': 'Security',
  acl: 'Security',
  'stp-guard': 'Security',
  dhcp: 'Services',
  nat: 'Services',
};
export const labCategory = (w: Workbook): LabCategory => w.category ?? CATEGORY[w.id] ?? 'Switching';
export const LAB_CATEGORIES: LabCategory[] = ['Getting started', 'Switching', 'Routing', 'Enterprise builds', 'Security', 'SOC and monitoring', 'Services', 'Wireless'];

export function gradeWorkbook(wb: Workbook, doc: LabDoc, log: { deviceId: string; text: string }[]): { id: string; ok: boolean; detail?: string }[] {
  const ctx = makeCtx(doc, log);
  return wb.tasks.map((t) => {
    try {
      const r = t.check(ctx);
      const v = typeof r === 'boolean' ? { ok: r } : r;
      return { id: t.id, ...v };
    } catch (e) {
      return { id: t.id, ok: false, detail: (e as Error).message };
    }
  });
}

/** used by the hover help in the UI: which hosts sit behind a port */
export { macsBehind };
