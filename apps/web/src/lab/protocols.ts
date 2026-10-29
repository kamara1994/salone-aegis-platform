// Control plane for the lab designer: what the devices would agree on by themselves.
// Spanning tree (root election, port roles, blocking), EtherChannel bundling, HSRP active
// routers, OSPF adjacencies and SPF routes, plus derived tables (MAC, ARP, CDP), DHCP leases,
// PoE power and wireless association. Results are cached per document object; the store
// replaces the document on every change, so the cache never goes stale.
import { MODEL_BY_KEY, modelOf } from './catalog';
import { intToIp, inCidr, ipToInt, parseCidr, sameSubnet } from './net';
import { ifaceUp, isRouter, l2Walk, l3Ifaces, netStr, NO_CTX, ownerOfIp, simulatePacket, type L2Ctx } from './simulate';
import type { Cable, Device, Iface, LabDoc, Route } from './types';
import { cableOnPort, cableStatus, deviceById, otherEnd } from './validate';

export interface StpPort {
  role: 'root' | 'designated' | 'alternate' | 'edge' | 'disabled' | 'root-inconsistent';
  state: 'forwarding' | 'blocking' | 'disabled';
  cost: number;
}
export interface StpBridge {
  device: string;
  bridgeId: string;
  priority: number;
  mac: string;
  isRoot: boolean;
  rootId: string;
  rootCost: number;
  rootPort?: string;
  enabled: boolean;
  ports: Record<string, StpPort>;
}
export interface Channel {
  device: string;
  group: number;
  members: string[];
  peer?: string;
  peerGroup?: number;
  protocol: 'LACP' | 'PAgP' | 'static';
  ok: boolean;
  reason?: string;
}
export interface OspfNeighbor {
  device: string;
  iface: string;
  peer: string;
  peerIface: string;
  peerRid: string;
  peerIp: string;
  area: number;
  state: 'FULL' | 'EXSTART' | 'INIT' | 'DOWN';
  reason?: string;
}
export interface HsrpGroup {
  key: string;
  proto: 'hsrp' | 'vrrp' | 'glbp';
  group: number;
  vip: string;
  active?: { device: string; iface: string; priority: number };
  standby?: { device: string; iface: string; priority: number };
  members: { device: string; iface: string; priority: number; up: boolean }[];
  issues: string[];
}
export interface EigrpNeighbor {
  device: string;
  iface: string;
  peer: string;
  peerIface: string;
  peerIp: string;
  as: number;
  up: boolean;
  reason?: string;
}
export interface CpIssue {
  severity: 'critical' | 'warning' | 'info';
  topic: 'stp' | 'etherchannel' | 'ospf' | 'eigrp' | 'hsrp' | 'poe' | 'dhcp' | 'wireless' | 'security';
  message: string;
  devices: string[];
  fix?: string;
}
export interface ControlPlane {
  stp: Record<string, StpBridge>;
  channels: Channel[];
  l2: L2Ctx;
  routerIds: Record<string, string>;
  ospf: OspfNeighbor[];
  routes: Record<string, Route[]>;
  hsrp: HsrpGroup[];
  eigrp: EigrpNeighbor[];
  storms: string[][];
  issues: CpIssue[];
}

const cache = new WeakMap<LabDoc, ControlPlane>();
const COMPUTING = new WeakSet<LabDoc>();

const portSpeed = (i: Iface) => (i.speed === 'auto' ? Math.max(...i.speeds) : i.speed);
const stpCost = (speed: number, members = 1) => {
  const total = speed * members;
  if (total >= 10000) return 2;
  if (total >= 2000) return 3;
  if (total >= 1000) return 4;
  if (total >= 100) return 19;
  return 100;
};
const baseMac = (d: Device) => d.interfaces.map((i) => i.mac).filter(Boolean).sort()[0] ?? `00:00:00:${d.id.slice(-6).replace(/(..)(..)(..)/, '$1:$2:$3')}`;

function linkUp(doc: LabDoc, c: Cable) {
  const s = cableStatus(doc, c).state;
  return s === 'up' || s === 'degraded';
}

// ---------------- EtherChannel ----------------

function compatible(a: Iface['channelMode'], b: Iface['channelMode']): { ok: boolean; protocol: Channel['protocol']; reason?: string } {
  const lacp = ['active', 'passive'];
  const pagp = ['desirable', 'auto'];
  const ma = a ?? 'on';
  const mb = b ?? 'on';
  if (ma === 'on' && mb === 'on') return { ok: true, protocol: 'static' };
  if (lacp.includes(ma) && lacp.includes(mb)) return ma === 'passive' && mb === 'passive' ? { ok: false, protocol: 'LACP', reason: 'both ends are LACP passive, so neither side starts negotiation' } : { ok: true, protocol: 'LACP' };
  if (pagp.includes(ma) && pagp.includes(mb)) return ma === 'auto' && mb === 'auto' ? { ok: false, protocol: 'PAgP', reason: 'both ends are PAgP auto, so neither side starts negotiation' } : { ok: true, protocol: 'PAgP' };
  return { ok: false, protocol: lacp.includes(ma) || lacp.includes(mb) ? 'LACP' : 'PAgP', reason: `channel modes do not match (${ma} vs ${mb})` };
}

function computeChannels(doc: LabDoc): Channel[] {
  const out: Channel[] = [];
  for (const d of doc.devices) {
    const groups = new Map<number, Iface[]>();
    for (const i of d.interfaces) if (i.channelGroup !== undefined) groups.set(i.channelGroup, [...(groups.get(i.channelGroup) ?? []), i]);
    for (const [group, members] of groups) {
      const ch: Channel = { device: d.id, group, members: members.map((m) => m.name), protocol: 'static', ok: true };
      const peers = members.map((m) => {
        const c = cableOnPort(doc, d.id, m.name);
        if (!c) return null;
        const far = otherEnd(c, d.id, m.name);
        const pd = deviceById(doc, far.device);
        return { cable: c, dev: pd, port: pd?.interfaces.find((x) => x.name === far.port) };
      });
      const connected = peers.filter(Boolean) as { cable: Cable; dev?: Device; port?: Iface }[];
      const peerIds = new Set(connected.map((p) => p.dev?.id));
      if (!connected.length) {
        ch.ok = false;
        ch.reason = 'no member port is cabled';
      } else if (peerIds.size > 1) {
        ch.ok = false;
        ch.reason = `members go to different devices (${[...peerIds].map((id) => deviceById(doc, id!)?.name).join(', ')}); a port-channel must end on one device (or a stack/VPC pair)`;
      } else {
        const p0 = connected[0];
        ch.peer = p0.dev?.id;
        ch.peerGroup = p0.port?.channelGroup;
        if (connected.some((p) => p.port?.channelGroup === undefined)) {
          ch.ok = false;
          ch.reason = `${p0.dev?.name} has not put its ports in a channel-group`;
        } else if (new Set(connected.map((p) => p.port?.channelGroup)).size > 1) {
          ch.ok = false;
          ch.reason = `${p0.dev?.name} spreads the peer ports across different channel-groups`;
        } else {
          const m = compatible(members[0].channelMode, p0.port?.channelMode);
          ch.protocol = m.protocol;
          if (!m.ok) {
            ch.ok = false;
            ch.reason = m.reason;
          } else {
            const sig = (i: Iface) => `${i.speed}/${i.duplex}/${i.mode ?? 'access'}/${i.mode === 'trunk' ? JSON.stringify(i.allowedVlans ?? 'all') + (i.nativeVlan ?? 1) : i.vlan ?? 1}`;
            const sigs = new Set(members.map(sig));
            if (sigs.size > 1) {
              ch.ok = false;
              ch.reason = 'member ports differ in speed, duplex, mode or VLANs; every member must be configured identically';
            } else if (connected.some((p) => !linkUp(doc, p.cable))) {
              ch.reason = 'some member links are down; the bundle runs on the rest';
            }
          }
        }
      }
      out.push(ch);
    }
  }
  return out;
}

// ---------------- Spanning tree ----------------

interface LogicalLink {
  a: string;
  b: string;
  aPorts: string[];
  bPorts: string[];
  cost: number;
}

function computeStp(doc: LabDoc, channels: Channel[], blocked: Set<string>, skip: Set<string> = new Set()): { bridges: Record<string, StpBridge>; storms: string[][]; issues: CpIssue[] } {
  const issues: CpIssue[] = [];
  const switches = doc.devices.filter((d) => d.kind === 'switch' && d.power !== 'stopped');
  const isSw = new Set(switches.map((s) => s.id));
  const bridges: Record<string, StpBridge> = {};
  for (const s of switches) {
    const priority = s.stp?.priority ?? 32768;
    const mac = baseMac(s);
    bridges[s.id] = { device: s.id, bridgeId: `${String(priority).padStart(5, '0')}.${mac}`, priority, mac, isRoot: false, rootId: '', rootCost: 0, enabled: s.stp?.enabled !== false, ports: {} };
  }
  // Logical links between switches: bundles count once, broken bundles' members are suspended.
  const links: LogicalLink[] = [];
  const bundled = new Set<string>();
  for (const ch of channels) {
    const dev = deviceById(doc, ch.device)!;
    if (!isSw.has(ch.device)) continue;
    if (!ch.ok) {
      for (const m of ch.members) blocked.add(`${ch.device}/${m}`);
      issues.push({ severity: 'warning', topic: 'etherchannel', message: `${dev.name} Po${ch.group}: ${ch.reason}. Members are suspended.`, devices: [ch.device, ...(ch.peer ? [ch.peer] : [])], fix: 'Match channel-group modes and member settings on both ends.' });
      continue;
    }
    for (const m of ch.members) bundled.add(`${ch.device}/${m}`);
    if (!ch.peer || !isSw.has(ch.peer) || ch.device > ch.peer) continue;
    const peerCh = channels.find((x) => x.device === ch.peer && x.group === ch.peerGroup);
    const up = ch.members.filter((m) => {
      const c = cableOnPort(doc, ch.device, m);
      return c && linkUp(doc, c);
    });
    if (!up.length) continue;
    const speed = portSpeed(dev.interfaces.find((i) => i.name === ch.members[0])!);
    links.push({ a: ch.device, b: ch.peer, aPorts: ch.members, bPorts: peerCh?.members ?? [], cost: stpCost(speed, up.length) });
  }
  for (const c of doc.cables) {
    if (!isSw.has(c.a.device) || !isSw.has(c.b.device) || !linkUp(doc, c)) continue;
    if (bundled.has(`${c.a.device}/${c.a.port}`) || bundled.has(`${c.b.device}/${c.b.port}`)) continue;
    if (blocked.has(`${c.a.device}/${c.a.port}`) || blocked.has(`${c.b.device}/${c.b.port}`)) continue;
    if (skip.has(`${c.a.device}/${c.a.port}`) || skip.has(`${c.b.device}/${c.b.port}`)) continue;
    const ia = deviceById(doc, c.a.device)!.interfaces.find((i) => i.name === c.a.port)!;
    links.push({ a: c.a.device, b: c.b.device, aPorts: [c.a.port], bPorts: [c.b.port], cost: stpCost(portSpeed(ia)) });
  }
  // Components of STP-speaking switches; each elects its own root.
  const enabled = (id: string) => bridges[id]?.enabled;
  const adj = new Map<string, LogicalLink[]>();
  for (const l of links) {
    if (!enabled(l.a) || !enabled(l.b)) continue;
    adj.set(l.a, [...(adj.get(l.a) ?? []), l]);
    adj.set(l.b, [...(adj.get(l.b) ?? []), l]);
  }
  const visited = new Set<string>();
  for (const s of switches.filter((x) => enabled(x.id))) {
    if (visited.has(s.id)) continue;
    const comp: string[] = [];
    const stack = [s.id];
    while (stack.length) {
      const x = stack.pop()!;
      if (visited.has(x)) continue;
      visited.add(x);
      comp.push(x);
      for (const l of adj.get(x) ?? []) stack.push(l.a === x ? l.b : l.a);
    }
    const root = comp.reduce((m, x) => (bridges[x].bridgeId < bridges[m].bridgeId ? x : m), comp[0]);
    // Dijkstra on path cost to the root
    const dist: Record<string, number> = { [root]: 0 };
    const done = new Set<string>();
    while (done.size < comp.length) {
      const next = comp.filter((x) => !done.has(x) && dist[x] !== undefined).sort((a, b) => dist[a] - dist[b] || bridges[a].bridgeId.localeCompare(bridges[b].bridgeId))[0];
      if (!next) break;
      done.add(next);
      for (const l of adj.get(next) ?? []) {
        const o = l.a === next ? l.b : l.a;
        if (dist[o] === undefined || dist[next] + l.cost < dist[o]) dist[o] = dist[next] + l.cost;
      }
    }
    for (const x of comp) {
      Object.assign(bridges[x], { isRoot: x === root, rootId: bridges[root].bridgeId, rootCost: dist[x] ?? 0 });
    }
    // Root port: best (cost via neighbour, neighbour bridge id, neighbour port)
    const rootLink: Record<string, LogicalLink> = {};
    for (const x of comp) {
      if (x === root) continue;
      let best: { l: LogicalLink; key: [number, string, string] } | null = null;
      for (const l of adj.get(x) ?? []) {
        const o = l.a === x ? l.b : l.a;
        const oPort = (l.a === x ? l.bPorts : l.aPorts)[0] ?? '';
        const key: [number, string, string] = [(dist[o] ?? 1e9) + l.cost, bridges[o].bridgeId, oPort];
        if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && (key[1] < best.key[1] || (key[1] === best.key[1] && key[2] < best.key[2])))) best = { l, key };
      }
      if (best) {
        rootLink[x] = best.l;
        bridges[x].rootPort = (best.l.a === x ? best.l.aPorts : best.l.bPorts)[0];
      }
    }
    // Port roles per link: designated side forwards, the other side is root port or alternate.
    const seenLinks = new Set<LogicalLink>();
    for (const x of comp)
      for (const l of adj.get(x) ?? []) {
        if (seenLinks.has(l)) continue;
        seenLinks.add(l);
        const ka: [number, string] = [dist[l.a] ?? 1e9, bridges[l.a].bridgeId];
        const kb: [number, string] = [dist[l.b] ?? 1e9, bridges[l.b].bridgeId];
        const aDesignated = ka[0] < kb[0] || (ka[0] === kb[0] && ka[1] < kb[1]);
        const [des, other, desPorts, otherPorts] = aDesignated ? [l.a, l.b, l.aPorts, l.bPorts] : [l.b, l.a, l.bPorts, l.aPorts];
        for (const p of desPorts) bridges[des].ports[p] = { role: 'designated', state: 'forwarding', cost: l.cost };
        const isRootPort = rootLink[other] === l;
        for (const p of otherPorts) {
          bridges[other].ports[p] = { role: isRootPort ? 'root' : 'alternate', state: isRootPort ? 'forwarding' : 'blocking', cost: l.cost };
          if (!isRootPort) blocked.add(`${other}/${p}`);
        }
      }
  }
  // Root guard: a port that would become the root port (superior BPDU) goes root-inconsistent instead.
  const guarded = switches.flatMap((sw) => {
    const rp = bridges[sw.id].rootPort;
    const i = rp ? sw.interfaces.find((x) => x.name === rp) : undefined;
    return i?.rootGuard && !skip.has(`${sw.id}/${rp}`) ? [`${sw.id}/${rp}`] : [];
  });
  if (guarded.length) {
    const again = computeStp(doc, channels, blocked, new Set([...skip, ...guarded]));
    for (const k of guarded) {
      const [dev, port] = [k.slice(0, k.indexOf('/')), k.slice(k.indexOf('/') + 1)];
      again.bridges[dev].ports[port] = { role: 'root-inconsistent', state: 'blocking', cost: 0 };
      blocked.add(k);
      again.issues.push({ severity: 'warning', topic: 'stp', message: `Root guard on ${deviceById(doc, dev)?.name} ${port} received a superior BPDU and put the port in root-inconsistent (blocking) state: a switch on that side is trying to become root.`, devices: [dev], fix: 'Lower the priority on the intended root bridge, or remove the switch that claims root.' });
    }
    return again;
  }
  // Edge ports and EtherChannel secondaries
  for (const s of switches) {
    for (const i of s.interfaces) {
      if (bridges[s.id].ports[i.name] || i.type === 'console' || /^vlan/i.test(i.name) || i.mode === 'routed') continue;
      const c = cableOnPort(doc, s.id, i.name);
      if (!c) continue;
      bridges[s.id].ports[i.name] = { role: i.shutdown ? 'disabled' : 'edge', state: i.shutdown ? 'disabled' : 'forwarding', cost: stpCost(portSpeed(i)) };
    }
  }
  for (const ch of channels.filter((c) => c.ok))
    for (const m of ch.members.slice(1)) blocked.add(`${ch.device}/${m}`); // frames use one member of a bundle
  for (const ch of channels.filter((c) => c.ok && bridges[c.device])) {
    const role = bridges[ch.device].ports[ch.members[0]];
    if (role) for (const m of ch.members) bridges[ch.device].ports[m] = role;
  }

  // Broadcast storms: loops left in the forwarding topology (STP disabled on part of it)
  const storms: string[][] = [];
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const l of links) {
    if (blocked.has(`${l.a}/${l.aPorts[0]}`) || blocked.has(`${l.b}/${l.bPorts[0]}`)) continue;
    const ra = find(l.a);
    const rb = find(l.b);
    if (ra === rb) storms.push([l.a, l.b]);
    else parent.set(ra, rb);
  }
  for (const st of storms) {
    const names = st.map((id) => deviceById(doc, id)?.name).join(' and ');
    issues.push({ severity: 'critical', topic: 'stp', message: `Layer 2 loop between ${names} with spanning tree off on part of it: a broadcast storm would melt this network (MAC flapping, 100% CPU, outage).`, devices: st, fix: 'Enable spanning tree on every switch, or remove the redundant link.' });
  }
  return { bridges, storms, issues };
}

// ---------------- HSRP ----------------

function computeHsrp(doc: LabDoc): { groups: HsrpGroup[]; vipOwners: L2Ctx['vipOwners']; glbp: NonNullable<L2Ctx['glbp']>; issues: CpIssue[] } {
  const groups = new Map<string, HsrpGroup>();
  for (const d of doc.devices)
    for (const i of d.interfaces) {
      if (!i.hsrp) continue;
      const proto = i.hsrp.proto ?? 'hsrp';
      const key = `${proto}|${i.hsrp.group}|${i.hsrp.vip}`;
      const g = groups.get(key) ?? { key, proto, group: i.hsrp.group, vip: i.hsrp.vip, members: [], issues: [] };
      const up = d.power !== 'stopped' && ifaceUp(d, i) && !!i.ip && sameSubnet(i.ip, i.hsrp.vip, i.prefix ?? 24);
      if (i.ip && !sameSubnet(i.ip, i.hsrp.vip, i.prefix ?? 24)) g.issues.push(`${d.name} ${i.name}: virtual IP ${i.hsrp.vip} is not in the interface subnet ${netStr(i.ip, i.prefix ?? 24)}`);
      g.members.push({ device: d.id, iface: i.name, priority: i.hsrp.priority, up });
      groups.set(key, g);
    }
  const vipOwners: L2Ctx['vipOwners'] = new Map();
  const glbp: NonNullable<L2Ctx['glbp']> = new Map();
  const issues: CpIssue[] = [];
  const ip = (m: { device: string; iface: string }) => ipToInt(deviceById(doc, m.device)!.interfaces.find((x) => x.name === m.iface)!.ip ?? '0.0.0.0') ?? 0;
  for (const g of groups.values()) {
    // VRRP: the router that owns the virtual IP as an interface address has priority 255.
    const prio = (m: HsrpGroup['members'][number]) => (g.proto === 'vrrp' && deviceById(doc, m.device)?.interfaces.find((x) => x.name === m.iface)?.ip === g.vip ? 255 : m.priority);
    const live = g.members.filter((m) => m.up).sort((a, b) => prio(b) - prio(a) || ip(b) - ip(a));
    g.active = live[0];
    g.standby = live[1];
    const P = g.proto.toUpperCase();
    const role = g.proto === 'vrrp' ? ['master', 'backup'] : g.proto === 'glbp' ? ['AVG', 'standby AVG'] : ['active', 'standby'];
    if (g.active) vipOwners.set(g.vip, { device: g.active.device, iface: g.active.iface });
    if (g.proto === 'glbp' && live.length) glbp.set(g.vip, live.slice(0, 4).map((m) => ({ device: m.device, iface: m.iface })));
    const names = g.members.map((m) => deviceById(doc, m.device)?.name).join(', ');
    if (!g.active) issues.push({ severity: 'critical', topic: 'hsrp', message: `${P} group ${g.group} (${g.vip}): no ${role[0]} router (${names} all down). Hosts using ${g.vip} as gateway are cut off.`, devices: g.members.map((m) => m.device) });
    else if (!g.standby) issues.push({ severity: 'warning', topic: 'hsrp', message: `${P} group ${g.group} (${g.vip}): only ${deviceById(doc, g.active.device)?.name} is up, so there is no ${role[1]} router.`, devices: g.members.map((m) => m.device), fix: 'Add or repair the second router in the group.' });
    for (const s of g.issues) issues.push({ severity: 'warning', topic: 'hsrp', message: `${P} group ${g.group}: ${s}.`, devices: g.members.map((m) => m.device) });
    // Same group number with different VIPs on the same subnet
    for (const o of groups.values()) if (o !== g && o.proto === g.proto && o.group === g.group && o.key > g.key && sameSubnet(o.vip, g.vip, 24)) issues.push({ severity: 'warning', topic: 'hsrp', message: `HSRP group ${g.group} has two different virtual IPs (${g.vip}, ${o.vip}) on one subnet; each router thinks it is active.`, devices: [...g.members, ...o.members].map((m) => m.device), fix: 'Use the same virtual IP on every member.' });
  }
  return { groups: [...groups.values()], vipOwners, glbp, issues };
}

// ---------------- OSPF ----------------

export function routerId(d: Device): string {
  if (d.ospfProcess?.routerId) return d.ospfProcess.routerId;
  const loop = d.interfaces.filter((i) => /^loopback/i.test(i.name) && i.ip).map((i) => i.ip!);
  const pool = loop.length ? loop : l3Ifaces(d).filter((i) => ifaceUp(d, i)).map((i) => i.ip!);
  return pool.sort((a, b) => (ipToInt(b) ?? 0) - (ipToInt(a) ?? 0))[0] ?? '0.0.0.0';
}

const ospfCost = (i: Iface) => i.ospf?.cost ?? Math.max(1, Math.floor(100 / portSpeed(i)));

function computeOspf(doc: LabDoc, ctx: L2Ctx): { neighbors: OspfNeighbor[]; routes: Record<string, Route[]>; rids: Record<string, string>; issues: CpIssue[] } {
  const issues: CpIssue[] = [];
  const routers = doc.devices.filter((d) => isRouter(d) && d.kind !== 'cloud' && d.power !== 'stopped' && d.interfaces.some((i) => i.ospf && i.ip));
  const rids: Record<string, string> = {};
  for (const r of routers) rids[r.id] = routerId(r);
  const neighbors: OspfNeighbor[] = [];
  const ifs = routers.flatMap((r) => r.interfaces.filter((i) => i.ospf && i.ip && i.prefix !== undefined && ifaceUp(r, i)).map((i) => ({ r, i })));
  for (const x of ifs) {
    if (x.i.ospf!.passive) continue;
    for (const y of ifs) {
      if (y.r.id === x.r.id || !sameSubnet(x.i.ip!, y.i.ip!, Math.min(x.i.prefix!, y.i.prefix!))) continue;
      const l2 = l2Walk(doc, x.r, x.i, y.i.ip!, ctx);
      const base = { device: x.r.id, iface: x.i.name, peer: y.r.id, peerIface: y.i.name, peerRid: rids[y.r.id], peerIp: y.i.ip!, area: x.i.ospf!.area };
      let state: OspfNeighbor['state'] = 'FULL';
      let reason: string | undefined;
      if (!l2.ok) [state, reason] = ['DOWN', `no hellos from ${y.r.name}: ${l2.reason}`];
      else if (y.i.ospf!.passive) [state, reason] = ['DOWN', `${y.r.name} ${y.i.name} is passive, so it never sends hellos`];
      else if (x.i.ospf!.area !== y.i.ospf!.area) [state, reason] = ['DOWN', `area mismatch: ${x.i.name} is in area ${x.i.ospf!.area}, ${y.r.name} ${y.i.name} is in area ${y.i.ospf!.area}; hellos are discarded`];
      else if (x.i.prefix !== y.i.prefix) [state, reason] = ['DOWN', `subnet mask mismatch: /${x.i.prefix} vs /${y.i.prefix}`];
      else if ((x.i.ospf!.hello ?? 10) !== (y.i.ospf!.hello ?? 10) || (x.i.ospf!.dead ?? 40) !== (y.i.ospf!.dead ?? 40)) [state, reason] = ['DOWN', `hello/dead timers differ (${x.i.ospf!.hello ?? 10}/${x.i.ospf!.dead ?? 40} vs ${y.i.ospf!.hello ?? 10}/${y.i.ospf!.dead ?? 40})`];
      else if (rids[x.r.id] === rids[y.r.id]) [state, reason] = ['DOWN', `duplicate router ID ${rids[x.r.id]}`];
      else if ((x.i.mtu ?? 1500) !== (y.i.mtu ?? 1500)) [state, reason] = ['EXSTART', `MTU mismatch (${x.i.mtu ?? 1500} vs ${y.i.mtu ?? 1500}): database description packets are rejected, stuck in EXSTART/EXCHANGE`];
      neighbors.push({ ...base, state, reason });
    }
  }
  for (const n of neighbors.filter((x) => x.state !== 'FULL' && x.device < x.peer)) {
    issues.push({ severity: 'warning', topic: 'ospf', message: `OSPF ${deviceById(doc, n.device)?.name} ${n.iface} ↔ ${deviceById(doc, n.peer)?.name} ${n.peerIface}: ${n.state}, ${n.reason}.`, devices: [n.device, n.peer] });
  }
  // SPF per router over FULL adjacencies
  const routes: Record<string, Route[]> = {};
  const full = neighbors.filter((n) => n.state === 'FULL' && neighbors.some((m) => m.device === n.peer && m.peer === n.device && m.state === 'FULL'));
  const adv = (r: Device) => {
    const nets = r.interfaces.filter((i) => i.ospf && i.ip && i.prefix !== undefined && ifaceUp(r, i)).map((i) => ({ prefix: netStr(i.ip!, i.prefix!), cost: ospfCost(i), area: i.ospf!.area }));
    const def = r.ospfProcess?.defaultOriginate && r.routes.some((x) => x.prefix === '0.0.0.0/0');
    return { nets, def };
  };
  for (const r of routers) {
    const dist: Record<string, number> = { [r.id]: 0 };
    const first: Record<string, OspfNeighbor> = {};
    const done = new Set<string>();
    for (;;) {
      const cur = Object.keys(dist).filter((k) => !done.has(k)).sort((a, b) => dist[a] - dist[b])[0];
      if (!cur) break;
      done.add(cur);
      const cd = deviceById(doc, cur)!;
      for (const n of full.filter((x) => x.device === cur)) {
        const cost = dist[cur] + ospfCost(cd.interfaces.find((i) => i.name === n.iface)!);
        if (dist[n.peer] === undefined || cost < dist[n.peer]) {
          dist[n.peer] = cost;
          first[n.peer] = cur === r.id ? n : first[cur];
        }
      }
    }
    const myArea = new Set(r.interfaces.filter((i) => i.ospf).map((i) => i.ospf!.area));
    const connected = new Set(l3Ifaces(r).map((i) => netStr(i.ip!, i.prefix!)));
    const best = new Map<string, Route>();
    for (const [id, d] of Object.entries(dist)) {
      if (id === r.id) continue;
      const peer = deviceById(doc, id)!;
      const hop = first[id];
      const a = adv(peer);
      for (const n of a.nets) {
        if (connected.has(n.prefix)) continue;
        const metric = d + n.cost;
        const cur = best.get(n.prefix);
        if (!cur || metric < (cur.metric ?? 1e9)) best.set(n.prefix, { prefix: n.prefix, via: hop.peerIp, iface: hop.iface, kind: 'ospf', metric, ad: 110, code: myArea.has(n.area) ? 'O' : 'O IA', description: `learned from ${peer.name} (${rids[id]})` });
      }
      if (a.def && !best.has('0.0.0.0/0')) best.set('0.0.0.0/0', { prefix: '0.0.0.0/0', via: hop.peerIp, iface: hop.iface, kind: 'ospf', metric: 1, ad: 110, code: 'O*E2', description: `default originated by ${peer.name}` });
    }
    routes[r.id] = [...best.values()];
  }
  return { neighbors, routes, rids, issues };
}

// ---------------- EIGRP ----------------

const eigrpBwKbps = (i: Iface) => (/^loopback/i.test(i.name) ? 8_000_000 : i.type === 'serial' ? 1544 : portSpeed(i) * 1000);
const eigrpDelay = (i: Iface) => i.eigrp?.delay ?? (/^loopback/i.test(i.name) ? 5000 : i.type === 'serial' ? 20000 : portSpeed(i) >= 1000 ? 10 : portSpeed(i) >= 100 ? 100 : 1000);
export const eigrpMetric = (minBw: number, delayUs: number) => Math.round(256 * (Math.floor(10_000_000 / minBw) + Math.floor(delayUs / 10)));

function computeEigrp(doc: LabDoc, ctx: L2Ctx): { neighbors: EigrpNeighbor[]; routes: Record<string, Route[]>; issues: CpIssue[] } {
  const issues: CpIssue[] = [];
  const routers = doc.devices.filter((d) => isRouter(d) && d.power !== 'stopped' && d.interfaces.some((i) => i.eigrp && i.ip));
  const ifs = routers.flatMap((r) => r.interfaces.filter((i) => i.eigrp && i.ip && i.prefix !== undefined && ifaceUp(r, i)).map((i) => ({ r, i })));
  const neighbors: EigrpNeighbor[] = [];
  for (const x of ifs) {
    if (x.i.eigrp!.passive || /^loopback/i.test(x.i.name)) continue;
    for (const y of ifs) {
      if (y.r.id === x.r.id || /^loopback/i.test(y.i.name)) continue;
      if (!sameSubnet(x.i.ip!, y.i.ip!, Math.min(x.i.prefix!, y.i.prefix!))) continue;
      const l2 = l2Walk(doc, x.r, x.i, y.i.ip!, ctx);
      let up = true;
      let reason: string | undefined;
      if (!l2.ok) [up, reason] = [false, `no hellos from ${y.r.name}: ${l2.reason}`];
      else if (y.i.eigrp!.passive) [up, reason] = [false, `${y.r.name} ${y.i.name} is passive`];
      else if (x.i.eigrp!.as !== y.i.eigrp!.as) [up, reason] = [false, `autonomous system mismatch: AS ${x.i.eigrp!.as} vs AS ${y.i.eigrp!.as}; hellos are ignored`];
      else if (x.i.prefix !== y.i.prefix) [up, reason] = [false, `${y.i.ip} is not on a common subnet with ${x.i.ip}/${x.i.prefix} (mask mismatch /${x.i.prefix} vs /${y.i.prefix})`];
      neighbors.push({ device: x.r.id, iface: x.i.name, peer: y.r.id, peerIface: y.i.name, peerIp: y.i.ip!, as: x.i.eigrp!.as, up, reason });
    }
  }
  for (const n of neighbors.filter((x) => !x.up && x.device < x.peer)) issues.push({ severity: 'warning', topic: 'eigrp', message: `EIGRP ${deviceById(doc, n.device)?.name} ${n.iface} ↔ ${deviceById(doc, n.peer)?.name} ${n.peerIface}: no adjacency, ${n.reason}.`, devices: [n.device, n.peer] });
  const adjUp = neighbors.filter((n) => n.up && neighbors.some((m) => m.device === n.peer && m.peer === n.device && m.up));
  const routes: Record<string, Route[]> = {};
  for (const r of routers) {
    // best (minBw, delay) to every router, label-setting on the composite metric
    type Lbl = { bw: number; delay: number; via?: EigrpNeighbor };
    const lbl: Record<string, Lbl> = { [r.id]: { bw: Infinity, delay: 0 } };
    const done = new Set<string>();
    for (;;) {
      const cur = Object.keys(lbl).filter((k) => !done.has(k)).sort((a, b) => eigrpMetric(lbl[a].bw, lbl[a].delay) - eigrpMetric(lbl[b].bw, lbl[b].delay))[0];
      if (!cur) break;
      done.add(cur);
      const cd = deviceById(doc, cur)!;
      for (const n of adjUp.filter((x) => x.device === cur)) {
        // metric toward the neighbour uses the outgoing interface of the router that is closer to us,
        // so routes into `n.peer` use the peer's receiving interface for its own networks below
        const out = cd.interfaces.find((i) => i.name === n.iface)!;
        const c: Lbl = { bw: Math.min(lbl[cur].bw, eigrpBwKbps(out)), delay: lbl[cur].delay + eigrpDelay(out), via: cur === r.id ? n : lbl[cur].via };
        const old = lbl[n.peer];
        if (!old || eigrpMetric(c.bw, c.delay) < eigrpMetric(old.bw, old.delay)) if (!done.has(n.peer)) lbl[n.peer] = c;
      }
    }
    const asOf = new Set(r.interfaces.filter((i) => i.eigrp).map((i) => i.eigrp!.as));
    const connected = new Set(l3Ifaces(r).map((i) => netStr(i.ip!, i.prefix!)));
    const best = new Map<string, Route>();
    for (const [id, l] of Object.entries(lbl)) {
      if (id === r.id || !l.via) continue;
      const peer = deviceById(doc, id)!;
      for (const i of peer.interfaces.filter((x) => x.eigrp && x.ip && x.prefix !== undefined && ifaceUp(peer, x) && asOf.has(x.eigrp.as))) {
        const prefix = netStr(i.ip!, i.prefix!);
        if (connected.has(prefix)) continue;
        const metric = eigrpMetric(Math.min(l.bw, eigrpBwKbps(i)), l.delay + eigrpDelay(i));
        const cur = best.get(prefix);
        if (!cur || metric < (cur.metric ?? Infinity)) best.set(prefix, { prefix, via: l.via.peerIp, iface: l.via.iface, kind: 'eigrp', metric, ad: 90, code: 'D', description: `learned from ${peer.name} (AS ${i.eigrp!.as})` });
      }
    }
    routes[r.id] = [...best.values()];
  }
  return { neighbors, routes, issues };
}

/** The routing table a device uses: connected, static and learned routes, best AD per prefix. */
export function effectiveRoutes(d: Device, learned: Route[] = []): Route[] {
  const out: Route[] = [];
  for (const i of l3Ifaces(d)) if (ifaceUp(d, i)) out.push({ prefix: netStr(i.ip!, i.prefix!), iface: i.name, kind: 'connected', ad: 0, metric: 0, code: 'C' });
  for (const r of d.routes) if (r.kind !== 'connected') out.push({ ...r, ad: r.ad ?? 1, metric: r.metric ?? 0, code: r.code ?? (r.prefix === '0.0.0.0/0' ? 'S*' : 'S') });
  for (const r of [...learned].sort((a, b) => (a.ad ?? 110) - (b.ad ?? 110))) if (!out.some((o) => o.prefix === r.prefix && (o.ad ?? 0) <= (r.ad ?? 110))) out.push(r);
  return out.sort((a, b) => (ipToInt(a.prefix.split('/')[0]) ?? 0) - (ipToInt(b.prefix.split('/')[0]) ?? 0) || Number(a.prefix.split('/')[1]) - Number(b.prefix.split('/')[1]));
}

// ---------------- entry point ----------------

export function controlPlane(doc: LabDoc): ControlPlane {
  const hit = cache.get(doc);
  if (hit) return hit;
  if (COMPUTING.has(doc)) return { stp: {}, channels: [], l2: NO_CTX, routerIds: {}, ospf: [], routes: {}, hsrp: [], eigrp: [], storms: [], issues: [] };
  COMPUTING.add(doc);
  try {
    const channels = computeChannels(doc);
    const blocked = new Set<string>();
    const stp = computeStp(doc, channels, blocked);
    const hsrp = computeHsrp(doc);
    // Static NAT: the router answers ARP for inside global addresses on its outside interface.
    for (const d of doc.devices)
      for (const n of d.staticNat ?? []) {
        const out = d.interfaces.find((i) => i.nat === 'outside' && i.ip && i.prefix !== undefined && sameSubnet(i.ip, n.outside, i.prefix));
        if (out && !hsrp.vipOwners.has(n.outside)) hsrp.vipOwners.set(n.outside, { device: d.id, iface: out.name });
      }
    const l2: L2Ctx = { blocked, vipOwners: hsrp.vipOwners, glbp: hsrp.glbp };
    const ospf = computeOspf(doc, l2);
    const eigrp = computeEigrp(doc, l2);
    const routes: Record<string, Route[]> = {};
    for (const d of doc.devices) if (isRouter(d) || d.routes.length) routes[d.id] = effectiveRoutes(d, [...(ospf.routes[d.id] ?? []), ...(eigrp.routes[d.id] ?? [])]);
    for (const ch of channels.filter((c) => !c.ok && !stp.issues.some((i) => i.topic === 'etherchannel' && i.devices[0] === c.device)))
      stp.issues.push({ severity: 'warning', topic: 'etherchannel', message: `${deviceById(doc, ch.device)?.name} Po${ch.group}: ${ch.reason}.`, devices: [ch.device] });
    const cp: ControlPlane = { stp: stp.bridges, channels, l2, routerIds: ospf.rids, ospf: ospf.neighbors, routes, hsrp: hsrp.groups, eigrp: eigrp.neighbors, storms: stp.storms, issues: [...stp.issues, ...hsrp.issues, ...ospf.issues, ...eigrp.issues] };
    cache.set(doc, cp);
    return cp;
  } finally {
    COMPUTING.delete(doc);
  }
}

// ---------------- derived tables ----------------

export function macTable(doc: LabDoc, switchId: string): { vlan: number; mac: string; port: string; owner: string }[] {
  const cp = controlPlane(doc);
  const out = new Map<string, { vlan: number; mac: string; port: string; owner: string }>();
  for (const d of doc.devices) {
    if (d.id === switchId || d.power === 'stopped') continue;
    for (const i of d.interfaces) {
      if (!i.mac || i.shutdown || i.type === 'console' || i.type === 'terminal' || (modelOf(d).forwarding === 'l2' && !/^vlan/i.test(i.name)) || i.bridge) continue;
      const r = l2Walk(doc, d, i, null, cp.l2, true);
      for (const h of r.switchHits) if (h.device === switchId) out.set(`${h.vlan}/${i.mac}`, { vlan: h.vlan, mac: i.mac, port: h.port, owner: `${d.name} ${i.name}` });
    }
  }
  return [...out.values()].sort((a, b) => a.vlan - b.vlan || a.port.localeCompare(b.port, undefined, { numeric: true }));
}

export function arpTable(doc: LabDoc, deviceId: string): { ip: string; mac: string; iface: string; owner: string }[] {
  const cp = controlPlane(doc);
  const d = deviceById(doc, deviceId);
  if (!d) return [];
  const out = new Map<string, { ip: string; mac: string; iface: string; owner: string }>();
  for (const i of l3Ifaces(d).filter((x) => ifaceUp(d, x))) {
    const r = l2Walk(doc, d, i, null, cp.l2, true);
    for (const x of r.reached) {
      if (x.device.id === d.id || !x.iface.ip || !sameSubnet(x.iface.ip, i.ip!, i.prefix!)) continue;
      out.set(x.iface.ip, { ip: x.iface.ip, mac: x.iface.mac, iface: i.name, owner: `${x.device.name} ${x.iface.name}` });
    }
    for (const g of cp.hsrp) if (g.active && sameSubnet(g.vip, i.ip!, i.prefix!) && g.active.device !== d.id) {
      const ai = deviceById(doc, g.active.device)?.interfaces.find((x) => x.name === g.active!.iface);
      if (ai) out.set(g.vip, { ip: g.vip, mac: `00:00:0c:07:ac:${g.group.toString(16).padStart(2, '0')}`, iface: i.name, owner: `HSRP ${g.group} virtual (active ${deviceById(doc, g.active.device)?.name})` });
    }
  }
  return [...out.values()].sort((a, b) => (ipToInt(a.ip) ?? 0) - (ipToInt(b.ip) ?? 0));
}

export function cdpNeighbors(doc: LabDoc, deviceId: string): { local: string; peer: string; peerPort: string; platform: string; capability: string }[] {
  const out: { local: string; peer: string; peerPort: string; platform: string; capability: string }[] = [];
  for (const c of doc.cables) {
    if (c.disabled || (c.a.device !== deviceId && c.b.device !== deviceId)) continue;
    const mine = c.a.device === deviceId ? c.a : c.b;
    const far = c.a.device === deviceId ? c.b : c.a;
    const p = deviceById(doc, far.device);
    if (!p || p.power === 'stopped' || !linkUp(doc, c)) continue;
    const m = modelOf(p);
    out.push({ local: mine.port, peer: p.name, peerPort: far.port, platform: `${m.vendor} ${m.name}`, capability: p.kind === 'router' || p.kind === 'firewall' ? 'R' : p.kind === 'switch' ? 'S I' : p.kind === 'ap' ? 'T' : 'H' });
  }
  return out;
}

// ---------------- DHCP ----------------

export interface DhcpResult {
  ok: boolean;
  ip?: string;
  prefix?: number;
  gateway?: string;
  dns?: string[];
  server?: string;
  via?: string;
  reason?: string;
  fix?: string;
}

function leaseFrom(doc: LabDoc, pool: NonNullable<Device['dhcpPools']>[number], mac: string, self: { device: string; iface: string }): { ip: string; prefix: number } | null {
  const net = parseCidr(pool.network);
  const s = ipToInt(pool.start);
  const e = ipToInt(pool.end);
  if (!net || s === null || e === null || e < s) return null;
  const used = new Set(doc.devices.flatMap((d) => d.interfaces.filter((i) => i.ip && !(d.id === self.device && i.name === self.iface)).map((i) => i.ip!)));
  const size = e - s + 1;
  let h = 0;
  for (const ch of mac) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  for (let k = 0; k < size; k++) {
    const ip = intToIp(s + ((h + k) % size));
    if (!used.has(ip)) return { ip, prefix: net.prefix };
  }
  return null;
}

/** DORA from a host interface: broadcast in its VLAN, local server or relay (ip helper-address) to a server pool. */
export function dhcpLease(doc: LabDoc, deviceId: string, ifaceName: string): DhcpResult {
  const cp = controlPlane(doc);
  const d = deviceById(doc, deviceId);
  const i = d?.interfaces.find((x) => x.name === ifaceName);
  if (!d || !i) return { ok: false, reason: 'Interface not found.' };
  if (d.power === 'stopped') return { ok: false, reason: `${d.name} is powered off.` };
  if (i.shutdown) return { ok: false, reason: `${i.name} is disabled.` };
  const probe: Iface = { ...i, ip: undefined };
  const r = l2Walk(doc, d, probe, null, cp.l2, true);
  if (!r.reached.length) return { ok: false, reason: `DHCPDISCOVER reached nobody: ${r.reason ?? 'no link or no other device in the broadcast domain'}.`, fix: 'Check the cable, the switch port and its VLAN.' };
  const self = { device: d.id, iface: i.name };
  // DHCP snooping: an OFFER entering a snooping switch on an untrusted port is dropped there.
  const snoopDrop = (srvDev: Device, srvIf: Iface): string | null => {
    const back = l2Walk(doc, srvDev, srvIf, null, cp.l2, true);
    const first = new Map<string, { port: string; vlan: number }>();
    for (const h of back.switchHits) if (!first.has(h.device)) first.set(h.device, { port: h.port, vlan: h.vlan });
    for (const [swId, hit] of first) {
      const sw = deviceById(doc, swId)!;
      if (!sw.dhcpSnooping?.enabled || !sw.dhcpSnooping.vlans.includes(hit.vlan)) continue;
      const port = sw.interfaces.find((x) => x.name === hit.port);
      if (!port?.dhcpTrust) return `DHCP snooping on ${sw.name} dropped the DHCPOFFER from ${srvDev.name}: it arrived on untrusted port ${hit.port} (VLAN ${hit.vlan})`;
    }
    return null;
  };
  const dropped: string[] = [];
  // 1. A server on the same segment (the closest one answers first, which is how a rogue server wins)
  for (const x of r.reached) {
    if (x.device.power === 'stopped' || !x.iface.ip) continue;
    const pool = x.device.dhcpPools?.find((p) => inCidr(x.iface.ip!, p.network));
    if (!pool) continue;
    const why = snoopDrop(x.device, x.iface);
    if (why) {
      dropped.push(why);
      continue;
    }
    const lease = leaseFrom(doc, pool, i.mac || d.id, self);
    if (!lease) return { ok: false, reason: `DHCP pool ${pool.name} on ${x.device.name} is exhausted.`, fix: 'Widen the pool range or shorten leases.' };
    return { ok: true, ...lease, gateway: pool.gateway, dns: pool.dns, server: `${x.device.name} (${x.iface.ip})` };
  }
  // 2. A relay on the segment
  const relays = r.reached.filter((x) => x.iface.helper && x.iface.ip).filter((x) => {
    const why = snoopDrop(x.device, x.iface);
    if (why) dropped.push(why.replace('DHCPOFFER from', 'relayed DHCPOFFER from'));
    return !why;
  });
  if (!relays.length) {
    if (dropped.length) return { ok: false, reason: `${dropped[0]}.`, fix: 'Trust the port that faces the real DHCP server or relay (ip dhcp snooping trust); leave access ports untrusted so rogue servers stay blocked.' };
    const vlans = [...new Set(r.reached.map((x) => x.vlan).filter((v) => v !== undefined))];
    return { ok: false, reason: `DHCPDISCOVER got no offer: there is no DHCP server or relay (ip helper-address) in this broadcast domain${vlans.length ? ` (VLAN ${vlans.join(', ')})` : ''}.`, fix: 'Configure ip helper-address on the VLAN gateway, or add a DHCP pool on a local server.' };
  }
  const relay = relays[0];
  const owner = ownerOfIp(doc, relay.iface.helper!);
  if (!owner) return { ok: false, reason: `${relay.device.name} ${relay.iface.name} relays to ${relay.iface.helper}, but nothing in the lab owns that address.`, fix: 'Point ip helper-address at the DHCP server.' };
  const t = simulatePacket(doc, { srcDevice: relay.device.id, dst: relay.iface.helper!, proto: 'udp', port: 67 }, cp);
  if (t.status !== 'delivered') return { ok: false, reason: `${relay.device.name} relayed the request to ${relay.iface.helper}, but it did not arrive: ${t.reason}`, fix: t.fix, via: relay.device.name };
  const pool = owner.device.dhcpPools?.find((p) => inCidr(relay.iface.ip!, p.network));
  if (!pool) return { ok: false, reason: `${owner.device.name} received the relayed request for ${netStr(relay.iface.ip!, relay.iface.prefix ?? 24)} but has no pool (scope) for that subnet.`, fix: `Create a DHCP pool for ${netStr(relay.iface.ip!, relay.iface.prefix ?? 24)} on ${owner.device.name}.` };
  const lease = leaseFrom(doc, pool, i.mac || d.id, self);
  if (!lease) return { ok: false, reason: `DHCP pool ${pool.name} on ${owner.device.name} is exhausted.`, fix: 'Widen the pool range.' };
  return { ok: true, ...lease, gateway: pool.gateway ?? relay.iface.ip, dns: pool.dns, server: `${owner.device.name} (${relay.iface.helper})`, via: `${relay.device.name} ${relay.iface.name}` };
}

// ---------------- PoE ----------------

/** Powers PoE devices from the switch port they are cabled to, within the switch's budget. Mutates `doc`. */
export function applyPoe(doc: LabDoc): void {
  const draw = new Map<string, number>();
  const pds = doc.devices.filter((d) => d.origin === 'design' && MODEL_BY_KEY[d.model]?.poweredBy === 'poe').sort((a, b) => a.name.localeCompare(b.name));
  for (const d of pds) {
    if (d.power === 'stopped' && !d.powerReason) continue; // switched off by the operator
    const m = MODEL_BY_KEY[d.model];
    const port = d.interfaces.find((i) => i.type === 'copper');
    const c = port ? cableOnPort(doc, d.id, port.name) : undefined;
    let reason: string | undefined;
    if (!c) reason = 'no PoE: the Ethernet port is not connected';
    else {
      const far = otherEnd(c, d.id, port!.name);
      const sw = deviceById(doc, far.device);
      const sm = sw ? MODEL_BY_KEY[sw.model] : undefined;
      const sp = sw?.interfaces.find((i) => i.name === far.port);
      if (!sw || !sm?.poeBudgetW) reason = `no PoE: ${sw?.name ?? 'the peer'} ${far.port} does not supply power (${sm ? `${sm.vendor} ${sm.name}` : 'not a PoE switch'})`;
      else if (c.disabled || sw.power === 'stopped' || sp?.shutdown) reason = `no PoE: ${sw.name} ${far.port} is ${sp?.shutdown ? 'shut down' : c.disabled ? 'unplugged' : 'powered off'}`;
      else {
        const used = draw.get(sw.id) ?? 0;
        if (used + (m.poeDrawW ?? 0) > sm.poeBudgetW) reason = `no PoE: ${sw.name}'s ${sm.poeBudgetW} W budget is used up (${used.toFixed(1)} W allocated)`;
        else draw.set(sw.id, used + (m.poeDrawW ?? 0));
      }
    }
    if (reason) Object.assign(d, { power: 'stopped', health: 'down', powerReason: reason });
    else if (d.powerReason) Object.assign(d, { power: 'running', health: 'healthy', powerReason: undefined });
  }
}

export function poeUsage(doc: LabDoc, switchId: string): { budget: number; used: number; ports: { port: string; device: string; watts: number }[] } {
  const sw = deviceById(doc, switchId);
  const budget = sw ? MODEL_BY_KEY[sw.model]?.poeBudgetW ?? 0 : 0;
  const ports: { port: string; device: string; watts: number }[] = [];
  for (const c of doc.cables) {
    const mine = c.a.device === switchId ? c.a : c.b.device === switchId ? c.b : null;
    if (!mine) continue;
    const far = otherEnd(c, switchId, mine.port);
    const pd = deviceById(doc, far.device);
    const m = pd ? MODEL_BY_KEY[pd.model] : undefined;
    if (pd && m?.poweredBy === 'poe' && pd.power === 'running') ports.push({ port: mine.port, device: pd.name, watts: m.poeDrawW ?? 0 });
  }
  return { budget, used: ports.reduce((a, p) => a + p.watts, 0), ports };
}

// ---------------- wireless ----------------

export function checkAssociation(client: Device, ap: Device): { ok: boolean; reason?: string } {
  const c = client.wireless;
  const a = ap.wireless;
  if (!a) return { ok: false, reason: `${ap.name} has no SSID configured.` };
  if (!c) return { ok: false, reason: `${client.name} has no wireless profile.` };
  if (ap.power === 'stopped') return { ok: false, reason: `${ap.name} is powered off${ap.powerReason ? ` (${ap.powerReason})` : ''}.` };
  if (c.ssid !== a.ssid) return { ok: false, reason: `SSID "${c.ssid}" not found: ${ap.name} broadcasts "${a.ssid}".` };
  if (c.security !== a.security) return { ok: false, reason: `Security mismatch: ${client.name} expects ${c.security.toUpperCase()}, ${ap.name} offers ${a.security.toUpperCase()}.` };
  if (a.security !== 'open' && (c.key ?? '') !== (a.key ?? '')) return { ok: false, reason: 'Authentication failed: the 4-way handshake did not complete (wrong passphrase).' };
  return { ok: true };
}

export function poeOf(doc: LabDoc) {
  return doc.devices.filter((d) => MODEL_BY_KEY[d.model]?.poeBudgetW).map((d) => ({ device: d, ...poeUsage(doc, d.id) }));
}

