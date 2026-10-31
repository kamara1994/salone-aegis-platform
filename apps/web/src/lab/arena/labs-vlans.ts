// Chapter 8, VLANs and trunking: six assessed labs from first VLAN to timed build.
// Modelled on what the best CCNA labs do well (Packet Tracer skills assessments, NetAcad
// troubleshooting challenges, Boson-style multi-fault tickets), written fresh for this platform.
import { builder, type Ctx, type TaskResult } from '../workbooks';
import type { Device, Iface, LabDoc } from '../types';
import type { ArenaLab } from './types';

// ---------------- check helpers ----------------
const no = (detail: string): TaskResult => ({ ok: false, detail });
const all = (...r: (TaskResult | boolean)[]): TaskResult => {
  for (const x of r) {
    const v = typeof x === 'boolean' ? { ok: x } : x;
    if (!v.ok) return v;
  }
  return { ok: true };
};
const nm = (c: Ctx, id: string) => c.d(id)?.name ?? id;
const vlan = (c: Ctx, sw: string, id: number, name?: string): TaskResult => {
  const v = c.d(sw)?.vlans[id];
  if (!v) return no(`${nm(c, sw)} has no VLAN ${id}`);
  if (name && v.toUpperCase() !== name.toUpperCase()) return no(`${nm(c, sw)} VLAN ${id} is named ${v}, expected ${name}`);
  return { ok: true };
};
const access = (c: Ctx, sw: string, port: string, v: number): TaskResult => {
  const i = c.i(sw, port);
  if (!i) return no(`${nm(c, sw)} has no ${port}`);
  if ((i.mode ?? 'access') !== 'access' || i.dtp) return no(`${nm(c, sw)} ${port} is not a static access port`);
  if ((i.vlan ?? 1) !== v) return no(`${nm(c, sw)} ${port} is in VLAN ${i.vlan ?? 1}, expected ${v}`);
  return { ok: true };
};
const sameList = (a: number[] | 'all' | undefined, b: number[]) => Array.isArray(a) && a.length === b.length && b.every((x) => a.includes(x));
const trunk = (c: Ctx, sw: string, port: string, opts: { native?: number; allowed?: number[]; nonegotiate?: boolean } = {}): TaskResult => {
  const i = c.i(sw, port);
  if (!i) return no(`${nm(c, sw)} has no ${port}`);
  if (i.mode !== 'trunk') return no(`${nm(c, sw)} ${port} is not trunking (${i.dtp ? `dynamic ${i.dtp}` : i.mode ?? 'access'})`);
  if (i.dtp) return no(`${nm(c, sw)} ${port} only trunks through DTP negotiation; hard-code switchport mode trunk`);
  if (opts.native !== undefined && (i.nativeVlan ?? 1) !== opts.native) return no(`${nm(c, sw)} ${port} native VLAN is ${i.nativeVlan ?? 1}, expected ${opts.native}`);
  if (opts.allowed && !sameList(i.allowedVlans, opts.allowed)) return no(`${nm(c, sw)} ${port} allows ${Array.isArray(i.allowedVlans) ? i.allowedVlans.join(',') || 'none' : 'all VLANs'}, expected only ${opts.allowed.join(',')}`);
  if (opts.nonegotiate && !i.nonegotiate) return no(`${nm(c, sw)} ${port} still sends DTP (switchport nonegotiate)`);
  return { ok: true };
};
const svi = (c: Ctx, sw: string, v: number, ip: string, gw?: string): TaskResult => {
  const i = c.i(sw, `Vlan${v}`);
  if (!i) return no(`${nm(c, sw)} has no interface Vlan${v}`);
  if (i.ip !== ip) return no(`${nm(c, sw)} Vlan${v} address is ${i.ip ?? 'unset'}, expected ${ip}`);
  if (i.shutdown) return no(`${nm(c, sw)} Vlan${v} is shut down`);
  if (gw && !c.d(sw)!.routes.some((r) => r.prefix === '0.0.0.0/0' && r.via === gw)) return no(`${nm(c, sw)} has no ip default-gateway ${gw}`);
  return { ok: true };
};
const parked = (c: Ctx, sw: string, from: number, to: number, park: number): TaskResult => {
  const bad = Array.from({ length: to - from + 1 }, (_, k) => `Gi0/${from + k}`).filter((p) => {
    const i = c.i(sw, p);
    return !i || !i.shutdown || (i.vlan ?? 1) !== park;
  });
  return bad.length ? no(`${nm(c, sw)}: ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? ` and ${bad.length - 3} more` : ''} not shut down in VLAN ${park}`) : { ok: true };
};
const voice = (c: Ctx, sw: string, port: string, data: number, v: number): TaskResult => all(access(c, sw, port, data), c.i(sw, port)?.voiceVlan === v || no(`${nm(c, sw)} ${port} voice VLAN is ${c.i(sw, port)?.voiceVlan ?? 'none'}, expected ${v}`));

// ---------------- build helpers ----------------
function addSvi(d: Device, v: number, ip: string, prefix = 24) {
  const s: Iface = { name: `Vlan${v}`, type: 'virtual', speeds: [1000], speed: 'auto', duplex: 'auto', mac: d.interfaces.find((i) => i.mac)?.mac ?? '', shutdown: false, mode: 'routed', vlan: v, ip, prefix };
  d.interfaces.push(s);
}
function setRange(doc: LabDoc, sw: string, from: number, to: number, patch: Partial<Iface>) {
  const d = doc.devices.find((x) => x.id === sw)!;
  for (let k = from; k <= to; k++) Object.assign(d.interfaces.find((i) => i.name === `Gi0/${k}`)!, patch);
}
const findI = (doc: LabDoc, id: string, port: string) => doc.devices.find((x) => x.id === id)!.interfaces.find((i) => i.name === port)!;

// ======================================================================
export const VLAN_LABS: ArenaLab[] = [
  // ---------------- 8.1 guided ----------------
  {
    id: 'vlan-first',
    topicId: 'ch8-vlans',
    title: 'Your first VLANs: split one switch into two networks',
    kind: 'guided',
    difficulty: 1,
    minutes: 15,
    brief: 'Hillview has staff and guest devices on one switch, all in VLAN 1. Guests can see staff traffic. Split them: staff in VLAN 10, guests in VLAN 20, then prove they are separated.',
    objectives: ['Create and name VLANs', 'Assign access ports', 'Verify with show vlan brief', 'Prove isolation with ping'],
    addressing: [
      { device: 'STAFF-PC1', iface: 'Ethernet', ip: '10.10.10.11', mask: '255.255.255.0', vlan: '10 STAFF' },
      { device: 'STAFF-PC2', iface: 'Ethernet', ip: '10.10.10.12', mask: '255.255.255.0', vlan: '10 STAFF' },
      { device: 'GUEST-PC1', iface: 'Ethernet', ip: '10.10.20.21', mask: '255.255.255.0', vlan: '20 GUEST' },
      { device: 'GUEST-PC2', iface: 'Ethernet', ip: '10.10.20.22', mask: '255.255.255.0', vlan: '20 GUEST' },
    ],
    exam: ['2.1', '2.2.a'],
    build() {
      const b = builder();
      b.dev('sw1', 'c2960x24', 'ACC1', 380, 120);
      const pcs: [string, string, string, string, number][] = [
        ['s1', 'STAFF-PC1', 'Gi0/1', '10.10.10.11', 160],
        ['s2', 'STAFF-PC2', 'Gi0/2', '10.10.10.12', 320],
        ['g1', 'GUEST-PC1', 'Gi0/3', '10.10.20.21', 480],
        ['g2', 'GUEST-PC2', 'Gi0/4', '10.10.20.22', 640],
      ];
      for (const [id, name, port, ip, x] of pcs) {
        b.dev(id, 'optiplex', name, x, 330);
        b.ip(id, 'Ethernet', ip, 24);
        b.cable('sw1', port, id, 'Ethernet');
      }
      b.note('Gi0/1-2 → VLAN 10 STAFF\nGi0/3-4 → VLAN 20 GUEST', 700, 90, 240, 60);
      return b.doc;
    },
    items: [
      { id: 'v10', group: 'ACC1 › VLAN database', text: 'VLAN 10 exists and is named STAFF', points: 10, hint: 'conf t → vlan 10 → name STAFF', check: (c) => vlan(c, 'sw1', 10, 'STAFF') },
      { id: 'v20', group: 'ACC1 › VLAN database', text: 'VLAN 20 exists and is named GUEST', points: 10, hint: 'vlan 20 → name GUEST', check: (c) => vlan(c, 'sw1', 20, 'GUEST') },
      { id: 'p1', group: 'ACC1 › Ports', text: 'Gi0/1 and Gi0/2 are static access ports in VLAN 10', points: 15, hint: 'interface range g0/1 - 2 → switchport mode access → switchport access vlan 10', check: (c) => all(access(c, 'sw1', 'Gi0/1', 10), access(c, 'sw1', 'Gi0/2', 10)) },
      { id: 'p2', group: 'ACC1 › Ports', text: 'Gi0/3 and Gi0/4 are static access ports in VLAN 20', points: 15, hint: 'interface range g0/3 - 4 → switchport mode access → switchport access vlan 20', check: (c) => all(access(c, 'sw1', 'Gi0/3', 20), access(c, 'sw1', 'Gi0/4', 20)) },
    ],
    tests: [
      { id: 't1', label: 'STAFF-PC1 → STAFF-PC2 (same VLAN)', src: 's1', dst: '10.10.10.12', proto: 'icmp', expect: 'reach', points: 15 },
      { id: 't2', label: 'GUEST-PC1 → GUEST-PC2 (same VLAN)', src: 'g1', dst: '10.10.20.22', proto: 'icmp', expect: 'reach', points: 15 },
      { id: 't3', label: 'GUEST-PC1 → STAFF-PC1 is blocked (different VLAN, no router)', src: 'g1', dst: '10.10.10.11', proto: 'icmp', expect: 'blocked', points: 20 },
    ],
    debrief: 'A VLAN is a separate broadcast domain on the same switch. Once Gi0/3-4 moved to VLAN 20, a guest broadcast (like an ARP request) never reaches a staff port, so guests cannot even discover staff MAC addresses. Note the guest-to-staff test fails only because there is no router: VLANs separate traffic, they do not filter it. Add a router and they could talk again, which is why inter-VLAN routing is usually paired with ACLs.',
    verify: ['show vlan brief', 'show interfaces status', 'show mac address-table'],
  },

  // ---------------- 8.2 guided ----------------
  {
    id: 'vlan-trunk-native',
    topicId: 'ch8-vlans',
    title: 'Trunks done right: 802.1Q, native VLAN and allowed lists',
    kind: 'guided',
    difficulty: 2,
    minutes: 25,
    brief: 'Staff and guests now sit on two switches. Carry both VLANs over one trunk the way a senior engineer would: hard-coded trunk, DTP off, an unused native VLAN, and only the VLANs that need to cross.',
    objectives: ['Hard-code an 802.1Q trunk', 'Disable DTP', 'Move the native VLAN off VLAN 1', 'Prune the allowed list'],
    addressing: [
      { device: 'STAFF-PC1', iface: 'Ethernet', ip: '10.10.10.11', mask: '255.255.255.0', vlan: '10' },
      { device: 'GUEST-PC1', iface: 'Ethernet', ip: '10.10.20.21', mask: '255.255.255.0', vlan: '20' },
      { device: 'STAFF-PC2', iface: 'Ethernet', ip: '10.10.10.12', mask: '255.255.255.0', vlan: '10' },
      { device: 'GUEST-PC2', iface: 'Ethernet', ip: '10.10.20.22', mask: '255.255.255.0', vlan: '20' },
    ],
    exam: ['2.1.b', '2.2'],
    build() {
      const b = builder();
      const vl = { 1: 'default', 10: 'STAFF', 20: 'GUEST' };
      b.dev('sw1', 'c2960x24', 'ACC1', 220, 120, { vlans: { ...vl } });
      b.dev('sw2', 'c2960x24', 'ACC2', 600, 120, { vlans: { ...vl } });
      b.cable('sw1', 'Gi0/24', 'sw2', 'Gi0/24');
      const pcs: [string, string, string, string, string, number, number][] = [
        ['s1', 'STAFF-PC1', 'sw1', 'Gi0/1', '10.10.10.11', 10, 120],
        ['g1', 'GUEST-PC1', 'sw1', 'Gi0/3', '10.10.20.21', 20, 300],
        ['s2', 'STAFF-PC2', 'sw2', 'Gi0/1', '10.10.10.12', 10, 520],
        ['g2', 'GUEST-PC2', 'sw2', 'Gi0/3', '10.10.20.22', 20, 700],
      ];
      for (const [id, name, sw, port, ip, v, x] of pcs) {
        b.dev(id, 'optiplex', name, x, 330);
        b.ip(id, 'Ethernet', ip, 24);
        b.set(sw, port, { mode: 'access', vlan: v });
        b.cable(sw, port, id, 'Ethernet');
      }
      b.note('Uplink: Gi0/24 on both switches\nNative VLAN 999 (create it, name NATIVE)\nAllowed: 10, 20, 999', 800, 80, 260, 70);
      return b.doc;
    },
    items: [
      { id: 'native-v', group: 'Both switches › VLAN database', text: 'VLAN 999 named NATIVE exists on ACC1 and ACC2', points: 10, hint: 'vlan 999 → name NATIVE (on both)', check: (c) => all(vlan(c, 'sw1', 999, 'NATIVE'), vlan(c, 'sw2', 999, 'NATIVE')) },
      { id: 'tr1', group: 'ACC1 › Gi0/24', text: 'Static 802.1Q trunk, native VLAN 999, allowed 10,20,999, DTP off', points: 20, hint: 'int g0/24 → switchport mode trunk → switchport nonegotiate → switchport trunk native vlan 999 → switchport trunk allowed vlan 10,20,999', check: (c) => trunk(c, 'sw1', 'Gi0/24', { native: 999, allowed: [10, 20, 999], nonegotiate: true }) },
      { id: 'tr2', group: 'ACC2 › Gi0/24', text: 'Static 802.1Q trunk, native VLAN 999, allowed 10,20,999, DTP off', points: 20, hint: 'Same commands on ACC2. Both ends must match or CDP reports a native VLAN mismatch.', check: (c) => trunk(c, 'sw2', 'Gi0/24', { native: 999, allowed: [10, 20, 999], nonegotiate: true }) },
    ],
    tests: [
      { id: 't1', label: 'STAFF-PC1 → STAFF-PC2 across the trunk', src: 's1', dst: '10.10.10.12', proto: 'icmp', expect: 'reach', points: 15 },
      { id: 't2', label: 'GUEST-PC1 → GUEST-PC2 across the trunk', src: 'g1', dst: '10.10.20.22', proto: 'icmp', expect: 'reach', points: 15 },
      { id: 't3', label: 'GUEST-PC1 → STAFF-PC2 is blocked', src: 'g1', dst: '10.10.10.12', proto: 'icmp', expect: 'blocked', points: 20 },
    ],
    debrief: 'Hard-coding the trunk and adding switchport nonegotiate stops DTP, so a rogue device cannot negotiate a trunk (switch spoofing). Moving the native VLAN to an unused VLAN (999) defeats double-tagging VLAN hopping, and pruning the allowed list keeps broadcasts for VLANs that do not need to cross off the link. If the native VLAN differs on each end, untagged frames land in the wrong VLAN and CDP logs %CDP-4-NATIVE_VLAN_MISMATCH.',
    verify: ['show interfaces trunk', 'show interfaces g0/24 switchport', 'show vlan brief'],
  },

  // ---------------- 8.3 skills ----------------
  {
    id: 'vlan-hillview-floor',
    topicId: 'ch8-vlans',
    title: 'Skills assessment: Hillview floor 3 VLAN build',
    kind: 'skills',
    difficulty: 2,
    minutes: 40,
    brief: 'Hillview Medical Center is opening floor 3. You get the cabled switches and a design document. Configure everything to spec: data, guest, voice and management VLANs, voice ports for the IP phones, secure trunks, a management address on each switch, and parked unused ports. Results are only shown when you press Check results.',
    objectives: ['VLAN plan on three switches', 'Data + voice VLAN on phone ports', 'Secure trunks (DTP off, native 999, pruned)', 'Management SVIs and default gateway', 'Park and shut unused ports'],
    addressing: [
      { device: 'DIST1', iface: 'Vlan99', ip: '10.30.99.1', mask: '255.255.255.0', vlan: '99 MGMT' },
      { device: 'ACC1', iface: 'Vlan99', ip: '10.30.99.11', mask: '255.255.255.0', gateway: '10.30.99.1', vlan: '99 MGMT' },
      { device: 'ACC2', iface: 'Vlan99', ip: '10.30.99.12', mask: '255.255.255.0', gateway: '10.30.99.1', vlan: '99 MGMT' },
      { device: 'NURSE-PC1 (ACC1 Gi0/1)', iface: 'Ethernet', ip: '10.30.10.11', mask: '255.255.255.0', vlan: '10 STAFF' },
      { device: 'NURSE-PC2 (ACC2 Gi0/1)', iface: 'Ethernet', ip: '10.30.10.12', mask: '255.255.255.0', vlan: '10 STAFF' },
      { device: 'PHONE-301 (ACC1 Gi0/2)', iface: 'Ethernet', ip: '10.30.30.31', mask: '255.255.255.0', vlan: 'data 10, voice 30' },
      { device: 'PHONE-302 (ACC2 Gi0/2)', iface: 'Ethernet', ip: '10.30.30.32', mask: '255.255.255.0', vlan: 'data 10, voice 30' },
      { device: 'KIOSK (ACC2 Gi0/3)', iface: 'Ethernet', ip: '10.30.20.21', mask: '255.255.255.0', vlan: '20 GUEST' },
      { device: 'CALL-MGR (DIST1 Gi0/10)', iface: 'eno1', ip: '10.30.30.5', mask: '255.255.255.0', vlan: '30 VOICE' },
    ],
    exam: ['2.1.b', '2.1.d', '2.2.a', '2.2.c'],
    build() {
      const b = builder();
      b.dev('dist', 'c2960x24', 'DIST1', 420, 60);
      b.dev('acc1', 'c2960x24ps', 'ACC1', 200, 220);
      b.dev('acc2', 'c2960x24ps', 'ACC2', 640, 220);
      b.cable('dist', 'Gi0/1', 'acc1', 'Gi0/24');
      b.cable('dist', 'Gi0/2', 'acc2', 'Gi0/24');
      const hosts: [string, string, string, string, string, string, number, number][] = [
        ['n1', 'optiplex', 'NURSE-PC1', 'acc1', 'Gi0/1', '10.30.10.11', 80, 420],
        ['ph1', 'ip-phone-8845', 'PHONE-301', 'acc1', 'Gi0/2', '10.30.30.31', 250, 420],
        ['n2', 'optiplex', 'NURSE-PC2', 'acc2', 'Gi0/1', '10.30.10.12', 520, 420],
        ['ph2', 'ip-phone-8845', 'PHONE-302', 'acc2', 'Gi0/2', '10.30.30.32', 670, 420],
        ['kiosk', 'optiplex', 'KIOSK', 'acc2', 'Gi0/3', '10.30.20.21', 820, 420],
      ];
      for (const [id, model, name, sw, port, ip, x, y] of hosts) {
        b.dev(id, model, name, x, y);
        b.ip(id, 'Ethernet', ip, 24);
        b.cable(sw, port, id, 'Ethernet');
      }
      b.dev('cm', 'services-server', 'CALL-MGR', 760, 40);
      b.ip('cm', 'eno1', '10.30.30.5', 24);
      b.cable('dist', 'Gi0/10', 'cm', 'eno1');
      b.note('Design: VLAN 10 STAFF, 20 GUEST, 30 VOICE, 99 MGMT, 999 NATIVE, 666 PARKING\nTrunks: allowed 10,20,30,99 + native 999, DTP off\nUnused ports Gi0/5–Gi0/20 on ACC1/ACC2: VLAN 666, shut down', 40, 40, 330, 90);
      return b.doc;
    },
    items: [
      ...(['dist', 'acc1', 'acc2'] as const).map((s) => ({
        id: `vl-${s}`,
        group: `${s.toUpperCase().replace('DIST', 'DIST1')} › VLAN database`,
        text: 'VLANs 10 STAFF, 20 GUEST, 30 VOICE, 99 MGMT, 999 NATIVE exist with these names',
        points: 6,
        hint: 'vlan 10 → name STAFF, vlan 20 → name GUEST, vlan 30 → name VOICE, vlan 99 → name MGMT, vlan 999 → name NATIVE',
        check: (c: Ctx) => all(vlan(c, s, 10, 'STAFF'), vlan(c, s, 20, 'GUEST'), vlan(c, s, 30, 'VOICE'), vlan(c, s, 99, 'MGMT'), vlan(c, s, 999, 'NATIVE')),
      })),
      { id: 'tr-d1', group: 'DIST1 › Trunks', text: 'Gi0/1 and Gi0/2: static trunks, DTP off, native 999, allowed 10,20,30,99,999', points: 8, hint: 'interface range g0/1 - 2 → switchport mode trunk → switchport nonegotiate → switchport trunk native vlan 999 → switchport trunk allowed vlan 10,20,30,99,999', check: (c) => all(trunk(c, 'dist', 'Gi0/1', { native: 999, allowed: [10, 20, 30, 99, 999], nonegotiate: true }), trunk(c, 'dist', 'Gi0/2', { native: 999, allowed: [10, 20, 30, 99, 999], nonegotiate: true })) },
      { id: 'tr-a1', group: 'ACC1 › Trunks', text: 'Gi0/24: static trunk, DTP off, native 999, allowed 10,20,30,99,999', points: 6, hint: 'Same trunk settings on the access side.', check: (c) => trunk(c, 'acc1', 'Gi0/24', { native: 999, allowed: [10, 20, 30, 99, 999], nonegotiate: true }) },
      { id: 'tr-a2', group: 'ACC2 › Trunks', text: 'Gi0/24: static trunk, DTP off, native 999, allowed 10,20,30,99,999', points: 6, hint: 'Same trunk settings on the access side.', check: (c) => trunk(c, 'acc2', 'Gi0/24', { native: 999, allowed: [10, 20, 30, 99, 999], nonegotiate: true }) },
      { id: 'ed-a1', group: 'ACC1 › Edge ports', text: 'Gi0/1 access VLAN 10; Gi0/2 access VLAN 10 with voice VLAN 30', points: 6, hint: 'int g0/2 → switchport mode access → switchport access vlan 10 → switchport voice vlan 30', check: (c) => all(access(c, 'acc1', 'Gi0/1', 10), voice(c, 'acc1', 'Gi0/2', 10, 30)) },
      { id: 'ed-a2', group: 'ACC2 › Edge ports', text: 'Gi0/1 VLAN 10; Gi0/2 VLAN 10 + voice 30; Gi0/3 VLAN 20', points: 6, hint: 'The kiosk port is a plain guest access port in VLAN 20.', check: (c) => all(access(c, 'acc2', 'Gi0/1', 10), voice(c, 'acc2', 'Gi0/2', 10, 30), access(c, 'acc2', 'Gi0/3', 20)) },
      { id: 'ed-d', group: 'DIST1 › Edge ports', text: 'Gi0/10 (CALL-MGR) is an access port in VLAN 30', points: 4, hint: 'int g0/10 → switchport mode access → switchport access vlan 30', check: (c) => access(c, 'dist', 'Gi0/10', 30) },
      { id: 'mg-d', group: 'DIST1 › Management', text: 'Vlan99 is 10.30.99.1/24 and up', points: 4, hint: 'interface vlan 99 → ip address 10.30.99.1 255.255.255.0 → no shutdown', check: (c) => svi(c, 'dist', 99, '10.30.99.1') },
      { id: 'mg-a1', group: 'ACC1 › Management', text: 'Vlan99 is 10.30.99.11/24, default gateway 10.30.99.1', points: 4, hint: 'interface vlan 99 → ip address 10.30.99.11 255.255.255.0 → no shutdown; ip default-gateway 10.30.99.1', check: (c) => svi(c, 'acc1', 99, '10.30.99.11', '10.30.99.1') },
      { id: 'mg-a2', group: 'ACC2 › Management', text: 'Vlan99 is 10.30.99.12/24, default gateway 10.30.99.1', points: 4, hint: 'Same as ACC1 with .12.', check: (c) => svi(c, 'acc2', 99, '10.30.99.12', '10.30.99.1') },
      { id: 'pk-a1', group: 'ACC1 › Unused ports', text: 'Gi0/5–Gi0/20 are in VLAN 666 PARKING and shut down', points: 4, hint: 'vlan 666 → name PARKING; interface range g0/5 - 20 → switchport access vlan 666 → shutdown', check: (c) => all(vlan(c, 'acc1', 666, 'PARKING'), parked(c, 'acc1', 5, 20, 666)) },
      { id: 'pk-a2', group: 'ACC2 › Unused ports', text: 'Gi0/5–Gi0/20 are in VLAN 666 PARKING and shut down', points: 4, hint: 'Same as ACC1.', check: (c) => all(vlan(c, 'acc2', 666, 'PARKING'), parked(c, 'acc2', 5, 20, 666)) },
    ],
    tests: [
      { id: 't-staff', label: 'NURSE-PC1 → NURSE-PC2 (VLAN 10 across DIST1)', src: 'n1', dst: '10.30.10.12', proto: 'icmp', expect: 'reach', points: 6 },
      { id: 't-ph1', label: 'PHONE-301 → CALL-MGR (voice VLAN 30)', src: 'ph1', dst: '10.30.30.5', proto: 'icmp', expect: 'reach', points: 6 },
      { id: 't-ph2', label: 'PHONE-302 → CALL-MGR (voice VLAN 30)', src: 'ph2', dst: '10.30.30.5', proto: 'icmp', expect: 'reach', points: 6 },
      { id: 't-mgmt', label: 'ACC2 management → DIST1 management', src: 'acc2', dst: '10.30.99.1', proto: 'icmp', expect: 'reach', points: 4 },
      { id: 't-guest', label: 'KIOSK → NURSE-PC2 is blocked', src: 'kiosk', dst: '10.30.10.12', proto: 'icmp', expect: 'blocked', points: 6 },
    ],
    debrief: 'A strong build matches the design on every switch, not just the one you tested from. Voice ports carry two VLANs on one access port: the PC (or the phone pass-through) is untagged in VLAN 10 while the phone tags its traffic with VLAN 30, learned from the switch over CDP or LLDP-MED. Management lives in its own VLAN so a flood of user traffic cannot lock you out. Parking unused ports in a dead VLAN and shutting them closes the easiest way into the network: an empty wall jack.',
    verify: ['show vlan brief', 'show interfaces trunk', 'show interfaces g0/2 switchport', 'show ip interface brief', 'ping 10.30.99.1'],
  },

  // ---------------- 8.4 troubleshoot ----------------
  {
    id: 'vlan-bo-tickets',
    topicId: 'ch8-vlans',
    title: 'Troubleshoot: Bo branch, three tickets one morning',
    kind: 'troubleshoot',
    difficulty: 2,
    minutes: 25,
    brief: 'Three tickets landed at 08:10 after last night\'s change window at the Bo branch.\n• T-1182 "Finance PC BO-FIN2 can\'t reach the other finance PC across the office."\n• T-1183 "Ops laptop BO-OPS2 has no network since the desk move. Link light is green."\n• T-1184 "Switch logs are full of CDP warnings about the uplink."\nThe design has not changed: VLAN 10 FINANCE, VLAN 20 OPS, native VLAN 99 on the trunk. Find and fix every fault without changing the design.',
    objectives: ['Read show interfaces trunk on both ends', 'Compare allowed and native VLANs', 'Check access VLANs against the design', 'Fix the root cause, not the symptom'],
    addressing: [
      { device: 'BO-FIN1 (SW1 Gi0/1)', iface: 'Ethernet', ip: '10.20.10.11', mask: '255.255.255.0', vlan: '10 FINANCE' },
      { device: 'BO-OPS1 (SW1 Gi0/2)', iface: 'Ethernet', ip: '10.20.20.11', mask: '255.255.255.0', vlan: '20 OPS' },
      { device: 'BO-FIN2 (SW2 Gi0/1)', iface: 'Ethernet', ip: '10.20.10.12', mask: '255.255.255.0', vlan: '10 FINANCE' },
      { device: 'BO-OPS2 (SW2 Gi0/2)', iface: 'Ethernet', ip: '10.20.20.12', mask: '255.255.255.0', vlan: '20 OPS' },
    ],
    exam: ['2.1.b', '2.3', '2.4'],
    build() {
      const b = builder();
      const vl = { 1: 'default', 10: 'FINANCE', 20: 'OPS', 99: 'NATIVE' };
      b.dev('sw1', 'c2960x24', 'BO-SW1', 220, 120, { vlans: { ...vl } });
      b.dev('sw2', 'c2960x24', 'BO-SW2', 600, 120, { vlans: { ...vl } });
      b.cable('sw1', 'Gi0/24', 'sw2', 'Gi0/24');
      b.set('sw1', 'Gi0/24', { mode: 'trunk', nativeVlan: 99, allowedVlans: [10, 20, 99], nonegotiate: true });
      b.set('sw2', 'Gi0/24', { mode: 'trunk', nativeVlan: 99, allowedVlans: [10, 20, 99], nonegotiate: true });
      const pcs: [string, string, string, string, string, number, number][] = [
        ['f1', 'BO-FIN1', 'sw1', 'Gi0/1', '10.20.10.11', 10, 120],
        ['o1', 'BO-OPS1', 'sw1', 'Gi0/2', '10.20.20.11', 20, 300],
        ['f2', 'BO-FIN2', 'sw2', 'Gi0/1', '10.20.10.12', 10, 520],
        ['o2', 'BO-OPS2', 'sw2', 'Gi0/2', '10.20.20.12', 20, 700],
      ];
      for (const [id, name, sw, port, ip, v, x] of pcs) {
        b.dev(id, 'optiplex', name, x, 330);
        b.ip(id, 'Ethernet', ip, 24);
        b.set(sw, port, { mode: 'access', vlan: v });
        b.cable(sw, port, id, 'Ethernet');
      }
      // Faults from last night's change window
      Object.assign(findI(b.doc, 'sw1', 'Gi0/24'), { allowedVlans: [20, 99] });
      Object.assign(findI(b.doc, 'sw2', 'Gi0/24'), { nativeVlan: 1 });
      Object.assign(findI(b.doc, 'sw2', 'Gi0/2'), { vlan: 10 });
      return b.doc;
    },
    faults: ['BO-SW1 Gi0/24 allowed list was overwritten to 20,99 (someone typed "allowed vlan 20,99" instead of "add"), so VLAN 10 FINANCE stopped crossing the trunk.', 'BO-SW2 Gi0/24 native VLAN reverted to 1 while BO-SW1 uses 99: native VLAN mismatch (the CDP warnings).', 'BO-SW2 Gi0/2 was put in VLAN 10 instead of VLAN 20 during the desk move.'],
    items: [
      { id: 'allow', group: 'BO-SW1 › Gi0/24', text: 'Trunk allows exactly 10, 20, 99 again', points: 15, hint: 'show interfaces trunk on BO-SW1: compare "Vlans allowed on trunk" with BO-SW2. Fix: switchport trunk allowed vlan add 10', check: (c) => trunk(c, 'sw1', 'Gi0/24', { allowed: [10, 20, 99], native: 99 }) },
      { id: 'native', group: 'BO-SW2 › Gi0/24', text: 'Native VLAN matches BO-SW1 (99)', points: 15, hint: 'show interfaces trunk on both ends: the Native vlan column differs. Fix: switchport trunk native vlan 99', check: (c) => trunk(c, 'sw2', 'Gi0/24', { allowed: [10, 20, 99], native: 99 }) },
      { id: 'port', group: 'BO-SW2 › Gi0/2', text: 'BO-OPS2 port is back in VLAN 20', points: 15, hint: 'show vlan brief on BO-SW2: which VLAN lists Gi0/2?', check: (c) => access(c, 'sw2', 'Gi0/2', 20) },
      { id: 'design', group: 'Design kept', text: 'No design changes: access ports, VLAN names and trunk mode unchanged elsewhere', points: 10, hint: 'Fix only what is broken. Do not change BO-SW1 native VLAN to 1 to "match".', check: (c) => all(access(c, 'sw1', 'Gi0/1', 10), access(c, 'sw1', 'Gi0/2', 20), access(c, 'sw2', 'Gi0/1', 10), (c.i('sw1', 'Gi0/24')?.nativeVlan ?? 1) === 99 || no('BO-SW1 native VLAN was changed away from the design (99)'), vlan(c, 'sw1', 10, 'FINANCE'), vlan(c, 'sw2', 20, 'OPS')) },
    ],
    tests: [
      { id: 't-fin', label: 'BO-FIN2 → BO-FIN1 (T-1182)', src: 'f2', dst: '10.20.10.11', proto: 'icmp', expect: 'reach', points: 15 },
      { id: 't-ops', label: 'BO-OPS2 → BO-OPS1 (T-1183)', src: 'o2', dst: '10.20.20.11', proto: 'icmp', expect: 'reach', points: 15 },
      { id: 't-iso', label: 'BO-OPS2 → BO-FIN1 is blocked', src: 'o2', dst: '10.20.10.11', proto: 'icmp', expect: 'blocked', points: 15 },
    ],
    debrief: 'Three different faults, three different symptoms, one change window. The fastest path is the same every time: show interfaces trunk on BOTH ends and compare the Native vlan and Vlans allowed columns side by side, then show vlan brief to map ports to VLANs. The classic trap is "switchport trunk allowed vlan 20,99" when you meant "add 20": it replaces the list. And when a native VLAN mismatch appears, fix the side that drifted from the design; changing the correct side to match the wrong one just moves the problem.',
    verify: ['show interfaces trunk', 'show vlan brief', 'show cdp neighbors detail', 'ping 10.20.10.11'],
  },

  // ---------------- 8.5 troubleshoot (red herring) ----------------
  {
    id: 'vlan-kamara-newswitch',
    topicId: 'ch8-vlans',
    title: 'Troubleshoot: Kamara office new switch, nothing works',
    kind: 'troubleshoot',
    difficulty: 3,
    minutes: 30,
    brief: 'A contractor installed KL-SW2 yesterday and left. Ticket T-2207 from the office manager:\n"Nobody on the new switch can work. The two PCs can\'t reach the file server, Mike\'s desk phone has no dial tone, and the contractor says he already replaced the patch cable on KL-PC3 so it must be the server."\nKL-SW1 was working before the install and has not been touched. Restore service to the design: VLAN 10 USERS, VLAN 30 VOICE, server in VLAN 10 on KL-SW1.',
    objectives: ['Don\'t trust the ticket\'s diagnosis', 'Check trunk formation (DTP)', 'Check the VLAN database on the new switch', 'Check voice VLAN on phone ports'],
    addressing: [
      { device: 'FILESRV (KL-SW1 Gi0/10)', iface: 'eno1', ip: '10.50.10.5', mask: '255.255.255.0', vlan: '10 USERS' },
      { device: 'CALL-MGR (KL-SW1 Gi0/11)', iface: 'eno1', ip: '10.50.30.5', mask: '255.255.255.0', vlan: '30 VOICE' },
      { device: 'KL-PC3 (KL-SW2 Gi0/1)', iface: 'Ethernet', ip: '10.50.10.13', mask: '255.255.255.0', vlan: '10 USERS' },
      { device: 'KL-PC4 (KL-SW2 Gi0/3)', iface: 'Ethernet', ip: '10.50.10.14', mask: '255.255.255.0', vlan: '10 USERS' },
      { device: 'MIKE-PHONE (KL-SW2 Gi0/2)', iface: 'Ethernet', ip: '10.50.30.31', mask: '255.255.255.0', vlan: 'data 10, voice 30' },
    ],
    exam: ['2.1.b', '2.2.c', '2.4'],
    build() {
      const b = builder();
      b.dev('sw1', 'c2960x24', 'KL-SW1', 260, 100, { vlans: { 1: 'default', 10: 'USERS', 30: 'VOICE' } });
      b.dev('sw2', 'c2960x24ps', 'KL-SW2', 600, 220, { vlans: { 1: 'default', 30: 'VOICE' } });
      b.cable('sw1', 'Gi0/24', 'sw2', 'Gi0/24');
      b.dev('fs', 'services-server', 'FILESRV', 80, 280);
      b.ip('fs', 'eno1', '10.50.10.5', 24);
      b.set('sw1', 'Gi0/10', { mode: 'access', vlan: 10 });
      b.cable('sw1', 'Gi0/10', 'fs', 'eno1');
      b.dev('cm', 'services-server', 'CALL-MGR', 260, 280);
      b.ip('cm', 'eno1', '10.50.30.5', 24);
      b.set('sw1', 'Gi0/11', { mode: 'access', vlan: 30 });
      b.cable('sw1', 'Gi0/11', 'cm', 'eno1');
      const hosts: [string, string, string, string, string, number][] = [
        ['p3', 'optiplex', 'KL-PC3', 'Gi0/1', '10.50.10.13', 460],
        ['ph', 'ip-phone-8845', 'MIKE-PHONE', 'Gi0/2', '10.50.30.31', 620],
        ['p4', 'optiplex', 'KL-PC4', 'Gi0/3', '10.50.10.14', 780],
      ];
      for (const [id, model, name, port, ip, x] of hosts) {
        b.dev(id, model, name, x, 420);
        b.ip(id, 'Ethernet', ip, 24);
        b.cable('sw2', port, id, 'Ethernet');
      }
      // KL-SW1 uplink: dynamic auto (the old default the office always relied on)
      b.set('sw1', 'Gi0/24', { dtp: 'auto', mode: 'access' });
      // Faults: new switch uplink also dynamic auto, VLAN 10 missing on KL-SW2, phone port without voice VLAN
      b.set('sw2', 'Gi0/24', { dtp: 'auto', mode: 'access' });
      b.set('sw2', 'Gi0/1', { mode: 'access', vlan: 10 });
      b.set('sw2', 'Gi0/3', { mode: 'access', vlan: 10 });
      b.set('sw2', 'Gi0/2', { mode: 'access', vlan: 10 });
      return b.doc;
    },
    faults: ['Both ends of the uplink were dynamic auto. Two passive DTP ports never form a trunk, so the link came up as an access port in VLAN 1.', 'VLAN 10 USERS was never created on KL-SW2. Ports Gi0/1 and Gi0/3 were assigned to a VLAN that does not exist, so they are inactive.', 'MIKE-PHONE\'s port has no voice VLAN, so the phone\'s voice traffic has nowhere to go.', 'Red herring: the patch cable on KL-PC3 and the server were never the problem.'],
    items: [
      { id: 'trunk', group: 'Uplink › KL-SW2 Gi0/24', text: 'The uplink is a working trunk (hard-coded on KL-SW2, or desirable on one side)', points: 15, hint: 'show interfaces g0/24 switchport on both switches: Administrative Mode dynamic auto on both ends means no trunk.', check: (c) => (c.i('sw2', 'Gi0/24')?.mode === 'trunk' && c.i('sw1', 'Gi0/24')?.mode === 'trunk') || no(`the uplink is not trunking (KL-SW1 ${c.i('sw1', 'Gi0/24')?.mode}, KL-SW2 ${c.i('sw2', 'Gi0/24')?.mode})`) },
      { id: 'v10', group: 'KL-SW2 › VLAN database', text: 'VLAN 10 USERS exists on KL-SW2', points: 15, hint: 'show vlan brief on KL-SW2: VLAN 10 is missing, so Gi0/1 and Gi0/3 are inactive.', check: (c) => vlan(c, 'sw2', 10, 'USERS') },
      { id: 'voice', group: 'KL-SW2 › Gi0/2', text: 'Phone port: data VLAN 10, voice VLAN 30', points: 15, hint: 'show interfaces g0/2 switchport: Voice VLAN: none. Fix: switchport voice vlan 30', check: (c) => voice(c, 'sw2', 'Gi0/2', 10, 30) },
      { id: 'keep', group: 'Design kept', text: 'FILESRV and CALL-MGR ports and KL-PC3 cabling untouched', points: 10, hint: 'The server side was fine all along.', check: (c) => all(access(c, 'sw1', 'Gi0/10', 10), access(c, 'sw1', 'Gi0/11', 30), c.doc.cables.some((x) => (x.a.device === 'p3' || x.b.device === 'p3') && !x.disabled) || no('KL-PC3 cable was removed')) },
    ],
    tests: [
      { id: 't-pc3', label: 'KL-PC3 → FILESRV', src: 'p3', dst: '10.50.10.5', proto: 'icmp', expect: 'reach', points: 15 },
      { id: 't-pc4', label: 'KL-PC4 → FILESRV', src: 'p4', dst: '10.50.10.5', proto: 'icmp', expect: 'reach', points: 10 },
      { id: 't-ph', label: 'MIKE-PHONE → CALL-MGR', src: 'ph', dst: '10.50.30.5', proto: 'icmp', expect: 'reach', points: 20 },
    ],
    debrief: 'The ticket pointed at a cable and the server; the real faults were all on the new switch. Good troubleshooters verify the reported symptom, then work the layers on the path: the uplink first (show interfaces switchport shows "dynamic auto" on both ends, which never trunks), then the VLAN database (a port in a VLAN that does not exist is inactive and passes nothing), then the edge port (a phone needs a voice VLAN). The fix that survives the next contractor: hard-code trunks with switchport mode trunk and switchport nonegotiate on both ends.',
    verify: ['show interfaces g0/24 switchport', 'show interfaces trunk', 'show vlan brief', 'show interfaces g0/2 switchport'],
  },

  // ---------------- 8.6 challenge ----------------
  {
    id: 'vlan-challenge-roas',
    topicId: 'ch8-vlans',
    title: 'Timed challenge: VLANs and router on a stick from a blank config',
    kind: 'challenge',
    difficulty: 3,
    minutes: 25,
    timeLimit: 25,
    brief: 'Exam conditions: 25 minutes, no hints, results only when you submit or time runs out. The cabling is done; every device has a blank configuration except the PC addresses. Build three VLANs, trunk them to the router, configure 802.1Q sub-interfaces, and give the switch a management address. Every PC must reach every other PC.',
    objectives: ['VLANs and access ports', 'Trunk to the router', 'Router sub-interfaces with dot1Q', 'Switch management SVI and gateway'],
    addressing: [
      { device: 'R1', iface: 'Gi0/0/0.10', ip: '192.168.10.1', mask: '255.255.255.0', vlan: '10 SALES' },
      { device: 'R1', iface: 'Gi0/0/0.20', ip: '192.168.20.1', mask: '255.255.255.0', vlan: '20 ENG' },
      { device: 'R1', iface: 'Gi0/0/0.30', ip: '192.168.30.1', mask: '255.255.255.0', vlan: '30 ADMIN' },
      { device: 'R1', iface: 'Gi0/0/0.99', ip: '192.168.99.1', mask: '255.255.255.0', vlan: '99 MGMT' },
      { device: 'SW1', iface: 'Vlan99', ip: '192.168.99.2', mask: '255.255.255.0', gateway: '192.168.99.1', vlan: '99 MGMT' },
      { device: 'PC-SALES (Gi0/1)', iface: 'Ethernet', ip: '192.168.10.10', mask: '255.255.255.0', gateway: '192.168.10.1', vlan: '10' },
      { device: 'PC-ENG (Gi0/2)', iface: 'Ethernet', ip: '192.168.20.10', mask: '255.255.255.0', gateway: '192.168.20.1', vlan: '20' },
      { device: 'PC-ADMIN (Gi0/3)', iface: 'Ethernet', ip: '192.168.30.10', mask: '255.255.255.0', gateway: '192.168.30.1', vlan: '30' },
    ],
    exam: ['2.1.a', '2.1.b', '3.1'],
    build() {
      const b = builder();
      b.dev('r1', 'isr4331', 'R1', 400, 40);
      b.dev('sw1', 'c2960x24', 'SW1', 400, 200);
      b.cable('r1', 'Gi0/0/0', 'sw1', 'Gi0/24');
      const pcs: [string, string, string, string, string, number][] = [
        ['ps', 'PC-SALES', 'Gi0/1', '192.168.10.10', '192.168.10.1', 200],
        ['pe', 'PC-ENG', 'Gi0/2', '192.168.20.10', '192.168.20.1', 400],
        ['pa', 'PC-ADMIN', 'Gi0/3', '192.168.30.10', '192.168.30.1', 600],
      ];
      for (const [id, name, port, ip, gw, x] of pcs) {
        b.dev(id, 'optiplex', name, x, 380);
        b.ip(id, 'Ethernet', ip, 24, gw);
        b.cable('sw1', port, id, 'Ethernet');
      }
      const r = b.doc.devices.find((d) => d.id === 'r1')!;
      for (const i of r.interfaces) if (i.type === 'copper' || i.type === 'sfp') i.shutdown = true;
      return b.doc;
    },
    items: [
      { id: 'vl', group: 'SW1 › VLANs', text: 'VLANs 10 SALES, 20 ENG, 30 ADMIN, 99 MGMT', points: 10, hint: '', check: (c) => all(vlan(c, 'sw1', 10, 'SALES'), vlan(c, 'sw1', 20, 'ENG'), vlan(c, 'sw1', 30, 'ADMIN'), vlan(c, 'sw1', 99, 'MGMT')) },
      { id: 'acc', group: 'SW1 › Ports', text: 'Gi0/1 VLAN 10, Gi0/2 VLAN 20, Gi0/3 VLAN 30 (static access)', points: 10, hint: '', check: (c) => all(access(c, 'sw1', 'Gi0/1', 10), access(c, 'sw1', 'Gi0/2', 20), access(c, 'sw1', 'Gi0/3', 30)) },
      { id: 'tr', group: 'SW1 › Ports', text: 'Gi0/24 is a static trunk to R1', points: 10, hint: '', check: (c) => trunk(c, 'sw1', 'Gi0/24') },
      { id: 'sub', group: 'R1 › Sub-interfaces', text: 'Gi0/0/0.10/.20/.30/.99 with dot1Q and the addresses in the table; Gi0/0/0 up', points: 20, hint: '', check: (c) => all(...([[10, '192.168.10.1'], [20, '192.168.20.1'], [30, '192.168.30.1'], [99, '192.168.99.1']] as const).map(([v, ip]) => (c.i('r1', `Gi0/0/0.${v}`)?.ip === ip && c.i('r1', `Gi0/0/0.${v}`)?.vlan === v) || no(`Gi0/0/0.${v} missing, wrong dot1Q tag or wrong address`)), !c.i('r1', 'Gi0/0/0')?.shutdown || no('Gi0/0/0 is shut down')) },
      { id: 'mg', group: 'SW1 › Management', text: 'Vlan99 192.168.99.2/24 with default gateway 192.168.99.1', points: 10, hint: '', check: (c) => svi(c, 'sw1', 99, '192.168.99.2', '192.168.99.1') },
    ],
    tests: [
      { id: 't1', label: 'PC-SALES → PC-ENG (routed)', src: 'ps', dst: '192.168.20.10', proto: 'icmp', expect: 'reach', points: 10 },
      { id: 't2', label: 'PC-ENG → PC-ADMIN (routed)', src: 'pe', dst: '192.168.30.10', proto: 'icmp', expect: 'reach', points: 10 },
      { id: 't3', label: 'PC-ADMIN → PC-SALES (routed)', src: 'pa', dst: '192.168.10.10', proto: 'icmp', expect: 'reach', points: 10 },
      { id: 't4', label: 'PC-SALES → SW1 management 192.168.99.2', src: 'ps', dst: '192.168.99.2', proto: 'icmp', expect: 'reach', points: 10 },
    ],
    debrief: 'Under time pressure, work in a fixed order and verify as you go: switch VLANs and access ports (show vlan brief), the trunk (show interfaces trunk), then the router physical interface (no shutdown, the step most people forget), then each sub-interface with encapsulation dot1Q before the IP address. Finish with the management SVI and its default gateway, because a switch is a host on its own management VLAN and needs a gateway to answer pings from other VLANs.',
    verify: ['show vlan brief', 'show interfaces trunk', 'show ip interface brief (R1)', 'show ip route (R1)', 'ping 192.168.99.2'],
  },
];
