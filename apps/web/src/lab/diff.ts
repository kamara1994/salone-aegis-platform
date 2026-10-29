// Compare the current design with the baseline: what was added, removed or changed.
import { CABLE_LABEL } from './validate';
import type { Cable, Device, Iface, LabDoc } from './types';

export interface DiffItem {
  kind: 'added' | 'removed' | 'changed';
  subject: 'device' | 'cable' | 'interface' | 'rule' | 'route' | 'vlan';
  deviceId?: string;
  cableId?: string;
  label: string;
  detail?: string;
}

const IFACE_FIELDS: (keyof Iface)[] = ['shutdown', 'mode', 'vlan', 'allowedVlans', 'nativeVlan', 'speed', 'duplex', 'ip', 'prefix', 'gateway', 'description'];

const fmt = (v: unknown) => (v === undefined || v === '' ? '-' : Array.isArray(v) ? v.join(',') : String(v));

function cableKey(doc: LabDoc, c: Cable) {
  const n = (id: string) => doc.devices.find((d) => d.id === id)?.name ?? id;
  return [`${n(c.a.device)} ${c.a.port}`, `${n(c.b.device)} ${c.b.port}`].sort().join(' ↔ ');
}

export function diffDocs(base: LabDoc, cur: LabDoc): DiffItem[] {
  const out: DiffItem[] = [];
  const bDev = new Map(base.devices.map((d) => [d.id, d]));
  const cDev = new Map(cur.devices.map((d) => [d.id, d]));
  for (const d of cur.devices) if (!bDev.has(d.id)) out.push({ kind: 'added', subject: 'device', deviceId: d.id, label: `${d.name} added`, detail: `${d.kind}, ${d.interfaces.length} interfaces` });
  for (const d of base.devices) if (!cDev.has(d.id)) out.push({ kind: 'removed', subject: 'device', deviceId: d.id, label: `${d.name} removed` });
  for (const d of cur.devices) {
    const b = bDev.get(d.id);
    if (!b) continue;
    diffDevice(b, d, out);
  }
  const bc = new Map(base.cables.map((c) => [cableKey(base, c), c]));
  const cc = new Map(cur.cables.map((c) => [cableKey(cur, c), c]));
  for (const [k, c] of cc) {
    const b = bc.get(k);
    if (!b) out.push({ kind: 'added', subject: 'cable', cableId: c.id, label: `Cable ${k}`, detail: CABLE_LABEL[c.type] });
    else if (b.type !== c.type || b.disabled !== c.disabled) out.push({ kind: 'changed', subject: 'cable', cableId: c.id, label: `Cable ${k}`, detail: [b.type !== c.type && `${CABLE_LABEL[b.type]} → ${CABLE_LABEL[c.type]}`, b.disabled !== c.disabled && (c.disabled ? 'disabled' : 'enabled')].filter(Boolean).join(', ') });
  }
  for (const [k, c] of bc) if (!cc.has(k)) out.push({ kind: 'removed', subject: 'cable', cableId: c.id, label: `Cable ${k}`, detail: CABLE_LABEL[c.type] });
  const bv = new Map(base.vlans.map((v) => [v.id, v]));
  for (const v of cur.vlans) if (!bv.has(v.id)) out.push({ kind: 'added', subject: 'vlan', label: `VLAN ${v.id} ${v.name}`, detail: v.subnet });
  return out;
}

function diffDevice(b: Device, d: Device, out: DiffItem[]) {
  if (b.power !== d.power) out.push({ kind: 'changed', subject: 'device', deviceId: d.id, label: `${d.name} power`, detail: `${b.power} → ${d.power}` });
  const bi = new Map(b.interfaces.map((i) => [i.name, i]));
  for (const i of d.interfaces) {
    const o = bi.get(i.name);
    if (!o) {
      out.push({ kind: 'added', subject: 'interface', deviceId: d.id, label: `${d.name} ${i.name}` });
      continue;
    }
    const changes = IFACE_FIELDS.filter((f) => JSON.stringify(o[f]) !== JSON.stringify(i[f])).map((f) => `${f} ${fmt(o[f])} → ${fmt(i[f])}`);
    if (changes.length) out.push({ kind: 'changed', subject: 'interface', deviceId: d.id, label: `${d.name} ${i.name}`, detail: changes.join(', ') });
  }
  for (const o of b.interfaces) if (!d.interfaces.some((i) => i.name === o.name)) out.push({ kind: 'removed', subject: 'interface', deviceId: d.id, label: `${d.name} ${o.name}` });
  const br = new Map(b.firewall.map((r) => [r.id, r]));
  for (const r of d.firewall) {
    const o = br.get(r.id);
    if (!o) out.push({ kind: 'added', subject: 'rule', deviceId: d.id, label: `${d.name} rule ${r.id}`, detail: `${r.action} ${r.iface}: ${r.src} → ${r.dst} ${r.proto}/${r.port} (${r.descr})` });
    else if (JSON.stringify(o) !== JSON.stringify(r)) out.push({ kind: 'changed', subject: 'rule', deviceId: d.id, label: `${d.name} rule ${r.id}`, detail: r.descr });
  }
  for (const o of b.firewall) if (!d.firewall.some((r) => r.id === o.id)) out.push({ kind: 'removed', subject: 'rule', deviceId: d.id, label: `${d.name} rule ${o.id}`, detail: o.descr });
  const rk = (r: Device['routes'][number]) => `${r.prefix} ${r.via ?? r.iface}`;
  const brt = new Set(b.routes.filter((r) => r.kind !== 'connected').map(rk));
  const drt = new Set(d.routes.filter((r) => r.kind !== 'connected').map(rk));
  for (const r of drt) if (!brt.has(r)) out.push({ kind: 'added', subject: 'route', deviceId: d.id, label: `${d.name} route ${r}` });
  for (const r of brt) if (!drt.has(r)) out.push({ kind: 'removed', subject: 'route', deviceId: d.id, label: `${d.name} route ${r}` });
}
