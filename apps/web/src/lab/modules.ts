// Router expansion modules, like Packet Tracer's Physical tab: turn the router off, drag a module
// into an empty slot, turn it back on, and its ports appear. Pulling a module removes its ports
// and unplugs their cables. Hot-swapping is refused, as on the real ISR.
import { ifaceFromTemplate, MODEL_BY_KEY, type PortTemplate } from './catalog';
import { hardwareOf } from './hardware';
import { useLab } from './store';
import type { Device } from './types';

export interface ModuleDef {
  key: string;
  family: 'ehwic' | 'nim';
  name: string;
  blurb: string;
  ports: (slot: string) => PortTemplate[];
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
export const MODULES: ModuleDef[] = [
  { key: 'HWIC-2T', family: 'ehwic', name: 'HWIC-2T', blurb: '2 smart serial WAN ports (Se). For point-to-point WAN links.', ports: (s) => range(2).map((i) => ({ name: `Se${s}/${i}`, type: 'serial', speeds: [10] })) },
  { key: 'HWIC-4ESW', family: 'ehwic', name: 'HWIC-4ESW', blurb: '4 switch ports (Fa) on the router.', ports: (s) => range(4).map((i) => ({ name: `Fa${s}/${i}`, type: 'copper', speeds: [10, 100] })) },
  { key: 'HWIC-1GE-SFP', family: 'ehwic', name: 'HWIC-1GE-SFP', blurb: '1 gigabit SFP port (Gi) for fibre.', ports: (s) => [{ name: `Gi${s}/0`, type: 'sfp', speeds: [1000] }] },
  { key: 'NIM-2T', family: 'nim', name: 'NIM-2T', blurb: '2 serial WAN ports (Se).', ports: (s) => range(2).map((i) => ({ name: `Se${s}/${i}`, type: 'serial', speeds: [10] })) },
  { key: 'NIM-ES2-4', family: 'nim', name: 'NIM-ES2-4', blurb: '4 gigabit switch ports (Gi).', ports: (s) => range(4).map((i) => ({ name: `Gi${s}/${i}`, type: 'copper', speeds: [10, 100, 1000] })) },
  { key: 'NIM-1GE-CU-SFP', family: 'nim', name: 'NIM-1GE-CU-SFP', blurb: '1 gigabit port, copper or SFP (Gi).', ports: (s) => [{ name: `Gi${s}/0`, type: 'copper', speeds: [10, 100, 1000] }] },
];
export const MODULE_BY_KEY = Object.fromEntries(MODULES.map((m) => [m.key, m]));

/** Slot name from the hardware table → interface prefix and module family. */
export function slotInfo(slot: string): { prefix: string; family: ModuleDef['family'] } | null {
  let m = /^EHWIC (\d)$/.exec(slot);
  if (m) return { prefix: `0/${m[1]}`, family: 'ehwic' };
  m = /^NIM 0\/(\d)$/.exec(slot);
  if (m) return { prefix: `0/${m[1]}`, family: 'nim' };
  return null;
}

/** What is in each slot now: the device's own choice, or what the model ships with. */
export function installed(d: Device): Record<string, string | null> {
  const hw = hardwareOf(MODEL_BY_KEY[d.model]);
  const out: Record<string, string | null> = {};
  for (const s of hw.slots) {
    if (!slotInfo(s.name)) continue;
    if (d.modules && s.name in d.modules) out[s.name] = d.modules[s.name];
    else out[s.name] = s.module ? (MODULES.find((m) => s.module!.startsWith(m.key))?.key ?? null) : null;
  }
  return out;
}

export const modulePorts = (key: string | null, slot: string) => {
  const si = slotInfo(slot);
  return key && si && MODULE_BY_KEY[key] ? MODULE_BY_KEY[key].ports(si.prefix) : [];
};

export type ModuleResult = { ok: true; message: string } | { ok: false; message: string };

/** Put a module in a slot (or pull it with key null). The router must be off. */
export function setModule(deviceId: string, slot: string, key: string | null): ModuleResult {
  const st = useLab.getState();
  const d = st.doc?.devices.find((x) => x.id === deviceId);
  const si = slotInfo(slot);
  if (!d || !si) return { ok: false, message: 'That slot does not take modules here.' };
  if (d.power !== 'stopped') return { ok: false, message: `Turn ${d.name} off first. Modules are not hot-swappable: inserting one with the power on can damage the card and the router.` };
  const mod = key ? MODULE_BY_KEY[key] : null;
  if (key && (!mod || mod.family !== si.family)) return { ok: false, message: `${key} does not fit a ${si.family === 'ehwic' ? 'EHWIC' : 'NIM'} slot.` };
  const cur = installed(d)[slot];
  if (key && cur) return { ok: false, message: `${slot} already holds ${cur}. Pull it out first.` };
  const old = new Set(modulePorts(cur, slot).map((p) => p.name));
  const add = mod ? mod.ports(si.prefix) : [];
  const m = MODEL_BY_KEY[d.model];
  st.commit(key ? `Install ${key}` : `Remove ${cur}`, (doc) => {
    const dd = doc.devices.find((x) => x.id === deviceId)!;
    doc.cables = doc.cables.filter((c) => !((c.a.device === deviceId && old.has(c.a.port)) || (c.b.device === deviceId && old.has(c.b.port))));
    dd.interfaces = dd.interfaces.filter((i) => !old.has(i.name));
    for (const t of add) if (!dd.interfaces.some((i) => i.name === t.name)) dd.interfaces.push({ ...ifaceFromTemplate(t, deviceId, m.macPrefix), shutdown: d.kind === 'router' });
    dd.modules = { ...(dd.modules ?? {}), [slot]: key };
  });
  return { ok: true, message: key ? `${key} installed in ${slot}: ${add.map((p) => p.name).join(', ')}. Turn the power back on.` : `${cur} removed from ${slot}.` };
}
