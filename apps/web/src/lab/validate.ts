// Cabling rules. Physical problems (wrong port family, occupied port, wrong cable) block the
// connection. Configuration problems (speed, duplex, VLAN, shutdown) let the cable exist but
// keep the link down or degraded, the way a real switch would.
import { modelOf } from './catalog';
import type { Cable, CableEnd, CableIssue, CableStatus, CableType, Device, Iface, LabDoc } from './types';

export const CABLE_LABEL: Record<CableType, string> = {
  straight: 'Ethernet straight-through',
  crossover: 'Ethernet crossover',
  fiber: 'Fibre',
  serial: 'Serial DCE/DTE',
  console: 'Console (rollover)',
  trunk: 'Trunk (802.1Q)',
  access: 'Access',
  wan: 'WAN circuit',
  virtual: 'Virtual link',
};

export const CABLE_TYPES = Object.keys(CABLE_LABEL) as CableType[];

const COPPER_FAMILY: CableType[] = ['straight', 'crossover', 'access', 'trunk'];
const ENDPOINT_KINDS = new Set<Device['kind']>(['pc', 'laptop', 'iot']);
/** Classic MDI (host-like) vs MDI-X (switch-like) sides for straight vs crossover. */
const MDIX_SIDE = (d: Device) => (d.kind === 'switch' || d.kind === 'ap' ? 'x' : 'mdi');

export function deviceById(doc: LabDoc, id: string) {
  return doc.devices.find((d) => d.id === id);
}

export function ifaceOf(doc: LabDoc, end: CableEnd): { device?: Device; iface?: Iface } {
  const device = deviceById(doc, end.device);
  return { device, iface: device?.interfaces.find((i) => i.name === end.port) };
}

export function cableOnPort(doc: LabDoc, deviceId: string, port: string, ignoreId?: string): Cable | undefined {
  return doc.cables.find((c) => c.id !== ignoreId && ((c.a.device === deviceId && c.a.port === port) || (c.b.device === deviceId && c.b.port === port)));
}

export function otherEnd(c: Cable, deviceId: string, port?: string): CableEnd {
  return c.a.device === deviceId && (port === undefined || c.a.port === port) ? c.b : c.a;
}

const err = (code: CableIssue['code'], message: string, fix?: string): CableIssue => ({ code, severity: 'error', message, fix });

function portFamilyOk(type: CableType, a: Iface, b: Iface, da: Device, db: Device): CableIssue | null {
  const label = CABLE_LABEL[type];
  const isCopperish = (i: Iface) => i.type === 'copper' || i.type === 'virtual';
  switch (type) {
    case 'straight':
    case 'crossover':
    case 'access':
    case 'trunk':
      for (const [d, i] of [[da, a], [db, b]] as const) {
        if (!isCopperish(i))
          return err('incompatible_port', `${label} cables need RJ-45 copper ports. ${d.name} ${i.name} is a ${portTypeName(i.type)} port.`, i.type === 'sfp' ? 'Use a fibre cable between two SFP ports.' : i.type === 'serial' ? 'Use a serial cable between two serial ports.' : i.type === 'console' || i.type === 'terminal' ? 'Use a console cable from the console port to a PC RS-232/USB port.' : 'Pick a copper port.');
      }
      return null;
    case 'fiber':
      for (const [d, i] of [[da, a], [db, b]] as const) if (i.type !== 'sfp') return err('incompatible_port', `Fibre needs an SFP/SFP+ port on both ends. ${d.name} ${i.name} is a ${portTypeName(i.type)} port.`, 'Pick an SFP port (Gi0/25-28, Te1/1/x, ix0, ens3f0).');
      return null;
    case 'serial':
      for (const [d, i] of [[da, a], [db, b]] as const) if (i.type !== 'serial') return err('incompatible_port', `Serial cables connect two serial (WIC/NIM) ports. ${d.name} ${i.name} is a ${portTypeName(i.type)} port.`, 'Routers with a NIM-2T have Se0/1/0 and Se0/1/1.');
      return null;
    case 'console': {
      const kinds = [a.type, b.type].sort().join('+');
      if (kinds !== 'console+terminal') return err('console_misuse', 'A console (rollover) cable goes from a device console port to a PC or laptop RS-232/USB port. It never carries network traffic.', 'Connect Console on the router or switch to RS232 on a PC or USB-Console on a laptop.');
      return null;
    }
    case 'wan':
      for (const [d, i] of [[da, a], [db, b]] as const) {
        if (!['router', 'firewall', 'cloud'].includes(d.kind)) return err('incompatible_port', `WAN circuits terminate on routers, firewalls or provider clouds. ${d.name} is a ${d.kind}.`, 'Connect the site router or firewall to the provider.');
        if (i.type === 'console' || i.type === 'terminal' || i.type === 'wireless') return err('incompatible_port', `${d.name} ${i.name} cannot terminate a WAN circuit.`);
      }
      return null;
    case 'virtual': {
      const ok = (d: Device, i: Iface) => i.type === 'virtual' || i.type === 'wireless' || d.kind === 'cloud' || d.kind === 'vm';
      for (const [d, i] of [[da, a], [db, b]] as const) if (!ok(d, i)) return err('incompatible_port', `Virtual links join vNICs, tunnels, wireless radios or cloud attachments. ${d.name} ${i.name} is a physical ${portTypeName(i.type)} port.`, 'Use a copper or fibre cable for physical ports.');
      if (a.type === 'wireless' || b.type === 'wireless') {
        const radio = [da, db].some((d) => d.kind === 'ap');
        if (!radio) return err('incompatible_port', 'Wireless clients associate with an access point radio.', 'Connect Wi-Fi to radio0 on an access point.');
      }
      return null;
    }
  }
}

export function portTypeName(t: Iface['type']) {
  return { copper: 'copper RJ-45', sfp: 'SFP fibre', serial: 'serial', console: 'console', terminal: 'RS-232/USB terminal', wireless: 'wireless', virtual: 'virtual' }[t];
}

/** Checks whether a cable may be connected at all. Returns blocking errors plus informational notes. */
export function checkConnection(doc: LabDoc, a: CableEnd, b: CableEnd, type: CableType, ignoreCableId?: string): CableIssue[] {
  const A = ifaceOf(doc, a);
  const B = ifaceOf(doc, b);
  const out: CableIssue[] = [];
  if (!A.device || !B.device) return [err('port_missing', 'Pick a device on both ends.')];
  if (!A.iface) return [err('port_missing', `${A.device.name} has no port named ${a.port}.`)];
  if (!B.iface) return [err('port_missing', `${B.device.name} has no port named ${b.port}.`)];
  if (A.device.id === B.device.id) return [err('same_device', `Both ends are on ${A.device.name}. A cable must join two different devices.`)];
  for (const [d, end] of [[A.device, a], [B.device, b]] as const) {
    const used = cableOnPort(doc, end.device, end.port, ignoreCableId);
    if (used) {
      const peer = otherEnd(used, end.device, end.port);
      out.push(err('occupied', `${d.name} ${end.port} is already connected to ${deviceById(doc, peer.device)?.name ?? 'another device'} ${peer.port}.`, 'Pick a free port or remove the existing cable first.'));
    }
  }
  const fam = portFamilyOk(type, A.iface, B.iface, A.device, B.device);
  if (fam) out.push(fam);
  if (out.length) return out;

  if (type === 'trunk') {
    for (const d of [A.device, B.device]) if (ENDPOINT_KINDS.has(d.kind)) out.push(err('trunk_endpoint', `${d.name} is an end device and cannot terminate an 802.1Q trunk.`, 'Use an access cable, or trunk between switches, routers and firewalls.'));
  }
  if (type === 'access' && A.device.kind !== 'switch' && B.device.kind !== 'switch') {
    out.push(err('wrong_cable', 'An access cable puts a device on a switch access port, so one end must be a switch.', 'Use a straight-through cable, or connect one end to a switch.'));
  }
  if ((type === 'straight' || type === 'crossover') && A.iface.type === 'copper' && B.iface.type === 'copper') {
    const like = MDIX_SIDE(A.device) === MDIX_SIDE(B.device);
    const needs: CableType = like ? 'crossover' : 'straight';
    if (needs !== type) {
      const mdix = modelOf(A.device).autoMdix || modelOf(B.device).autoMdix;
      if (!mdix)
        out.push(err('wrong_cable', `${A.device.name} and ${B.device.name} are ${like ? 'the same class of device' : 'different classes of device'}, so they need a ${CABLE_LABEL[needs].toLowerCase()} cable. Neither ${modelOf(A.device).name} nor ${modelOf(B.device).name} supports auto-MDIX.`, `Replace it with a ${CABLE_LABEL[needs].toLowerCase()} cable.`));
      else out.push({ code: 'mdix_corrected', severity: 'info', message: `A ${CABLE_LABEL[needs].toLowerCase()} cable is the textbook choice here; auto-MDIX swaps the pairs so this one still works.` });
    }
  }
  return out;
}

function speedsOf(i: Iface) {
  return i.speed === 'auto' ? i.speeds : [i.speed];
}

function negotiate(a: Iface, b: Iface, da: Device, db: Device): { issues: CableIssue[]; text?: string } {
  if (['console', 'terminal'].includes(a.type)) return { issues: [], text: '9600 baud, 8N1' };
  if (a.type === 'serial') return { issues: [], text: 'Serial, clock rate set by the DCE end' };
  if (a.type === 'wireless' || b.type === 'wireless') return { issues: [], text: 'Associated (802.11ax)' };
  const issues: CableIssue[] = [];
  const common = speedsOf(a).filter((s) => speedsOf(b).includes(s));
  const autoA = a.speed === 'auto' && a.duplex === 'auto';
  const autoB = b.speed === 'auto' && b.duplex === 'auto';
  if (!common.length) {
    const sa = a.speed === 'auto' ? `auto (${a.speeds.join('/')})` : `${a.speed} Mb/s`;
    const sb = b.speed === 'auto' ? `auto (${b.speeds.join('/')})` : `${b.speed} Mb/s`;
    issues.push({ code: 'speed_mismatch', severity: 'down', message: `Speed mismatch: ${da.name} ${a.name} is ${sa}, ${db.name} ${b.name} is ${sb}. No link comes up.`, fix: `Set both ends to the same speed, or set both to auto.` });
    return { issues };
  }
  const speed = Math.max(...common);
  // When either side does not autonegotiate, the other side falls back to parallel detection:
  // it learns the speed but must assume half duplex (IEEE 802.3 clause 28).
  const both = autoA && autoB;
  const dA: 'full' | 'half' = a.duplex !== 'auto' ? a.duplex : both ? 'full' : 'half';
  const dB: 'full' | 'half' = b.duplex !== 'auto' ? b.duplex : both ? 'full' : 'half';
  if (dA !== dB) {
    const full = dA === 'full' ? `${da.name} ${a.name}` : `${db.name} ${b.name}`;
    const half = dA === 'half' ? `${da.name} ${a.name}` : `${db.name} ${b.name}`;
    issues.push({ code: 'duplex_mismatch', severity: 'degraded', message: `Duplex mismatch: ${full} runs full duplex, ${half} fell back to half. Expect late collisions, CRC errors and slow transfers.`, fix: 'Set both ends to auto/auto, or hard-set both to the same speed and duplex.' });
  } else if (dA === 'half') {
    issues.push({ code: 'duplex_mismatch', severity: 'info', message: `Both ends agree on half duplex at ${speed} Mb/s. It works, but collisions are possible and throughput is lower.` });
  }
  const counters = [a.counters, b.counters].filter(Boolean) as NonNullable<Iface['counters']>[];
  if (counters.some((c) => c.lateCollisions > 0) && !issues.some((i) => i.severity === 'degraded')) {
    issues.push({ code: 'duplex_mismatch', severity: 'degraded', message: `The lab reports late collisions and CRC errors on this link (${counters.map((c) => `${c.lateCollisions} late, ${c.crc} CRC`).join('; ')}). That is the signature of a duplex mismatch.`, fix: 'Check speed and duplex on both ends, then clear counters and watch them.' });
  }
  return { issues, text: `${speed >= 1000 ? `${speed / 1000} Gb/s` : `${speed} Mb/s`} ${dA === dB ? dA : `${dA}/${dB}`} duplex` };
}

function vlanName(doc: LabDoc, d: Device, v: number) {
  return d.vlans[v] ?? doc.vlans.find((x) => x.id === v)?.name ?? `VLAN ${v}`;
}

function vlanChecks(doc: LabDoc, A: Device, a: Iface, B: Device, b: Iface): CableIssue[] {
  const issues: CableIssue[] = [];
  const isSw = (d: Device) => d.kind === 'switch';
  const sides: [Device, Iface, Device, Iface][] = [
    [A, a, B, b],
    [B, b, A, a],
  ];
  if (isSw(A) && isSw(B)) {
    const ma = a.mode ?? 'access';
    const mb = b.mode ?? 'access';
    if (ma !== mb) issues.push({ code: 'trunk_mismatch', severity: 'degraded', message: `Mode mismatch: ${A.name} ${a.name} is ${ma}, ${B.name} ${b.name} is ${mb}. Only untagged traffic in one VLAN crosses this link.`, fix: 'Make both ends trunks (switchport mode trunk) or both access ports in the same VLAN.' });
    else if (ma === 'access' && (a.vlan ?? 1) !== (b.vlan ?? 1)) issues.push({ code: 'vlan_mismatch', severity: 'degraded', message: `Native VLAN mismatch: ${A.name} ${a.name} is in VLAN ${a.vlan ?? 1}, ${B.name} ${b.name} in VLAN ${b.vlan ?? 1}. CDP reports it and the two VLANs leak into each other.`, fix: 'Put both access ports in the same VLAN.' });
    else if (ma === 'trunk') {
      if ((a.nativeVlan ?? 1) !== (b.nativeVlan ?? 1)) issues.push({ code: 'native_vlan_mismatch', severity: 'degraded', message: `Native VLAN mismatch on the trunk: ${a.nativeVlan ?? 1} vs ${b.nativeVlan ?? 1}.`, fix: 'Set the same switchport trunk native vlan on both ends.' });
      const la = a.allowedVlans ?? 'all';
      const lb = b.allowedVlans ?? 'all';
      if (la !== 'all' && lb !== 'all' && !la.some((v) => lb.includes(v))) issues.push({ code: 'trunk_mismatch', severity: 'down', message: 'The two trunk ends allow no VLAN in common, so nothing is forwarded.', fix: 'Align switchport trunk allowed vlan on both ends.' });
    }
    return issues;
  }
  for (const [sw, sp, peer, pp] of sides) {
    if (!isSw(sw)) continue;
    const mode = sp.mode ?? 'access';
    if (mode === 'access') {
      const expected = pp.vlan;
      if (peer.kind === 'ap' || peer.kind === 'router' || peer.kind === 'firewall') {
        const subs = peer.interfaces.filter((i) => i.parent === pp.name);
        if (subs.length) issues.push({ code: 'trunk_mismatch', severity: 'degraded', message: `${peer.name} ${pp.name} carries tagged sub-interfaces (${subs.map((s) => s.name).join(', ')}) but ${sw.name} ${sp.name} is an access port. Only VLAN ${sp.vlan ?? 1} untagged gets through.`, fix: `Make ${sp.name} a trunk.` });
      } else if (expected !== undefined && expected !== (sp.vlan ?? 1)) {
        issues.push({ code: 'vlan_mismatch', severity: 'degraded', message: `${peer.name} belongs in VLAN ${expected} (${vlanName(doc, sw, expected)}) but ${sw.name} ${sp.name} is an access port in VLAN ${sp.vlan ?? 1} (${vlanName(doc, sw, sp.vlan ?? 1)}). It will get no address and reach nothing it needs.`, fix: `switchport access vlan ${expected} on ${sp.name}.` });
      }
      if (!(sp.vlan === undefined || sw.vlans[sp.vlan]) && sp.vlan !== 1) issues.push({ code: 'vlan_mismatch', severity: 'down', message: `VLAN ${sp.vlan} does not exist in ${sw.name}'s VLAN database, so ${sp.name} is inactive.`, fix: `Create VLAN ${sp.vlan} (vlan ${sp.vlan} / name ...).` });
    } else if (mode === 'trunk' && ENDPOINT_KINDS.has(peer.kind)) {
      issues.push({ code: 'trunk_mismatch', severity: 'degraded', message: `${sw.name} ${sp.name} is a trunk facing ${peer.name}, an end device. It only receives native VLAN ${sp.nativeVlan ?? 1} traffic.`, fix: `switchport mode access and switchport access vlan ${pp.vlan ?? 1}.` });
    }
  }
  return issues;
}

/** Full status of an existing cable: physical validity, power, admin state, negotiation and VLANs. */
export function cableStatus(doc: LabDoc, c: Cable): CableStatus {
  const A = ifaceOf(doc, c.a);
  const B = ifaceOf(doc, c.b);
  if (!A.device || !B.device || !A.iface || !B.iface) return { state: 'down', issues: [err('port_missing', 'One end of this cable points at a port that no longer exists.', 'Remove or reconnect the cable.')] };
  const issues = checkConnection(doc, c.a, c.b, c.type, c.id);
  if (c.disabled) return { state: 'disabled', issues: [{ code: 'disabled', severity: 'down', message: 'This cable is disabled (unplugged) in the designer.', fix: 'Enable it from the cable menu.' }, ...issues] };
  if (issues.some((i) => i.severity === 'error')) return { state: 'down', issues };
  for (const [d, i] of [[A.device, A.iface], [B.device, B.iface]] as const) {
    if (d.power === 'stopped') issues.push({ code: 'powered_off', severity: 'down', message: `${d.name} is powered off.`, fix: `Power on ${d.name}.` });
    if (i.shutdown) issues.push({ code: 'shutdown', severity: 'down', message: `${d.name} ${i.name} is administratively down (shutdown).`, fix: `no shutdown on ${i.name}.` });
  }
  const neg = negotiate(A.iface, B.iface, A.device, B.device);
  issues.push(...neg.issues);
  issues.push(...vlanChecks(doc, A.device, A.iface, B.device, B.iface));
  const state = issues.some((i) => i.severity === 'down') ? 'down' : issues.some((i) => i.severity === 'degraded') ? 'degraded' : 'up';
  return { state, issues, negotiated: state === 'down' ? undefined : neg.text };
}

/** Packet Tracer's "automatic connection": the cable type a network engineer would pick. */
export function suggestCableType(doc: LabDoc, a: CableEnd, b: CableEnd): CableType {
  const A = ifaceOf(doc, a);
  const B = ifaceOf(doc, b);
  if (!A.iface || !B.iface || !A.device || !B.device) return 'straight';
  const t = [A.iface.type, B.iface.type];
  if (t.includes('console') || t.includes('terminal')) return 'console';
  if (t.every((x) => x === 'serial')) return 'serial';
  if (t.every((x) => x === 'sfp')) return 'fiber';
  if (t.includes('wireless') || (t.includes('virtual') && !t.includes('copper'))) return 'virtual';
  if ([A.device, B.device].every((d) => ['router', 'firewall', 'cloud'].includes(d.kind)) && [A.device, B.device].some((d) => d.kind === 'cloud')) return 'wan';
  if (A.device.kind === 'switch' && B.device.kind === 'switch') return 'trunk';
  return MDIX_SIDE(A.device) === MDIX_SIDE(B.device) ? 'crossover' : 'straight';
}

/** Why a port can or cannot take a cable, for the port picker. */
export function portAvailability(doc: LabDoc, deviceId: string, port: string, type: CableType | 'auto', from?: CableEnd, ignoreCableId?: string): { ok: boolean; reason?: string; usedBy?: string } {
  const used = cableOnPort(doc, deviceId, port, ignoreCableId);
  if (used) {
    const p = otherEnd(used, deviceId, port);
    return { ok: false, reason: `In use by ${deviceById(doc, p.device)?.name ?? '?'} ${p.port}`, usedBy: used.id };
  }
  if (!from) return { ok: true };
  const t = type === 'auto' ? suggestCableType(doc, from, { device: deviceId, port }) : type;
  const errors = checkConnection(doc, from, { device: deviceId, port }, t, ignoreCableId).filter((i) => i.severity === 'error' && i.code !== 'occupied');
  return errors.length ? { ok: false, reason: errors[0].message } : { ok: true };
}

export const COPPER_CABLES = COPPER_FAMILY;
