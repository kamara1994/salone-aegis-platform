// Cables as objects you can drop on the canvas and plug in end by end, like holding a real cable.
// A loose cable lives in the design until both ends are plugged in; then it becomes a normal cable.
import { useLab } from './store';
import type { CableEnd, CableType, LooseCable, LooseEnd } from './types';
import { cableOnPort, deviceById, otherEnd, suggestCableType } from './validate';

export const isPlugged = (e: LooseEnd): e is CableEnd => 'device' in e;
let n = 0;
const uid = () => `loose-${Date.now().toString(36)}-${(n++).toString(36)}`;

/** Drop a new cable on the canvas, lying flat around a point. */
export function dropLoose(type: CableType | 'auto', at: { x: number; y: number }) {
  const id = uid();
  useLab.getState().commit('Lay a cable', (d) => {
    d.loose = [...(d.loose ?? []), { id, type, a: { x: at.x - 70, y: at.y }, b: { x: at.x + 70, y: at.y + 10 } }];
  });
  return id;
}

export function moveLoose(id: string, patch: Partial<Pick<LooseCable, 'a' | 'b'>>) {
  useLab.getState().commit('Move cable', (d) => {
    d.loose = (d.loose ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c));
  });
}

export function removeLoose(id: string) {
  useLab.getState().commit('Remove cable', (d) => {
    d.loose = (d.loose ?? []).filter((c) => c.id !== id);
  });
}

export type PlugOutcome = { ok: boolean; message?: string; connected?: boolean };

/** Plug one end into a port. When the other end is already plugged in, the link is made. */
export function plugLoose(id: string, end: 'a' | 'b', to: CableEnd): PlugOutcome {
  const st = useLab.getState();
  const doc = st.doc!;
  const c = doc.loose?.find((x) => x.id === id);
  if (!c) return { ok: false };
  const used = cableOnPort(doc, to.device, to.port) ?? doc.loose?.find((x) => x.id !== id && [x.a, x.b].some((e) => isPlugged(e) && e.device === to.device && e.port === to.port));
  if (used) {
    const message = `${deviceById(doc, to.device)?.name} ${to.port} already has a cable in it.`;
    st.setError({ title: 'That port is already in use', issues: [{ code: 'occupied', severity: 'error', message, fix: 'Pick a free port, or unplug the cable that is there.' }] });
    return { ok: false, message };
  }
  const other = end === 'a' ? c.b : c.a;
  if (isPlugged(other)) {
    if (other.device === to.device) {
      st.setError({ title: 'Both ends on the same device', issues: [{ code: 'same_device', severity: 'error', message: 'Plug the other end into a different device.' }] });
      return { ok: false };
    }
    const from = end === 'a' ? to : other;
    const dest = end === 'a' ? other : to;
    const type = c.type === 'auto' ? (doc.workbook?.exam ? 'straight' : autoType(from, dest)) : c.type;
    const r = st.connect(from, dest, type);
    if (!r.ok) {
      st.setError({ title: 'This cable cannot be connected', issues: r.issues });
      return { ok: false, message: r.issues[0]?.message };
    }
    removeLoose(id);
    st.setError(null);
    return { ok: true, connected: true };
  }
  moveLoose(id, { [end]: to });
  st.setError(null);
  return { ok: true };
}

/** Pull one end of a connected cable out: the cable stays plugged in at the other end, lying on the canvas. */
export function unplugToLoose(cableId: string, end: 'a' | 'b', at: { x: number; y: number }) {
  const st = useLab.getState();
  const c = st.doc!.cables.find((x) => x.id === cableId);
  if (!c) return;
  const keep = end === 'a' ? c.b : c.a;
  st.commit('Unplug cable', (d) => {
    d.cables = d.cables.filter((x) => x.id !== cableId);
    const free = { x: at.x, y: at.y };
    d.loose = [...(d.loose ?? []), { id: uid(), type: c.type, a: end === 'a' ? free : keep, b: end === 'b' ? free : keep }];
  });
}

/** Cable type for an "Automatic" drop once both ends are known. */
export const autoType = (a: CableEnd, b: CableEnd) => suggestCableType(useLab.getState().doc!, a, b);
export { otherEnd };
