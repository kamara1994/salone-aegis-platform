// Packet simulator. Walks a packet through the designed lab the way the real devices would:
// source IP choice, ARP and default gateway, 802.1Q switching per VLAN, routing table lookup,
// first-match firewall rules, TTL, and the listening port at the destination. Every outcome
// carries the exact reason and the hop where it happened.
import { modelOf } from './catalog';
import { inCidr, ipToInt, isIp, isPrivate, maskOf, sameSubnet } from './net';
import { cableOnPort, cableStatus, deviceById, otherEnd } from './validate';
import type { Cable, Device, FirewallRule, Iface, LabDoc } from './types';

export type PacketStatus = 'delivered' | 'blocked' | 'dropped' | 'malformed' | 'delayed';
export type Proto = 'icmp' | 'tcp' | 'udp';

export interface PacketRequest {
  srcDevice: string;
  /** Destination IP address or device id */
  dst: string;
  proto: Proto;
  port?: number;
  /** 0-based index within a ping burst; the simulator uses it for intermittent faults */
  index?: number;
}

export interface Pdu {
  srcMac: string;
  dstMac: string;
  vlan?: number;
  srcIp: string;
  dstIp: string;
  ttl: number;
  proto: Proto;
  sport?: number;
  dport?: number;
  bytes: number;
}

export type HopDecision = 'send' | 'switch' | 'route' | 'deliver' | 'block' | 'drop' | 'malformed' | 'delay';

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
  at: string;
}

const SERVICE: Record<number, string> = { 22: 'SSH', 53: 'DNS', 80: 'HTTP', 88: 'Kerberos', 135: 'RPC', 389: 'LDAP', 443: 'HTTPS', 445: 'SMB', 554: 'RTSP', 636: 'LDAPS', 1883: 'MQTT', 3389: 'RDP', 5432: 'PostgreSQL', 1514: 'Wazuh agent' };
export const serviceName = (p?: number) => (p ? (SERVICE[p] ? `${SERVICE[p]} (${p})` : String(p)) : '');

let counter = 0;

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

function ifaceUp(d: Device, i: Iface): boolean {
  if (i.shutdown) return false;
  if (i.parent) return !d.interfaces.find((x) => x.name === i.parent)?.shutdown;
  return true;
}

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
  if (s.includes('/')) return inCidr(ip, s);
  return s === ip;
}

function matchPort(spec: string, port?: number) {
  if (spec === 'any' || port === undefined) return spec === 'any' || port === undefined;
  return spec.split(',').some((p) => {
    const [lo, hi] = p.split('-').map(Number);
    return hi ? port >= lo && port <= hi : port === lo;
  });
}

function matchProto(rule: FirewallRule['proto'], p: Proto) {
  return rule === 'any' || rule === p || (rule === 'tcp/udp' && (p === 'tcp' || p === 'udp'));
}

export function evaluateFirewall(doc: LabDoc, d: Device, inAlias: string, pdu: Pdu): { action: 'pass' | 'block'; rule?: FirewallRule; implicit: boolean } {
  for (const r of d.firewall) {
    if (!r.enabled) continue;
    if (r.iface !== 'any' && r.iface.toLowerCase() !== inAlias.toLowerCase()) continue;
    if (!matchProto(r.proto, pdu.proto)) continue;
    if (!matchAddr(r.src, pdu.srcIp, d, doc) || !matchAddr(r.dst, pdu.dstIp, d, doc)) continue;
    if (pdu.proto !== 'icmp' && !matchPort(r.port, pdu.dport)) continue;
    if (pdu.proto === 'icmp' && r.port !== 'any') continue;
    return { action: r.action, rule: r, implicit: false };
  }
  // OPNsense and Cisco ACLs both end with an implicit deny.
  return { action: d.firewall.length || d.kind === 'firewall' ? 'block' : 'pass', implicit: true };
}

// ---------------- layer 2 ----------------

interface L2Step {
  cable: Cable;
  device: Device;
  inPort: string;
  outPort?: string;
  vlan?: number;
  tagged: boolean;
}

interface L2Result {
  ok: boolean;
  steps: L2Step[];
  target?: { device: Device; iface: Iface };
  reason?: string;
  fix?: string;
  degraded: { cable: Cable; message: string; crc: boolean }[];
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

const isSvi = (d: Device, i: Iface) => modelOf(d).forwarding === 'l2' && /^vlan\d+$/i.test(i.name);

/** Finds the interface that answers ARP for `nextHop`, starting from `egress` on `from`. */
function l2Deliver(doc: LabDoc, from: Device, egress: Iface, nextHop: string): L2Result {
  const res: L2Result = { ok: false, steps: [], degraded: [] };
  const blockers: { reason: string; fix?: string }[] = [];
  const reachedVlans = new Set<number>();
  type State = { device: Device; port: Iface; tag?: number; trail: L2Step[] };
  const queue: State[] = [];
  const seen = new Set<string>();

  /** A switch floods the frame out of every port that carries `vlan`. Returns an SVI that owns the next hop, if any. */
  const flood = (sw: Device, vlan: number, except: string | undefined, trail: L2Step[], cable?: Cable): Iface | undefined => {
    const isAp = sw.kind === 'ap';
    const svi = sw.interfaces.find((i) => isSvi(sw, i) && i.vlan === vlan && i.ip === nextHop && !i.shutdown);
    if (svi) return svi;
    for (const out of sw.interfaces) {
      if (out.name === except || out.type === 'console' || out.parent || isSvi(sw, out)) continue;
      if (!cableOnPort(doc, sw.id, out.name)) continue;
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
      const step: L2Step | undefined = cable && except ? { cable, device: sw, inPort: except, outPort: out.name, vlan, tagged: tag !== undefined } : undefined;
      queue.push({ device: sw, port: out, tag, trail: step ? [...trail, step] : trail });
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
    const cable = cableOnPort(doc, s.device.id, s.port.name);
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
      blockers.push({ reason: `${peer.name} is powered off`, fix: `Power on ${peer.name}.` });
      continue;
    }
    if (modelOf(peer).forwarding === 'l2') {
      const isAp = peer.kind === 'ap';
      const acc = isAp ? { vlan: s.tag ?? 1 } : vlanAccepts(peerPort, s.tag);
      if (acc.drop) {
        blockers.push({ reason: `${peer.name}: ${acc.drop}`, fix: 'Make the port modes and VLANs agree on both ends.' });
        continue;
      }
      const vlan = acc.vlan!;
      if (!isAp && vlan !== 1 && !peer.vlans[vlan]) {
        blockers.push({ reason: `${peer.name} has no VLAN ${vlan} in its VLAN database, so ${peerPort.name} drops the frame`, fix: `Create VLAN ${vlan} on ${peer.name}.` });
        continue;
      }
      reachedVlans.add(vlan);
      const key = `${peer.id}:${vlan}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const svi = flood(peer, vlan, peerPort.name, s.trail, cable);
      if (svi) {
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
      if (br && br.ip === nextHop && !br.shutdown) {
        res.ok = true;
        res.steps = trail;
        res.target = { device: peer, iface: br };
        return res;
      }
      const key = `${peer.id}:bridge:${peerPort.bridge}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (const m of peer.interfaces.filter((i) => i.bridge === peerPort.bridge && i.name !== peerPort.name && !i.shutdown)) {
        queue.push({ device: peer, port: m, trail: [...s.trail, { cable, device: peer, inPort: peerPort.name, outPort: m.name, tagged: false }] });
      }
      continue;
    }
    const candidates = peer.interfaces.filter((i) => (s.tag === undefined ? i.name === peerPort.name : i.parent === peerPort.name && i.vlan === s.tag) && ifaceUp(peer, i));
    const owner = candidates.find((i) => i.ip === nextHop) ?? (peer.kind === 'cloud' ? peer.interfaces.find((i) => i.ip === nextHop && !i.shutdown) : undefined);
    if (owner) {
      res.ok = true;
      res.steps = trail;
      res.target = { device: peer, iface: owner };
      return res;
    }
  }
  // Explain the failure as precisely as possible.
  const owner = ownerOfIp(doc, nextHop);
  if (blockers.length) {
    res.reason = `ARP for ${nextHop} got no reply: ${blockers[0].reason}.`;
    res.fix = blockers[0].fix;
  } else if (!owner) {
    res.reason = `ARP for ${nextHop} got no reply: no device in this lab owns ${nextHop}.`;
    res.fix = 'Check the destination or the default gateway address.';
  } else {
    const ov = vlanOfIface(doc, owner.device, owner.iface);
    if (ov !== undefined && reachedVlans.size && !reachedVlans.has(ov)) {
      res.reason = `ARP for ${nextHop} got no reply: the frame is in VLAN ${[...reachedVlans].join(', ')} but ${owner.device.name} (${nextHop}) is in VLAN ${ov}.`;
      res.fix = `Put the access port in VLAN ${ov}, or trunk VLAN ${ov} to where the frame enters.`;
    } else {
      res.reason = `ARP for ${nextHop} got no reply: ${owner.device.name} is not reachable at layer 2 from ${from.name} ${egress.name}.`;
      res.fix = 'Check cabling, port VLANs and trunks between them.';
    }
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
}

export function routeLookup(d: Device, dst: string): RouteHit | { error: string } {
  const candidates: { prefix: number; egress: Iface; nextHop: string; text: string }[] = [];
  for (const i of l3Ifaces(d)) {
    if (!ifaceUp(d, i)) continue;
    if (sameSubnet(i.ip!, dst, i.prefix!)) candidates.push({ prefix: i.prefix!, egress: i, nextHop: dst, text: `connected ${netStr(i.ip!, i.prefix!)} via ${i.name}` });
  }
  for (const r of d.routes) {
    if (r.kind === 'connected') continue;
    const [net, p] = r.prefix.split('/');
    const prefix = Number(p);
    const n = ipToInt(net);
    const x = ipToInt(dst);
    if (n === null || x === null || ((x & maskOf(prefix)) >>> 0) !== ((n & maskOf(prefix)) >>> 0)) continue;
    let egress = r.iface ? d.interfaces.find((i) => i.name === r.iface) : undefined;
    if (!egress && r.via) egress = l3Ifaces(d).find((i) => sameSubnet(i.ip!, r.via!, i.prefix!));
    if (!egress || !ifaceUp(d, egress)) continue;
    candidates.push({ prefix, egress, nextHop: r.via ?? dst, text: `${r.kind} ${r.prefix}${r.via ? ` via ${r.via}` : ''} (${egress.name})` });
  }
  if (!candidates.length) return { error: `${d.name} has no route to ${dst}` };
  candidates.sort((a, b) => b.prefix - a.prefix);
  return candidates[0];
}

function netStr(ip: string, prefix: number) {
  const n = ipToInt(ip)!;
  const m = maskOf(prefix);
  const base = (n & m) >>> 0;
  return `${[(base >>> 24) & 255, (base >>> 16) & 255, (base >>> 8) & 255, base & 255].join('.')}/${prefix}`;
}

function linkLatency(c: Cable): number {
  if (c.wan?.latencyMs) return c.wan.latencyMs;
  if (c.type === 'wan') return 18;
  if (c.type === 'virtual') return 4;
  if (c.type === 'serial') return 8;
  return 0.3;
}

export function simulatePacket(doc: LabDoc, req: PacketRequest): PacketTrace {
  const src = deviceById(doc, req.srcDevice);
  const dstDevice = isIp(req.dst) ? ownerOfIp(doc, req.dst)?.device : deviceById(doc, req.dst);
  const dstIp = isIp(req.dst) ? req.dst : primaryIp(dstDevice);
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
  if (src.power === 'stopped') return fail('dropped', `${src.name} is powered off, so it cannot send anything.`, `Power on ${src.name}.`);
  if (!dstIp) return fail('dropped', `${dstDevice?.name ?? req.dst} has no IP address to send to.`, 'Give the destination an IP address, or pick another destination.');

  const up = l3Ifaces(src).filter((i) => ifaceUp(src, i));
  if (!up.length) return fail('dropped', `${src.name} has no IP address on an interface that is up.`, 'Assign an address (or let DHCP give one) and bring the interface up.');
  const srcIf = up.find((i) => sameSubnet(i.ip!, dstIp, i.prefix!)) ?? up.find((i) => i.gateway) ?? up[0];
  if (srcIf.ip!.startsWith('169.254')) return fail('dropped', `${src.name} only has a self-assigned address (${srcIf.ip}): DHCP got no answer, so it has no gateway and cannot reach ${dstIp}.`, 'Fix DHCP reachability (usually the switch port VLAN), then renew the lease.');

  const sport = 49152 + ((ipToInt(dstIp) ?? 0) % 10000) + (req.index ?? 0);
  const pdu: Pdu = { srcMac: srcIf.mac, dstMac: 'ff:ff:ff:ff:ff:ff', srcIp: srcIf.ip!, dstIp, ttl: src.os === 'windows' ? 128 : 64, proto: req.proto, sport: req.proto === 'icmp' ? undefined : sport, dport: req.proto === 'icmp' ? undefined : req.port, bytes: req.proto === 'icmp' ? 74 : 66 };
  let t = 0;
  let seq = 0;
  const push = (h: Omit<Hop, 'seq' | 't' | 'pdu' | 'deviceName'> & { device: string }, dt = 0.05) => {
    t += dt;
    trace.hops.push({ ...h, seq: ++seq, t: Math.round(t * 100) / 100, deviceName: deviceById(doc, h.device)?.name ?? '?', pdu: { ...pdu } });
  };
  const what = req.proto === 'icmp' ? `ICMP echo request to ${dstIp}` : `${req.proto.toUpperCase()} ${req.proto === 'tcp' ? 'SYN' : 'datagram'} to ${dstIp}:${serviceName(req.port)}`;
  push({ device: src.id, outIface: srcIf.name, layer: 'L3', decision: 'send', info: `${src.name} builds ${what} from ${srcIf.ip} (${srcIf.name}).` }, 0);

  let cur: Device = src;
  let delayed: string | undefined;
  let extraLatency = 0;
  for (let l3hop = 0; l3hop < 16; l3hop++) {
    // ---- choose egress and next hop ----
    let egress: Iface;
    let nextHop: string;
    let routeText: string;
    if (cur.id === src.id && modelOf(src).forwarding === 'host') {
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
        routeText = `default route via ${srcIf.gateway}`;
      }
    } else {
      const hit = routeLookup(cur, dstIp);
      if ('error' in hit) {
        push({ device: cur.id, layer: 'L3', decision: 'drop', info: `${hit.error}. Packet discarded.` });
        return fail('dropped', `${hit.error}: the routing table has no matching or default route.`, `Add a route on ${cur.name} for ${dstIp}, or a default route.`);
      }
      egress = hit.egress;
      nextHop = hit.nextHop;
      routeText = hit.text;
    }
    pdu.vlan = egress.parent ? egress.vlan : undefined;
    pdu.srcMac = egress.mac || pdu.srcMac;

    // ---- layer 2 ----
    const l2 = l2Deliver(doc, cur, egress, nextHop);
    if (!l2.ok) {
      push({ device: cur.id, outIface: egress.name, layer: 'L2', decision: 'drop', info: l2.reason ?? 'ARP failed.', route: routeText });
      return fail('dropped', l2.reason ?? 'ARP failed.', l2.fix);
    }
    pdu.dstMac = l2.target!.iface.mac;
    if (cur.id !== src.id) trace.hops[trace.hops.length - 1].route = routeText;
    else trace.hops[0].route = routeText;
    for (const step of l2.steps) {
      trace.cables.push(step.cable.id);
      trace.path.push(step.device.id);
      t += linkLatency(step.cable);
      const deg = l2.degraded.find((d) => d.cable.id === step.cable.id);
      if (deg && (req.index ?? 0) % 4 === 2) {
        push({ device: step.device.id, cableId: step.cable.id, inIface: step.inPort, layer: 'L1', decision: 'malformed', info: `Frame arrived with a bad FCS (CRC error) on ${step.inPort} and was discarded. ${deg.message}` });
        return fail('malformed', `The frame was corrupted on the link into ${step.device.name} ${step.inPort} (CRC error) and discarded. ${deg.message}`, 'Fix speed and duplex on both ends of that link.');
      }
      if (deg) {
        extraLatency += 120;
        delayed = `Delivered late: the link into ${step.device.name} ${step.inPort} is retransmitting after collisions. ${deg.message}`;
      }
      if (step.outPort) {
        pdu.vlan = step.tagged ? step.vlan : undefined;
        push({ device: step.device.id, cableId: step.cable.id, inIface: step.inPort, outIface: step.outPort, layer: 'L2', decision: deg ? 'delay' : 'switch', info: `VLAN ${step.vlan}: ${pdu.dstMac ? `MAC ${pdu.dstMac} found` : 'flooded'}, in ${step.inPort}, out ${step.outPort}${step.tagged ? ` tagged 802.1Q ${step.vlan}` : ' untagged'}.` });
      } else {
        // arrival at the L3 target
      }
    }
    const target = l2.target!;
    cur = target.device;

    // ---- arrived at a layer 3 device ----
    if (target.device.interfaces.some((i) => i.ip === dstIp)) {
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
      trace.status = 'delivered';
      trace.reason = req.proto === 'icmp' ? `Reply from ${dstIp}: time ${trace.latencyMs} ms, TTL ${pdu.ttl}.` : `${target.device.name} accepted the connection on ${serviceName(svc!)} (round trip ${trace.latencyMs} ms).`;
      return trace;
    }
    if (modelOf(target.device).forwarding !== 'l3') {
      push({ device: target.device.id, cableId: trace.cables.at(-1), inIface: target.iface.name, layer: 'L3', decision: 'drop', info: `${target.device.name} is not a router and does not own ${dstIp}.` });
      return fail('dropped', `${target.device.name} answered ARP for ${nextHop} but is not a router, so it drops traffic for ${dstIp}.`, 'Point the gateway at a router or firewall interface.');
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
  return Array.from({ length: count }, (_, index) => simulatePacket(doc, { srcDevice, dst, proto: 'icmp', index }));
}
