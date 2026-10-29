// Packet simulator. Walks a packet through the designed lab the way the real devices would:
// source address choice, ARP and the default gateway (including HSRP virtual gateways),
// 802.1Q switching per VLAN with spanning-tree blocked ports and EtherChannel bundles,
// routing (connected, static, OSPF with administrative distance), PAT, first-match firewall
// rules, link conditioning, TTL and the listening port at the destination.
// Every outcome carries the exact reason and the hop where it happened.
import { modelOf } from './catalog';
import { inCidr, ipToInt, isIp, isPrivate, maskOf, sameSubnet } from './net';
import { controlPlane, type ControlPlane } from './protocols';
import { portSecurityState } from './l2features';
import { cableOnPort, cablesOnPort, cableStatus, deviceById, otherEnd } from './validate';
import type { Acl, AclEntry, Cable, Device, FirewallRule, Iface, LabDoc, Route } from './types';

export type PacketStatus = 'delivered' | 'blocked' | 'dropped' | 'malformed' | 'delayed';
export type Proto = 'icmp' | 'tcp' | 'udp';

export interface PacketRequest {
  srcDevice: string;
  /** Destination IP address or device id */
  dst: string;
  proto: Proto;
  port?: number;
  /** 0-based index within a ping burst; used for intermittent faults (loss, CRC) */
  index?: number;
  /** Override the source interface (used by DHCP relay and the CLI) */
  srcIface?: string;
}

export interface Pdu {
  srcMac: string;
  dstMac: string;
  vlan?: number;
  srcIp: string;
  dstIp: string;
  ttl: number;
  proto: Proto | 'arp';
  sport?: number;
  dport?: number;
  bytes: number;
}

export type HopDecision = 'send' | 'arp' | 'switch' | 'route' | 'nat' | 'deliver' | 'block' | 'drop' | 'malformed' | 'delay';

export interface Hop {
  seq: number;
  t: number; // ms since the packet left the source
  device: string;
  deviceName: string;
  cableId?: string; // cable crossed to reach this device
  inIface?: string;
  outIface?: string;
  layer: 'L1' | 'L2' | 'L3' | 'L4';
  decision: HopDecision;
  info: string;
  pdu: Pdu;
  acl?: { rule: number; action: 'pass' | 'block'; descr: string; iface: string; implicit?: boolean };
  route?: string;
}

export interface PacketTrace {
  id: string;
  request: PacketRequest;
  srcName: string;
  dstLabel: string;
  status: PacketStatus;
  reason: string;
  fix?: string;
  hops: Hop[];
  /** Device ids in order, for animation */
  path: string[];
  cables: string[];
  latencyMs?: number;
  nat?: { device: string; inside: string; outside: string; proto: string };
  at: string;
}

const SERVICE: Record<number, string> = { 22: 'SSH', 23: 'Telnet', 25: 'SMTP', 53: 'DNS', 67: 'DHCP', 80: 'HTTP', 88: 'Kerberos', 123: 'NTP', 135: 'RPC', 161: 'SNMP', 389: 'LDAP', 443: 'HTTPS', 445: 'SMB', 514: 'Syslog', 554: 'RTSP', 587: 'SMTP submission', 636: 'LDAPS', 1514: 'Wazuh agent', 1883: 'MQTT', 3389: 'RDP', 5432: 'PostgreSQL' };
export const serviceName = (p?: number) => (p ? (SERVICE[p] ? `${SERVICE[p]} (${p})` : String(p)) : '');

let counter = 0;

/** Routes packets: a router or firewall, or a layer 3 switch with `ip routing`. */
export function isRouter(d: Device): boolean {
  const f = modelOf(d).forwarding;
  return f === 'l3' || (d.kind === 'switch' && !!d.ipRouting);
}

/** A routed (no switchport) port on a layer 3 switch. */
export const isRoutedSwitchPort = (d: Device, i: Iface) => d.kind === 'switch' && i.mode === 'routed' && !/^vlan/i.test(i.name);

export function l3Ifaces(d: Device): Iface[] {
  return d.interfaces.filter((i) => isIp(i.ip) && i.prefix !== undefined);
}

export function primaryIp(d: Device | undefined): string | undefined {
  if (!d) return undefined;
  if (isIp(d.mgmtIp)) return d.mgmtIp;
  return l3Ifaces(d).find((i) => !i.ip!.startsWith('169.254'))?.ip ?? l3Ifaces(d)[0]?.ip;
}

export function ownerOfIp(doc: LabDoc, ip: string): { device: Device; iface: Iface } | undefined {
  for (const d of doc.devices) for (const i of d.interfaces) if (i.ip === ip) return { device: d, iface: i };
  return undefined;
}

function physical(d: Device, i: Iface): { port: Iface; tag?: number } {
  if (i.parent) {
    const p = d.interfaces.find((x) => x.name === i.parent);
    if (p) return { port: p, tag: i.vlan };
  }
  return { port: i };
}

export function ifaceUp(d: Device, i: Iface): boolean {
  if (i.shutdown) return false;
  if (i.parent) return !d.interfaces.find((x) => x.name === i.parent)?.shutdown;
  return true;
}

const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
};

// ---------------- firewall ----------------

function matchAddr(spec: string, ip: string, d: Device, doc: LabDoc): boolean {
  const s = spec.trim();
  if (s === 'any' || s === '*') return true;
  if (s === '!RFC1918') return !isPrivate(ip);
  const net = /^VLAN(\d+) net$/i.exec(s);
  if (net) {
    const v = Number(net[1]);
    const gw = d.interfaces.find((i) => i.vlan === v && i.parent && isIp(i.ip));
    if (gw?.ip && gw.prefix !== undefined) return sameSubnet(gw.ip, ip, gw.prefix);
    const vl = doc.vlans.find((x) => x.id === v);
    return vl?.subnet ? inCidr(ip, vl.subnet) : false;
  }
  const alias = /^(\S+) net$/i.exec(s);
  if (alias) {
    const i = d.interfaces.find((x) => x.alias?.toLowerCase() === alias[1].toLowerCase() && isIp(x.ip));
    return !!i && sameSubnet(i.ip!, ip, i.prefix!);
  }
  if (s.includes('/')) return inCidr(ip, s);
  return s === ip;
}

function matchPort(spec: string, port?: number) {
  if (spec === 'any' || port === undefined) return true;
  return spec.split(',').some((p) => {
    const [lo, hi] = p.split('-').map(Number);
    return hi ? port >= lo && port <= hi : port === lo;
  });
}

function matchProto(rule: FirewallRule['proto'], p: Pdu['proto']) {
  return rule === 'any' || rule === p || (rule === 'tcp/udp' && (p === 'tcp' || p === 'udp'));
}

export function ruleMatches(doc: LabDoc, d: Device, r: FirewallRule, inAlias: string, pdu: Pdu): boolean {
  if (!r.enabled) return false;
  if (r.iface !== 'any' && r.iface.toLowerCase() !== inAlias.toLowerCase()) return false;
  if (!matchProto(r.proto, pdu.proto)) return false;
  if (!matchAddr(r.src, pdu.srcIp, d, doc) || !matchAddr(r.dst, pdu.dstIp, d, doc)) return false;
  if (pdu.proto !== 'icmp' && !matchPort(r.port, pdu.dport)) return false;
  if (pdu.proto === 'icmp' && r.port !== 'any') return false;
  return true;
}

export function evaluateFirewall(doc: LabDoc, d: Device, inAlias: string, pdu: Pdu): { action: 'pass' | 'block'; rule?: FirewallRule; implicit: boolean } {
  for (const r of d.firewall) if (ruleMatches(doc, d, r, inAlias, pdu)) return { action: r.action, rule: r, implicit: false };
  // OPNsense and Cisco ACLs both end with an implicit deny.
  return { action: d.firewall.length || d.kind === 'firewall' ? 'block' : 'pass', implicit: true };
}

// ---------------- IOS access lists ----------------

function matchAclAddr(spec: string, ip: string): boolean {
  const t = spec.trim().toLowerCase().split(/\s+/);
  if (t[0] === 'any') return true;
  if (t[0] === 'host') return t[1] === ip;
  const net = ipToInt(t[0]);
  const wild = t[1] ? ipToInt(t[1]) : 0;
  const x = ipToInt(ip);
  if (net === null || wild === null || x === null) return false;
  return ((x | wild) >>> 0) === ((net | wild) >>> 0);
}

export function aclEntryText(a: Acl, e: AclEntry): string {
  if (a.type === 'standard') return `${e.seq} ${e.action} ${e.src === 'any' ? 'any' : e.src.startsWith('host') ? e.src : e.src}`;
  const port = e.port ? ` ${e.port.op} ${e.port.a}${e.port.b ? ` ${e.port.b}` : ''}` : '';
  return `${e.seq} ${e.action} ${e.proto} ${e.src} ${e.dst}${port}`;
}

/** First match wins; an ACL that is applied but not defined permits everything (IOS behaviour). */
export function evaluateAcl(d: Device, name: string, pdu: Pdu): { action: 'permit' | 'deny'; entry?: AclEntry; acl?: Acl; implicit: boolean; missing?: boolean } {
  const acl = d.acls?.find((a) => a.name === name);
  if (!acl) return { action: 'permit', implicit: true, missing: true };
  for (const e of acl.entries) {
    if (e.remark) continue;
    if (acl.type === 'standard') {
      if (matchAclAddr(e.src, pdu.srcIp)) return { action: e.action, entry: e, acl, implicit: false };
      continue;
    }
    if (e.proto !== 'ip' && e.proto !== pdu.proto) continue;
    if (!matchAclAddr(e.src, pdu.srcIp) || !matchAclAddr(e.dst, pdu.dstIp)) continue;
    if (e.port) {
      const p = pdu.dport;
      if (p === undefined) continue;
      const ok = e.port.op === 'eq' ? p === e.port.a : e.port.op === 'lt' ? p < e.port.a : e.port.op === 'gt' ? p > e.port.a : p >= e.port.a && p <= (e.port.b ?? e.port.a);
      if (!ok) continue;
    }
    return { action: e.action, entry: e, acl, implicit: false };
  }
  return { action: 'deny', acl, implicit: true };
}

// ---------------- layer 2 ----------------

/** Control-plane facts layer 2 forwarding depends on. */
export interface L2Ctx {
  /** `${deviceId}/${port}` ports that do not forward: STP alternate/blocking, suspended or secondary EtherChannel members */
  blocked: Set<string>;
  /** HSRP virtual IP -> the interface of the active router */
  vipOwners: Map<string, { device: string; iface: string }>;
  /** GLBP virtual IP -> all active forwarders (hosts are spread across them) */
  glbp?: Map<string, { device: string; iface: string }[]>;
}
export const NO_CTX: L2Ctx = { blocked: new Set(), vipOwners: new Map() };

interface L2Step {
  cable: Cable;
  device: Device;
  inPort: string;
  outPort?: string;
  vlan?: number;
  tagged: boolean;
}

export interface L2Result {
  ok: boolean;
  steps: L2Step[];
  target?: { device: Device; iface: Iface };
  reason?: string;
  fix?: string;
  degraded: { cable: Cable; message: string; crc: boolean }[];
  /** collect mode: every layer-3 interface the frame reached, and every switch port it entered */
  reached: { device: Device; iface: Iface; vlan?: number }[];
  switchHits: { device: string; port: string; vlan: number }[];
}

function vlanAccepts(port: Iface, tag: number | undefined): { vlan?: number; drop?: string } {
  const mode = port.mode ?? 'access';
  if (mode === 'trunk') {
    const v = tag ?? port.nativeVlan ?? 1;
    const allowed = port.allowedVlans ?? 'all';
    if (allowed !== 'all' && !allowed.includes(v)) return { drop: `VLAN ${v} is not in the allowed list on trunk ${port.name}` };
    return { vlan: v };
  }
  if (tag !== undefined && tag !== (port.vlan ?? 1)) return { drop: `a frame tagged for VLAN ${tag} arrived on access port ${port.name} (VLAN ${port.vlan ?? 1}) and was discarded` };
  return { vlan: port.vlan ?? 1 };
}

export const isSvi = (d: Device, i: Iface) => modelOf(d).forwarding === 'l2' && /^vlan\d+$/i.test(i.name);

/**
 * Finds the interface that answers ARP for `nextHop`, starting from `egress` on `from`.
 * With `collect`, keeps flooding and records everything reached (DHCP broadcasts, MAC and ARP tables).
 */
export function l2Walk(doc: LabDoc, from: Device, egress: Iface, nextHop: string | null, ctx: L2Ctx = NO_CTX, collect = false): L2Result {
  const res: L2Result = { ok: false, steps: [], degraded: [], reached: [], switchHits: [] };
  const blockers: { reason: string; fix?: string }[] = [];
  const reachedVlans = new Set<number>();
  type State = { device: Device; port: Iface; tag?: number; trail: L2Step[]; cable?: Cable };
  const queue: State[] = [];
  const seen = new Set<string>();
  const srcMac = (egress.mac || '').toLowerCase();
  const fwds = nextHop !== null ? ctx.glbp?.get(nextHop) : undefined;
  const vipOwner = nextHop === null ? undefined : fwds?.length ? fwds[hash(from.id) % fwds.length] : ctx.vipOwners.get(nextHop);
  const owns = (dev: Device, i: Iface) => nextHop !== null && (i.ip === nextHop || (vipOwner?.device === dev.id && vipOwner?.iface === i.name));

  /** A switch floods the frame out of every forwarding port that carries `vlan`. Returns an SVI that owns the next hop, if any. */
  const flood = (sw: Device, vlan: number, except: string | undefined, trail: L2Step[], cable?: Cable): Iface | undefined => {
    const isAp = sw.kind === 'ap';
    const svi = sw.interfaces.find((i) => isSvi(sw, i) && i.vlan === vlan && owns(sw, i) && !i.shutdown);
    if (svi) return svi;
    if (collect) for (const i of sw.interfaces.filter((x) => isSvi(sw, x) && x.vlan === vlan && x.ip && !x.shutdown)) res.reached.push({ device: sw, iface: i, vlan });
    for (const out of sw.interfaces) {
      if (out.name === except || out.type === 'console' || out.parent || isSvi(sw, out) || isRoutedSwitchPort(sw, out)) continue;
      const cables = out.type === 'wireless' ? cablesOnPort(doc, sw.id, out.name) : [cableOnPort(doc, sw.id, out.name)].filter(Boolean) as Cable[];
      if (!cables.length) continue;
      if (ctx.blocked.has(`${sw.id}/${out.name}`)) continue;
      if (out.shutdown) {
        blockers.push({ reason: `${sw.name} ${out.name} is administratively down (shutdown)`, fix: `no shutdown on ${out.name}.` });
        continue;
      }
      const mode = isAp ? 'access' : out.mode ?? 'access';
      if (mode === 'access' && !isAp && (out.vlan ?? 1) !== vlan) continue;
      if (mode === 'trunk') {
        const allowed = out.allowedVlans ?? 'all';
        if (allowed !== 'all' && !allowed.includes(vlan)) continue;
      }
      const tag = mode === 'trunk' && vlan !== (out.nativeVlan ?? 1) ? vlan : undefined;
      for (const c of cables) {
        if (except && out.type === 'wireless' && cable && c.id === cable.id) continue;
        const step: L2Step | undefined = cable && except ? { cable, device: sw, inPort: except, outPort: out.name, vlan, tagged: tag !== undefined } : undefined;
        queue.push({ device: sw, port: out, tag, trail: step ? [...trail, step] : trail, cable: c });
      }
    }
    return undefined;
  };

  // Where the frame starts.
  const members = from.interfaces.filter((i) => i.bridge === egress.name);
  if (isSvi(from, egress)) {
    seen.add(`${from.id}:${egress.vlan ?? 1}`);
    reachedVlans.add(egress.vlan ?? 1);
    flood(from, egress.vlan ?? 1, undefined, []);
  } else if (members.length) {
    seen.add(`${from.id}:bridge:${egress.name}`);
    for (const m of members) if (!m.shutdown && cableOnPort(doc, from.id, m.name)) queue.push({ device: from, port: m, trail: [] });
    if (!queue.length) blockers.push({ reason: `no cable on any member of ${from.name} ${egress.name}`, fix: 'Connect a bridge member port.' });
  } else {
    const start = physical(from, egress);
    queue.push({ device: from, port: start.port, tag: start.tag, trail: [] });
  }

  while (queue.length) {
    const s = queue.shift()!;
    const cable = s.cable ?? cableOnPort(doc, s.device.id, s.port.name);
    if (!cable) {
      if (s.trail.length === 0) blockers.push({ reason: `${from.name} ${s.port.name} has no cable connected`, fix: `Connect ${s.port.name} to the network.` });
      continue;
    }
    const st = cableStatus(doc, cable);
    if (st.state === 'down' || st.state === 'disabled') {
      const why = st.issues.find((i) => i.severity === 'down' || i.severity === 'error');
      blockers.push({ reason: `the link from ${s.device.name} ${s.port.name} is down: ${why?.message ?? 'no link'}`, fix: why?.fix });
      continue;
    }
    const deg = st.issues.find((i) => i.severity === 'degraded' && i.code === 'duplex_mismatch');
    if (deg && !res.degraded.some((d) => d.cable.id === cable.id)) res.degraded.push({ cable, message: deg.message, crc: true });
    const far = otherEnd(cable, s.device.id, s.port.name);
    const peer = deviceById(doc, far.device);
    const peerPort = peer?.interfaces.find((i) => i.name === far.port);
    if (!peer || !peerPort) continue;
    if (peer.power === 'stopped') {
      blockers.push({ reason: `${peer.name} is powered off${peer.powerReason ? ` (${peer.powerReason})` : ''}`, fix: peer.powerReason ? 'Restore its power source.' : `Power on ${peer.name}.` });
      continue;
    }
    if (ctx.blocked.has(`${peer.id}/${peerPort.name}`)) continue; // a blocking port discards what it receives
    if (modelOf(peer).forwarding === 'l2' && !isRoutedSwitchPort(peer, peerPort)) {
      const isAp = peer.kind === 'ap';
      const acc = isAp ? { vlan: s.tag ?? 1 } : vlanAccepts(peerPort, s.tag);
      if (acc.drop) {
        blockers.push({ reason: `${peer.name}: ${acc.drop}`, fix: 'Make the port modes and VLANs agree on both ends.' });
        continue;
      }
      const vlan = acc.vlan!;
      // Port security (restrict / protect) drops frames from MACs that are not secure on this port.
      if (s.trail.length === 0 && peerPort.portSecurity?.enabled && srcMac) {
        const ps = portSecurityState(doc, peer, peerPort);
        if (ps && !ps.allowed.has(srcMac)) {
          blockers.push({ reason: `port security on ${peer.name} ${peerPort.name} (${peerPort.portSecurity.violation}) dropped the frame: ${srcMac} is not a secure MAC address there`, fix: `Clear the secure MACs (clear port-security sticky interface ${peerPort.name}) or raise the maximum.` });
          continue;
        }
      }
      // Dynamic ARP inspection: ARP from an untrusted port needs a DHCP snooping binding.
      if (!collect && s.trail.length === 0 && peer.dhcpSnooping?.enabled && peer.dai?.vlans.includes(vlan) && !peerPort.dhcpTrust && !(egress.dhcp && egress.ip)) {
        blockers.push({ reason: `dynamic ARP inspection on ${peer.name} dropped the ARP from ${from.name} (${egress.ip ?? 'no IP'}) on untrusted port ${peerPort.name}: there is no DHCP snooping binding for it (static address)`, fix: `Trust ${peerPort.name} (ip arp inspection trust) if it faces a router or switch, or add an ARP ACL for static hosts.` });
        continue;
      }
      if (!isAp && vlan !== 1 && !peer.vlans[vlan]) {
        blockers.push({ reason: `${peer.name} has no VLAN ${vlan} in its VLAN database, so ${peerPort.name} drops the frame`, fix: `Create VLAN ${vlan} on ${peer.name}.` });
        continue;
      }
      reachedVlans.add(vlan);
      if (collect) res.switchHits.push({ device: peer.id, port: peerPort.name, vlan });
      const key = `${peer.id}:${vlan}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const svi = flood(peer, vlan, peerPort.name, s.trail, cable);
      if (svi && !collect) {
        res.ok = true;
        res.steps = [...s.trail, { cable, device: peer, inPort: peerPort.name, vlan, tagged: s.tag !== undefined }];
        res.target = { device: peer, iface: svi };
        return res;
      }
      continue;
    }
    const trail = [...s.trail, { cable, device: peer, inPort: peerPort.name, vlan: s.tag, tagged: s.tag !== undefined }];
    // Software bridge on a firewall or server: the bridge interface owns the address and forwards between members.
    if (peerPort.bridge && s.tag === undefined) {
      const br = peer.interfaces.find((i) => i.name === peerPort.bridge);
      if (br && !br.shutdown) {
        if (collect && br.ip) res.reached.push({ device: peer, iface: br });
        if (owns(peer, br) && !collect) {
          res.ok = true;
          res.steps = trail;
          res.target = { device: peer, iface: br };
          return res;
        }
      }
      const key = `${peer.id}:bridge:${peerPort.bridge}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const m of peer.interfaces.filter((i) => i.bridge === peerPort.bridge && i.name !== peerPort.name && !i.shutdown)) {
        queue.push({ device: peer, port: m, trail: [...s.trail, { cable, device: peer, inPort: peerPort.name, outPort: m.name, tagged: false }] });
      }
      continue;
    }
    const candidates = peer.interfaces.filter((i) => (s.tag === undefined ? i.name === peerPort.name || (peer.kind === 'cloud' && !i.parent) : i.parent === peerPort.name && i.vlan === s.tag) && ifaceUp(peer, i));
    if (collect) for (const i of candidates) if (i.ip) res.reached.push({ device: peer, iface: i, vlan: s.tag });
    const owner = candidates.find((i) => owns(peer, i)) ?? (peer.kind === 'cloud' && nextHop ? peer.interfaces.find((i) => i.ip === nextHop && !i.shutdown) : undefined);
    if (owner && !collect) {
      res.ok = true;
      res.steps = trail;
      res.target = { device: peer, iface: owner };
      return res;
    }
  }
  if (collect) {
    res.ok = res.reached.length > 0;
    if (!res.ok && blockers.length) res.reason = blockers[0].reason;
    return res;
  }
  // Explain the failure as precisely as possible.
  const owner = nextHop ? ownerOfIp(doc, nextHop) : undefined;
  if (blockers.length) {
    res.reason = `ARP for ${nextHop} got no reply: ${blockers[0].reason}.`;
    res.fix = blockers[0].fix;
  } else if (!owner && !(nextHop && ctx.vipOwners.has(nextHop))) {
    const vipHere = nextHop ? doc.devices.flatMap((d) => d.interfaces.filter((i) => i.hsrp?.vip === nextHop).map((i) => `${d.name} ${i.name}`)) : [];
    res.reason = vipHere.length ? `ARP for ${nextHop} got no reply: it is an HSRP virtual IP but no router is active for it (${vipHere.join(', ')} down or misconfigured).` : `ARP for ${nextHop} got no reply: no device in this lab owns ${nextHop}.`;
    res.fix = vipHere.length ? 'Bring up an HSRP group member (interface up, VIP in its subnet).' : 'Check the destination or the default gateway address.';
  } else if (owner) {
    const ov = vlanOfIface(doc, owner.device, owner.iface);
    if (ov !== undefined && reachedVlans.size && !reachedVlans.has(ov)) {
      res.reason = `ARP for ${nextHop} got no reply: the frame is in VLAN ${[...reachedVlans].join(', ')} but ${owner.device.name} (${nextHop}) is in VLAN ${ov}.`;
      res.fix = `Put the access port in VLAN ${ov}, or trunk VLAN ${ov} to where the frame enters.`;
    } else {
      res.reason = `ARP for ${nextHop} got no reply: ${owner.device.name} is not reachable at layer 2 from ${from.name} ${egress.name}.`;
      res.fix = 'Check cabling, port VLANs, trunks and spanning-tree state between them.';
    }
  } else {
    res.reason = `ARP for ${nextHop} got no reply.`;
  }
  return res;
}

/** The VLAN an interface's traffic lives in, following the cable to the switch if needed. */
export function vlanOfIface(doc: LabDoc, d: Device, i: Iface): number | undefined {
  if (i.parent) return i.vlan;
  const c = cableOnPort(doc, d.id, i.name);
  if (!c) return i.vlan;
  const far = otherEnd(c, d.id, i.name);
  const peer = deviceById(doc, far.device);
  const pp = peer?.interfaces.find((x) => x.name === far.port);
  if (peer?.kind === 'switch' && pp && (pp.mode ?? 'access') === 'access') return pp.vlan ?? 1;
  return i.vlan;
}

// ---------------- layer 3 ----------------

interface RouteHit {
  egress: Iface;
  nextHop: string;
  text: string;
  route: Route;
}

export function netStr(ip: string, prefix: number) {
  const n = ipToInt(ip)!;
  const m = maskOf(prefix);
  const base = (n & m) >>> 0;
  return `${[(base >>> 24) & 255, (base >>> 16) & 255, (base >>> 8) & 255, base & 255].join('.')}/${prefix}`;
}

/** Longest prefix wins; on a tie, the lowest administrative distance. */
export function routeLookup(d: Device, dst: string, routes: Route[] = d.routes): RouteHit | { error: string } {
  const candidates: { prefix: number; ad: number; egress: Iface; nextHop: string; text: string; route: Route }[] = [];
  for (const i of l3Ifaces(d)) {
    if (!ifaceUp(d, i)) continue;
    if (sameSubnet(i.ip!, dst, i.prefix!)) candidates.push({ prefix: i.prefix!, ad: 0, egress: i, nextHop: dst, text: `C ${netStr(i.ip!, i.prefix!)} is directly connected, ${i.name}`, route: { prefix: netStr(i.ip!, i.prefix!), iface: i.name, kind: 'connected', ad: 0, code: 'C' } });
  }
  for (const r of routes) {
    if (r.kind === 'connected') continue;
    const [net, p] = r.prefix.split('/');
    const prefix = Number(p);
    const n = ipToInt(net);
    const x = ipToInt(dst);
    if (n === null || x === null || ((x & maskOf(prefix)) >>> 0) !== ((n & maskOf(prefix)) >>> 0)) continue;
    let egress = r.iface ? d.interfaces.find((i) => i.name === r.iface) : undefined;
    if (!egress && r.via) egress = l3Ifaces(d).find((i) => sameSubnet(i.ip!, r.via!, i.prefix!));
    if (!egress || !ifaceUp(d, egress)) continue;
    const ad = r.ad ?? (r.kind === 'ospf' ? 110 : 1);
    const code = r.code ?? (r.prefix === '0.0.0.0/0' ? 'S*' : 'S');
    candidates.push({ prefix, ad, egress, nextHop: r.via ?? dst, text: `${code} ${r.prefix} [${ad}/${r.metric ?? 0}]${r.via ? ` via ${r.via}` : ''}, ${egress.name}`, route: r });
  }
  if (!candidates.length) return { error: `${d.name} has no route to ${dst}` };
  candidates.sort((a, b) => b.prefix - a.prefix || a.ad - b.ad);
  return candidates[0];
}

function linkLatency(c: Cable, index: number): number {
  let ms = 0.3;
  if (c.wan?.latencyMs) ms = c.wan.latencyMs;
  else if (c.type === 'wan') ms = 18;
  else if (c.type === 'virtual') ms = 4;
  else if (c.type === 'serial') ms = 8;
  if (c.cond?.enabled) {
    ms += (c.cond.latencyMs ?? 0) / 2; // configured as round-trip
    if (c.cond.jitterMs) ms += ((hash(`${c.id}/${index}`) % 1000) / 1000) * c.cond.jitterMs;
  }
  return ms;
}

export function simulatePacket(doc: LabDoc, req: PacketRequest, cpIn?: ControlPlane): PacketTrace {
  const cp = cpIn ?? controlPlane(doc);
  const ctx = cp.l2;
  const src = deviceById(doc, req.srcDevice);
  const dstDevice = isIp(req.dst) ? ownerOfIp(doc, req.dst)?.device : deviceById(doc, req.dst);
  const dstIp = isIp(req.dst) ? req.dst : primaryIp(dstDevice);
  const index = req.index ?? 0;
  const trace: PacketTrace = {
    id: `pkt-${Date.now().toString(36)}-${++counter}`,
    request: req,
    srcName: src?.name ?? '?',
    dstLabel: dstDevice ? `${dstDevice.name}${dstIp ? ` (${dstIp})` : ''}` : (dstIp ?? req.dst),
    status: 'dropped',
    reason: '',
    hops: [],
    path: [],
    cables: [],
    at: new Date().toISOString(),
  };
  const fail = (status: PacketStatus, reason: string, fix?: string) => {
    trace.status = status;
    trace.reason = reason;
    trace.fix = fix;
    return trace;
  };
  if (!src) return fail('dropped', 'Pick a source device.');
  trace.path.push(src.id);
  if (src.power === 'stopped') return fail('dropped', `${src.name} is powered off${src.powerReason ? ` (${src.powerReason})` : ''}, so it cannot send anything.`, src.powerReason ? 'Restore its power source.' : `Power on ${src.name}.`);
  if (!dstIp) return fail('dropped', `${dstDevice?.name ?? req.dst} has no IP address to send to.`, 'Give the destination an IP address, or pick another destination.');

  const up = l3Ifaces(src).filter((i) => ifaceUp(src, i) && (!req.srcIface || i.name === req.srcIface));
  if (!up.length) return fail('dropped', `${src.name} has no IP address on an interface that is up.`, 'Assign an address (or let DHCP give one) and bring the interface up.');
  const srcIf = up.find((i) => sameSubnet(i.ip!, dstIp, i.prefix!)) ?? up.find((i) => i.gateway) ?? up[0];
  if (srcIf.ip!.startsWith('169.254')) return fail('dropped', `${src.name} only has a self-assigned address (${srcIf.ip}): DHCP got no answer, so it has no gateway and cannot reach ${dstIp}.`, 'Fix DHCP reachability (usually the switch port VLAN), then renew the lease.');

  const sport = 49152 + ((ipToInt(dstIp) ?? 0) % 10000) + index;
  const pdu: Pdu = { srcMac: srcIf.mac, dstMac: 'ff:ff:ff:ff:ff:ff', srcIp: srcIf.ip!, dstIp, ttl: src.os === 'windows' || src.kind === 'pc' ? 128 : 64, proto: req.proto, sport: req.proto === 'icmp' ? undefined : sport, dport: req.proto === 'icmp' ? undefined : req.port, bytes: req.proto === 'icmp' ? 74 : 66 };
  let t = 0;
  let seq = 0;
  const push = (h: Omit<Hop, 'seq' | 't' | 'pdu' | 'deviceName'> & { device: string }, dt = 0.05, pduOverride?: Partial<Pdu>) => {
    t += dt;
    trace.hops.push({ ...h, seq: ++seq, t: Math.round(t * 100) / 100, deviceName: deviceById(doc, h.device)?.name ?? '?', pdu: { ...pdu, ...pduOverride } });
  };
  const what = req.proto === 'icmp' ? `ICMP echo request to ${dstIp}` : `${req.proto.toUpperCase()} ${req.proto === 'tcp' ? 'SYN' : 'datagram'} to ${dstIp}:${serviceName(req.port)}`;
  push({ device: src.id, outIface: srcIf.name, layer: 'L3', decision: 'send', info: `${src.name} builds ${what} from ${srcIf.ip} (${srcIf.name}).` }, 0);

  let cur: Device = src;
  let curDst = dstIp;
  let arrival: Iface | undefined;
  let delayed: string | undefined;
  let extraLatency = 0;
  for (let l3hop = 0; l3hop < 16; l3hop++) {
    // ---- choose egress and next hop ----
    let egress: Iface;
    let nextHop: string;
    let routeText: string;
    if (cur.id === src.id && !isRouter(src)) {
      egress = srcIf;
      if (sameSubnet(srcIf.ip!, dstIp, srcIf.prefix!)) {
        nextHop = dstIp;
        routeText = `${dstIp} is on the local subnet ${netStr(srcIf.ip!, srcIf.prefix!)}`;
      } else if (!srcIf.gateway) {
        return fail('dropped', `${src.name} has no default gateway, so it cannot send to ${dstIp} outside ${netStr(srcIf.ip!, srcIf.prefix!)}.`, 'Configure the default gateway (or fix DHCP option 003).');
      } else if (!sameSubnet(srcIf.ip!, srcIf.gateway, srcIf.prefix!)) {
        return fail('dropped', `${src.name}'s default gateway ${srcIf.gateway} is outside its own subnet ${netStr(srcIf.ip!, srcIf.prefix!)}, so it can never ARP for it.`, 'Set a gateway inside the subnet.');
      } else {
        nextHop = srcIf.gateway;
        routeText = `default route via ${srcIf.gateway}${ctx.vipOwners.has(srcIf.gateway) ? ' (HSRP virtual gateway)' : ''}`;
      }
    } else {
      const hit = routeLookup(cur, curDst, cp.routes[cur.id] ?? cur.routes);
      if ('error' in hit) {
        push({ device: cur.id, layer: 'L3', decision: 'drop', info: `${hit.error}. Packet discarded.` });
        return fail('dropped', `${hit.error}: the routing table has no matching or default route.`, `Add a route on ${cur.name} for ${curDst} (static, OSPF or EIGRP), or a default route.`);
      }
      egress = hit.egress;
      nextHop = hit.nextHop;
      routeText = hit.text;
    }
    // ---- outbound IOS ACL ----
    if (cur.id !== src.id && egress.aclOut) {
      const v = evaluateAcl(cur, egress.aclOut, pdu);
      const line = v.entry && v.acl ? aclEntryText(v.acl, v.entry) : v.missing ? `ACL ${egress.aclOut} is not defined (permits everything)` : 'implicit deny any';
      const acl = { rule: v.entry?.seq ?? 0, action: v.action === 'permit' ? ('pass' as const) : ('block' as const), descr: `${egress.aclOut}: ${line}`, iface: `${egress.name} out`, implicit: v.implicit };
      if (v.action === 'deny') {
        push({ device: cur.id, outIface: egress.name, layer: 'L3', decision: 'block', acl, info: `ACL ${egress.aclOut} outbound on ${egress.name}: ${line} denies it.` });
        return fail('blocked', `Denied by access list ${egress.aclOut} outbound on ${cur.name} ${egress.name}: ${line}.`, v.implicit ? `Every ACL ends with an implicit deny: add a permit for this traffic in ${egress.aclOut}.` : `Change or reorder ${egress.aclOut} if this traffic should pass.`);
      }
    }
    // ---- static NAT for an inside host on the way out ----
    const outStatic = cur.id !== src.id && arrival?.nat === 'inside' && egress.nat === 'outside' ? cur.staticNat?.find((n) => n.inside === pdu.srcIp) : undefined;
    if (outStatic) {
      trace.nat = { device: cur.id, inside: pdu.srcIp, outside: outStatic.outside, proto: req.proto };
      push({ device: cur.id, outIface: egress.name, layer: 'L3', decision: 'nat', info: `Static NAT on ${cur.name}: inside local ${pdu.srcIp} translated to inside global ${outStatic.outside}.` });
      pdu.srcIp = outStatic.outside;
    }
    // ---- PAT on the way out ----
    else if (cur.id !== src.id && cur.natOverload?.outside === egress.name && arrival?.nat === 'inside' && egress.ip) {
      const before = `${pdu.srcIp}${pdu.sport ? `:${pdu.sport}` : ''}`;
      const newPort = 1024 + (hash(`${pdu.srcIp}/${pdu.sport ?? index}`) % 60000);
      pdu.srcIp = egress.ip;
      if (pdu.sport) pdu.sport = newPort;
      const after = `${pdu.srcIp}${pdu.sport ? `:${pdu.sport}` : ''}`;
      trace.nat = { device: cur.id, inside: before, outside: after, proto: req.proto };
      push({ device: cur.id, outIface: egress.name, layer: 'L3', decision: 'nat', info: `PAT (overload on ${egress.name}): inside ${before} translated to ${after}.` });
    }
    pdu.vlan = egress.parent ? egress.vlan : undefined;
    pdu.srcMac = egress.mac || pdu.srcMac;

    // ---- ARP, then layer 2 ----
    const l2 = l2Walk(doc, cur, egress, nextHop, ctx);
    push({ device: cur.id, outIface: egress.name, layer: 'L2', decision: 'arp', info: `ARP request (broadcast): who has ${nextHop}? Tell ${egress.ip ?? pdu.srcIp}.`, route: routeText }, 0.02, { proto: 'arp', dstMac: 'ff:ff:ff:ff:ff:ff', bytes: 42, sport: undefined, dport: undefined });
    if (!l2.ok) {
      push({ device: cur.id, outIface: egress.name, layer: 'L2', decision: 'drop', info: l2.reason ?? 'ARP failed.', route: routeText });
      return fail('dropped', l2.reason ?? 'ARP failed.', l2.fix);
    }
    const target = l2.target!;
    push({ device: cur.id, inIface: egress.name, layer: 'L2', decision: 'arp', info: `ARP reply from ${target.device.name}: ${nextHop} is at ${target.iface.mac || 'its MAC'}${ctx.vipOwners.get(nextHop)?.device === target.device.id ? ' (HSRP active router answers for the virtual IP)' : ''}.` }, 0.02, { proto: 'arp', srcMac: target.iface.mac, dstMac: egress.mac, bytes: 42, sport: undefined, dport: undefined });
    pdu.dstMac = target.iface.mac;
    for (const step of l2.steps) {
      trace.cables.push(step.cable.id);
      trace.path.push(step.device.id);
      t += linkLatency(step.cable, index);
      const c = step.cable;
      if (c.cond?.enabled && c.cond.bandwidthMbps) t += (pdu.bytes * 8) / (c.cond.bandwidthMbps * 1000);
      if (c.cond?.enabled && c.cond.lossPct && hash(`${c.id}/loss/${index}/${req.dst}`) % 100 < c.cond.lossPct) {
        push({ device: step.device.id, cableId: c.id, inIface: step.inPort, layer: 'L1', decision: 'drop', info: `Lost on the link into ${step.device.name} ${step.inPort} (link conditioning: ${c.cond.lossPct}% loss).` });
        return fail('dropped', `The packet was lost on the link into ${step.device.name} ${step.inPort}: link conditioning drops ${c.cond.lossPct}% of packets.`, 'Reduce the configured loss, or check the circuit with the provider.');
      }
      const deg = l2.degraded.find((d) => d.cable.id === step.cable.id);
      if (deg && index % 4 === 2) {
        push({ device: step.device.id, cableId: step.cable.id, inIface: step.inPort, layer: 'L1', decision: 'malformed', info: `Frame arrived with a bad FCS (CRC error) on ${step.inPort} and was discarded. ${deg.message}` });
        return fail('malformed', `The frame was corrupted on the link into ${step.device.name} ${step.inPort} (CRC error) and discarded. ${deg.message}`, 'Fix speed and duplex on both ends of that link.');
      }
      if (deg) {
        extraLatency += 120;
        delayed = `Delivered late: the link into ${step.device.name} ${step.inPort} is retransmitting after collisions. ${deg.message}`;
      }
      if (step.outPort) {
        pdu.vlan = step.tagged ? step.vlan : undefined;
        push({ device: step.device.id, cableId: step.cable.id, inIface: step.inPort, outIface: step.outPort, layer: 'L2', decision: deg ? 'delay' : 'switch', info: `VLAN ${step.vlan}: MAC ${pdu.dstMac} learned on ${step.outPort}; in ${step.inPort}, out ${step.outPort}${step.tagged ? ` tagged 802.1Q ${step.vlan}` : ' untagged'}.` });
      }
    }
    cur = target.device;
    arrival = target.iface;

    // ---- arrived at a layer 3 device ----
    if (target.device.interfaces.some((i) => i.ip === curDst)) {
      const svc = req.proto === 'icmp' ? null : req.port;
      const listens = target.device.kind === 'cloud' || svc === null || target.device.listening.includes(svc!);
      if (target.device.firewall.length && target.device.kind !== 'firewall') {
        const v = evaluateFirewall(doc, target.device, target.iface.alias ?? target.iface.name, pdu);
        if (v.action === 'block') {
          push({ device: target.device.id, cableId: trace.cables.at(-1), inIface: target.iface.name, layer: 'L3', decision: 'block', info: `Host firewall on ${target.device.name} blocked it${v.rule ? ` (rule ${v.rule.id}: ${v.rule.descr})` : ' (implicit deny)'}.`, acl: { rule: v.rule?.id ?? 0, action: 'block', descr: v.rule?.descr ?? 'Implicit deny', iface: target.iface.name, implicit: v.implicit } });
          return fail('blocked', `Blocked by the host firewall on ${target.device.name}${v.rule ? `: rule ${v.rule.id} "${v.rule.descr}"` : ''}.`, 'Allow the traffic on the host firewall if it should be permitted.');
        }
      }
      if (!listens) {
        push({ device: target.device.id, cableId: trace.cables.at(-1), inIface: target.iface.name, layer: 'L4', decision: 'drop', info: `${target.device.name} answered with ${req.proto === 'tcp' ? 'TCP RST' : 'ICMP port unreachable'}: nothing listens on ${req.proto.toUpperCase()} ${serviceName(svc!)}.` });
        return fail('dropped', `${target.device.name} (${dstIp}) is reachable, but nothing listens on ${req.proto.toUpperCase()} ${serviceName(svc!)}: it answered ${req.proto === 'tcp' ? 'with a TCP reset (connection refused)' : 'port unreachable'}.`, `Start the service on ${target.device.name}, or use the right port.`);
      }
      push({ device: target.device.id, cableId: trace.cables.at(-1), inIface: target.iface.name, layer: req.proto === 'icmp' ? 'L3' : 'L4', decision: 'deliver', info: req.proto === 'icmp' ? `${target.device.name} received the echo request and sent an echo reply.` : `${target.device.name} accepted ${req.proto.toUpperCase()} ${serviceName(svc!)}${req.proto === 'tcp' ? ' (SYN-ACK)' : ''}.` });
      trace.latencyMs = Math.round((t * 2 + extraLatency) * 10) / 10;
      if (delayed) return fail('delayed', delayed, 'Fix speed and duplex on both ends of that link.');
      if (trace.latencyMs >= 300) return fail('delayed', `Delivered, but slowly: round trip ${trace.latencyMs} ms over conditioned or long-haul links. Real-time traffic (voice, RDP) will suffer.`, 'Check link conditioning and WAN latency on the path.');
      trace.status = 'delivered';
      trace.reason = req.proto === 'icmp' ? `Reply from ${dstIp}: time ${trace.latencyMs} ms, TTL ${pdu.ttl}.` : `${target.device.name} accepted the connection on ${serviceName(svc!)} (round trip ${trace.latencyMs} ms).`;
      return trace;
    }
    if (!isRouter(target.device)) {
      const sw = target.device.kind === 'switch';
      push({ device: target.device.id, cableId: trace.cables.at(-1), inIface: target.iface.name, layer: 'L3', decision: 'drop', info: sw ? `${target.device.name} owns ${nextHop} but ip routing is off, so it does not route to ${dstIp}.` : `${target.device.name} is not a router and does not own ${dstIp}.` });
      return fail('dropped', sw ? `${target.device.name} answered ARP for ${nextHop}, but it is a switch without ip routing, so it drops traffic for ${dstIp}.` : `${target.device.name} answered ARP for ${nextHop} but is not a router, so it drops traffic for ${dstIp}.`, sw ? `Enable ip routing on ${target.device.name} (layer 3 switch), or point the gateway at a router.` : 'Point the gateway at a router or firewall interface.');
    }
    // Inbound IOS ACL
    if (target.iface.aclIn) {
      const v = evaluateAcl(target.device, target.iface.aclIn, pdu);
      const line = v.entry && v.acl ? aclEntryText(v.acl, v.entry) : v.missing ? `ACL ${target.iface.aclIn} is not defined (permits everything)` : 'implicit deny any';
      const acl = { rule: v.entry?.seq ?? 0, action: v.action === 'permit' ? ('pass' as const) : ('block' as const), descr: `${target.iface.aclIn}: ${line}`, iface: `${target.iface.name} in`, implicit: v.implicit };
      if (v.action === 'deny') {
        push({ device: target.device.id, cableId: trace.cables.at(-1), inIface: target.iface.name, layer: 'L3', decision: 'block', acl, info: `ACL ${target.iface.aclIn} inbound on ${target.iface.name}: ${line} denies it.` });
        return fail('blocked', `Denied by access list ${target.iface.aclIn} inbound on ${target.device.name} ${target.iface.name}: ${line}.`, v.implicit ? `Every ACL ends with an implicit deny: add a permit for this traffic above it in ${target.iface.aclIn}.` : `Change or reorder ${target.iface.aclIn} if this traffic should pass.`);
      }
    }
    // Static NAT: traffic to an inside global address is translated to the inside local host.
    const snat = target.iface.nat === 'outside' ? target.device.staticNat?.find((n) => n.outside === curDst) : undefined;
    if (snat) {
      push({ device: target.device.id, cableId: trace.cables.at(-1), inIface: target.iface.name, layer: 'L3', decision: 'nat', info: `Static NAT on ${target.device.name}: inside global ${snat.outside} translated to inside local ${snat.inside}.` });
      trace.nat = { device: target.device.id, inside: snat.inside, outside: snat.outside, proto: req.proto };
      curDst = snat.inside;
      pdu.dstIp = snat.inside;
    }
    // Firewall / router ACL on the ingress interface
    const alias = target.iface.alias ?? target.iface.name;
    if (target.device.firewall.length || target.device.kind === 'firewall') {
      const v = evaluateFirewall(doc, target.device, alias, pdu);
      const acl = { rule: v.rule?.id ?? 0, action: v.action, descr: v.rule?.descr ?? 'Implicit default deny', iface: alias, implicit: v.implicit };
      if (v.action === 'block') {
        push({ device: target.device.id, cableId: trace.cables.at(-1), inIface: target.iface.name, layer: 'L3', decision: 'block', acl, info: `Firewall rules on ${alias}: ${v.rule ? `rule ${v.rule.id} "${v.rule.descr}" (block${v.rule.log ? ', logged' : ''})` : 'no rule matched, implicit default deny'}.` });
        return fail('blocked', `Blocked by ${target.device.name} on ${alias}: ${v.rule ? `rule ${v.rule.id} "${v.rule.descr}"` : 'no pass rule matched, so the implicit default deny applied'}.`, `If this traffic is legitimate, add a pass rule on ${alias} above rule ${v.rule?.id ?? 'the default deny'}.`);
      }
      push({ device: target.device.id, cableId: trace.cables.at(-1), inIface: target.iface.name, layer: 'L3', decision: 'route', acl, info: `Firewall rules on ${alias}: rule ${v.rule?.id} "${v.rule?.descr}" passes it. TTL ${pdu.ttl} → ${pdu.ttl - 1}.` });
    } else {
      push({ device: target.device.id, cableId: trace.cables.at(-1), inIface: target.iface.name, layer: 'L3', decision: 'route', info: `Received on ${target.iface.name}. TTL ${pdu.ttl} → ${pdu.ttl - 1}.` });
    }
    pdu.ttl -= 1;
    if (pdu.ttl <= 0) {
      push({ device: target.device.id, layer: 'L3', decision: 'drop', info: 'TTL expired in transit.' });
      return fail('dropped', `TTL expired at ${target.device.name}: the packet is looping.`, 'Look for a routing loop between the routers on the path.');
    }
  }
  return fail('dropped', 'Too many hops: the packet is looping between routers.', 'Look for a routing loop.');
}

/** Ping burst: four echo requests, like Windows ping. */
export function ping(doc: LabDoc, srcDevice: string, dst: string, count = 4): PacketTrace[] {
  const cp = controlPlane(doc);
  return Array.from({ length: count }, (_, index) => simulatePacket(doc, { srcDevice, dst, proto: 'icmp', index }, cp));
}

/** Traceroute: the layer-3 hops a packet takes, with the address of the interface that received it. */
export function traceroute(doc: LabDoc, srcDevice: string, dst: string): { hops: { n: number; ip: string; name: string; ms: number }[]; trace: PacketTrace } {
  const trace = simulatePacket(doc, { srcDevice, dst, proto: 'icmp' });
  const hops: { n: number; ip: string; name: string; ms: number }[] = [];
  for (const h of trace.hops) {
    if (h.decision !== 'route' && h.decision !== 'deliver' && h.decision !== 'block') continue;
    const d = deviceById(doc, h.device);
    const ip = d?.interfaces.find((i) => i.name === h.inIface)?.ip ?? '*';
    hops.push({ n: hops.length + 1, ip: h.decision === 'block' ? '*' : ip, name: d?.name ?? '?', ms: Math.max(0.1, Math.round(h.t * 2 * 10) / 10) });
    if (h.decision === 'block') break;
  }
  return { hops, trace };
}
