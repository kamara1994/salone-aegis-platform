// Plugging cables in from anywhere (canvas, Physical view, Rack view): the first port you pick holds
// the cable end, the second port completes it. Same rules and errors as the canvas.
import { useLab } from './store';
import type { CableEnd, CableType } from './types';
import { cableOnPort, deviceById, otherEnd, suggestCableType } from './validate';

export type PlugResult = { state: 'holding' | 'connected' | 'error'; message?: string };

/** Pick a port while cabling. Returns what happened so the caller can say so. */
export function plugPort(end: CableEnd, type?: CableType): PlugResult {
  const st = useLab.getState();
  const doc = st.doc!;
  if (type) st.setCableType(type);
  const used = cableOnPort(doc, end.device, end.port);
  const name = deviceById(doc, end.device)?.name;
  if (used) {
    const far = otherEnd(used, end.device, end.port);
    const message = `${name} ${end.port} already has a cable to ${deviceById(doc, far.device)?.name} ${far.port}. Unplug it first.`;
    st.setError({ title: 'That port is already in use', issues: [{ code: 'occupied', severity: 'error', message, fix: 'Pick a free port, or unplug the existing cable.' }] });
    return { state: 'error', message };
  }
  const from = st.pendingEnd;
  if (!from || from.device === end.device) {
    st.setTool('cable');
    st.setPendingEnd(end);
    return { state: 'holding', message: `Holding a cable from ${name} ${end.port}. Pick the port at the other end.` };
  }
  const t = st.cableType === 'auto' && !doc.workbook?.exam ? suggestCableType(doc, from, end) : st.cableType === 'auto' ? 'straight' : st.cableType;
  const r = st.connect(from, end, t);
  st.setPendingEnd(null);
  if (!r.ok) {
    st.setError({ title: 'This cable cannot be connected', issues: r.issues });
    return { state: 'error', message: r.issues[0]?.message };
  }
  st.setError(null);
  return { state: 'connected', message: `Connected ${deviceById(doc, from.device)?.name} ${from.port} to ${name} ${end.port}.` };
}

/** Unplug whatever is in this port. */
export function unplugPort(end: CableEnd): boolean {
  const st = useLab.getState();
  const c = cableOnPort(st.doc!, end.device, end.port);
  if (!c) return false;
  st.removeCable(c.id);
  return true;
}

export const CABLE_MIME = 'application/aegis-cable';
