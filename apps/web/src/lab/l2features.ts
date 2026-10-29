// Switch features that change port state on their own, the way a real switch does after a change:
// DTP trunk negotiation, VTP VLAN database sync (including the "VTP bomb"), port security with
// sticky learning and violations, and BPDU guard. The store runs these after every commit.
import { modelOf } from './catalog';
import type { Device, Iface, LabDoc } from './types';
import { cableOnPort, cablesOnPort, deviceById, otherEnd } from './validate';

const isSwitch = (d?: Device) => d?.kind === 'switch';
const linkLive = (doc: LabDoc, d: Device, i: Iface) => {
  const c = cableOnPort(doc, d.id, i.name);
  if (!c || c.disabled || i.shutdown || d.power === 'stopped') return null;
  const far = otherEnd(c, d.id, i.name);
  const peer = deviceById(doc, far.device);
  const pp = peer?.interfaces.find((x) => x.name === far.port);
  if (!peer || !pp || peer.power === 'stopped' || pp.shutdown) return null;
  return { cable: c, peer, pp };
};

// ---------------- DTP ----------------

/** Negotiated mode of a dynamic port (Cisco DTP truth table). */
export function dtpResult(me: Iface, peer: Device | undefined, pp: Iface | undefined): 'trunk' | 'access' {
  if (!me.dtp || me.nonegotiate) return me.mode === 'trunk' ? 'trunk' : 'access';
  if (!peer || !pp || !isSwitch(peer)) return 'access';
  if (pp.mode === 'routed') return 'access';
  if (pp.dtp) {
    if (pp.nonegotiate) return 'access';
    return me.dtp === 'desirable' || pp.dtp === 'desirable' ? 'trunk' : 'access';
  }
  if (pp.mode === 'trunk') return pp.nonegotiate ? 'access' : 'trunk';
  return 'access';
}

export function applyDtp(doc: LabDoc) {
  for (const d of doc.devices.filter(isSwitch))
    for (const i of d.interfaces.filter((x) => x.dtp)) {
      const live = linkLive(doc, d, i);
      const mode = dtpResult(i, live?.peer, live?.pp);
      if (mode === 'trunk' && i.mode !== 'trunk') Object.assign(i, { mode: 'trunk', allowedVlans: i.allowedVlans ?? 'all', nativeVlan: i.nativeVlan ?? 1 });
      else if (mode === 'access' && i.mode !== 'access') Object.assign(i, { mode: 'access', vlan: i.vlan ?? 1 });
    }
}

// ---------------- VTP ----------------

const vtpOn = (d: Device) => isSwitch(d) && d.vtp && d.vtp.mode !== 'off';
const sameVlans = (a: Record<number, string>, b: Record<number, string>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

/**
 * Servers bump their revision when their VLAN database changes. Over working trunks, every server and
 * client in the same domain (and password) adopts the database with the highest revision; transparent
 * switches relay adverts but keep their own VLANs. A switch with no domain joins the first domain it hears.
 */
export function applyVtp(prev: LabDoc | null, doc: LabDoc): { device: string; text: string }[] {
  const log: { device: string; text: string }[] = [];
  for (const d of doc.devices.filter(vtpOn)) {
    const old = prev?.devices.find((x) => x.id === d.id);
    if (d.vtp!.mode === 'server' && old && !sameVlans(old.vlans, d.vlans) && old.vtp?.revision === d.vtp!.revision) d.vtp!.revision += 1;
  }
  // Trunk adjacency between VTP-speaking switches
  const adj = new Map<string, string[]>();
  for (const d of doc.devices.filter(vtpOn))
    for (const i of d.interfaces.filter((x) => x.mode === 'trunk')) {
      const live = linkLive(doc, d, i);
      if (!live || !vtpOn(live.peer) || live.pp.mode !== 'trunk') continue;
      adj.set(d.id, [...new Set([...(adj.get(d.id) ?? []), live.peer.id])]);
    }
  // Null-domain switches learn the domain from a neighbour (repeat until stable).
  for (let k = 0; k < 4; k++)
    for (const d of doc.devices.filter((x) => vtpOn(x) && !x.vtp!.domain)) {
      const n = (adj.get(d.id) ?? []).map((id) => deviceById(doc, id)!).find((p) => p.vtp?.domain);
      if (n) {
        d.vtp!.domain = n.vtp!.domain;
        log.push({ device: d.id, text: `%SW_VLAN-6-VTP_DOMAIN_NAME_CHG: VTP domain name changed to ${n.vtp!.domain} (learned from ${n.name})` });
      }
    }
  const seen = new Set<string>();
  for (const start of doc.devices.filter(vtpOn)) {
    if (seen.has(start.id) || !start.vtp!.domain) continue;
    const comp: Device[] = [];
    const stack = [start.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      const d = deviceById(doc, id)!;
      if (d.vtp!.domain !== start.vtp!.domain || (d.vtp!.password ?? '') !== (start.vtp!.password ?? '')) continue;
      seen.add(id);
      comp.push(d);
      stack.push(...(adj.get(id) ?? []));
    }
    const voters = comp.filter((d) => d.vtp!.mode === 'server' || d.vtp!.mode === 'client');
    if (voters.length < 2) continue;
    const best = voters.reduce((m, d) => (d.vtp!.revision > m.vtp!.revision ? d : m), voters[0]);
    for (const d of voters) {
      if (d === best || (d.vtp!.revision === best.vtp!.revision && sameVlans(d.vlans, best.vlans))) continue;
      const lost = Object.keys(d.vlans).filter((v) => !best.vlans[Number(v)]);
      d.vlans = { ...best.vlans };
      d.vtp!.revision = best.vtp!.revision;
      log.push({ device: d.id, text: `%SW_VLAN-4-VTP_DB_SYNC: VLAN database replaced from ${best.name} (domain ${best.vtp!.domain}, revision ${best.vtp!.revision})${lost.length ? `; VLANs removed: ${lost.join(', ')}` : ''}` });
    }
  }
  return log;
}

// ---------------- port security ----------------

/** MAC addresses of end hosts on the far side of a switch port (direct host, AP clients, hosts behind a hub or switch). */
export function macsBehind(doc: LabDoc, sw: Device, port: Iface): { mac: string; owner: string }[] {
  const live = linkLive(doc, sw, port);
  if (!live) return [];
  const out: { mac: string; owner: string }[] = [];
  const seen = new Set<string>([sw.id]);
  const queue: Device[] = [live.peer];
  while (queue.length) {
    const d = queue.shift()!;
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    if (d.power === 'stopped') continue;
    const fw = modelOf(d).forwarding;
    if (fw !== 'l2' || d.kind === 'ap') {
      const nic = d.interfaces.find((i) => i.mac && (i.type === 'copper' || i.type === 'wireless' || i.type === 'virtual' || i.type === 'sfp'));
      if (nic) out.push({ mac: nic.mac.toLowerCase(), owner: d.name });
    }
    if (fw === 'l2') {
      for (const i of d.interfaces) {
        const cs = i.type === 'wireless' ? cablesOnPort(doc, d.id, i.name) : [cableOnPort(doc, d.id, i.name)].filter((c): c is NonNullable<typeof c> => !!c);
        for (const c of cs) {
          if (c.disabled) continue;
          const far = otherEnd(c, d.id, i.name);
          if (!seen.has(far.device)) queue.push(deviceById(doc, far.device)!);
        }
      }
    }
  }
  return out;
}

export interface PortSecState {
  allowed: Set<string>;
  seen: { mac: string; owner: string }[];
  offenders: { mac: string; owner: string }[];
}

export function portSecurityState(doc: LabDoc, sw: Device, port: Iface): PortSecState | null {
  const ps = port.portSecurity;
  if (!ps?.enabled) return null;
  const seen = macsBehind(doc, sw, port);
  const allowed = new Set(ps.macs.map((m) => m.toLowerCase()));
  for (const s of seen) if (allowed.size < ps.max && !allowed.has(s.mac)) allowed.add(s.mac); // dynamically learned
  return { allowed, seen, offenders: seen.filter((s) => !allowed.has(s.mac)) };
}

/** Sticky learning, then violations: shutdown mode err-disables the port. */
export function applyPortSecurity(doc: LabDoc): { device: string; text: string }[] {
  const log: { device: string; text: string }[] = [];
  for (const d of doc.devices.filter(isSwitch))
    for (const i of d.interfaces) {
      const ps = i.portSecurity;
      if (!ps?.enabled || i.shutdown || i.errDisabled) continue;
      if (ps.sticky) {
        for (const s of macsBehind(doc, d, i)) {
          if (ps.macs.length >= ps.max || ps.macs.includes(s.mac)) continue;
          ps.macs = [...ps.macs, s.mac];
          log.push({ device: d.id, text: `%PORT_SECURITY-6-ADDR_STICKY: ${i.name} learned sticky MAC ${s.mac} (${s.owner})` });
        }
      }
      const st = portSecurityState(doc, d, i);
      if (!st?.offenders.length) continue;
      const o = st.offenders[0];
      if (ps.violation === 'shutdown') {
        i.errDisabled = `port-security violation: MAC ${o.mac} (${o.owner}) is not a secure address; maximum ${ps.max}`;
        log.push({ device: d.id, text: `%PM-4-ERR_DISABLE: psecure-violation error detected on ${i.name}, putting ${i.name} in err-disable state` });
        log.push({ device: d.id, text: `%PORT_SECURITY-2-PSECURE_VIOLATION: Security violation occurred, caused by MAC address ${o.mac} on port ${i.name}.` });
      } else if (ps.violation === 'restrict') {
        log.push({ device: d.id, text: `%PORT_SECURITY-2-PSECURE_VIOLATION: Security violation occurred, caused by MAC address ${o.mac} on port ${i.name}. (restrict: frames dropped, counter incremented)` });
      }
    }
  return log;
}

// ---------------- BPDU guard ----------------

export const bpduGuardOn = (sw: Device, i: Iface) => i.bpduGuard ?? (!!i.portfast && !!sw.stp?.bpduGuardDefault);

export function applyBpduGuard(doc: LabDoc): { device: string; text: string }[] {
  const log: { device: string; text: string }[] = [];
  for (const d of doc.devices.filter(isSwitch))
    for (const i of d.interfaces) {
      if (!bpduGuardOn(d, i) || i.shutdown || i.errDisabled) continue;
      const live = linkLive(doc, d, i);
      if (!live || !isSwitch(live.peer) || live.peer.stp?.enabled === false) continue;
      i.errDisabled = `BPDU guard: a BPDU arrived from ${live.peer.name} ${live.pp.name}; a switch was plugged into an edge port`;
      log.push({ device: d.id, text: `%SPANTREE-2-BLOCK_BPDUGUARD: Received BPDU on port ${i.name} with BPDU Guard enabled. Disabling port.` });
      log.push({ device: d.id, text: `%PM-4-ERR_DISABLE: bpduguard error detected on ${i.name}, putting ${i.name} in err-disable state` });
    }
  return log;
}

/** Everything that runs after a change, in the order a switch would apply it. */
export function applySwitchFeatures(prev: LabDoc | null, doc: LabDoc): { device: string; text: string }[] {
  applyDtp(doc);
  return [...applyVtp(prev, doc), ...applyBpduGuard(doc), ...applyPortSecurity(doc)];
}
