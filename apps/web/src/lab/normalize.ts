// Repairs lab documents saved by older versions (autosaved drafts, saved layouts, imported files and
// content packs) so a missing field can never crash the Lab page. Unknown or broken parts are
// filled with safe defaults or dropped.
import { MODEL_BY_KEY } from './catalog';
import type { Annotation, Device, Iface, LabDoc } from './types';

const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const KINDS: Annotation['kind'][] = ['text', 'label', 'rect', 'ellipse', 'arrow'];
const COLORS: Annotation['color'][] = ['blue', 'green', 'amber', 'red', 'grey'];

function fixIface(raw: Partial<Iface>, model?: string): Iface | null {
  if (!raw || typeof raw.name !== 'string' || !raw.name) return null;
  const tpl = model ? MODEL_BY_KEY[model]?.ports().find((p) => p.name === raw.name) : undefined;
  return {
    ...raw,
    name: raw.name,
    type: raw.type ?? tpl?.type ?? 'copper',
    speeds: Array.isArray(raw.speeds) && raw.speeds.length ? raw.speeds : tpl?.speeds ?? [1000],
    speed: raw.speed ?? 'auto',
    duplex: raw.duplex ?? 'auto',
    mac: typeof raw.mac === 'string' ? raw.mac : '',
    shutdown: !!raw.shutdown,
  } as Iface;
}

function fixDevice(raw: Partial<Device>): Device | null {
  if (!raw || typeof raw.id !== 'string' || !raw.id) return null;
  const m = raw.model ? MODEL_BY_KEY[raw.model] : undefined;
  const kind = raw.kind ?? m?.kind ?? 'pc';
  return {
    ...raw,
    id: raw.id,
    origin: raw.origin ?? 'design',
    name: typeof raw.name === 'string' && raw.name ? raw.name : raw.id,
    kind,
    model: raw.model ?? '',
    x: Number.isFinite(raw.x) ? raw.x! : 0,
    y: Number.isFinite(raw.y) ? raw.y! : 0,
    power: raw.power ?? 'running',
    health: raw.health ?? 'unknown',
    interfaces: arr<Partial<Iface>>(raw.interfaces).map((i) => fixIface(i, raw.model)).filter((i): i is Iface => !!i),
    routes: arr(raw.routes),
    vlans: raw.vlans && typeof raw.vlans === 'object' && !Array.isArray(raw.vlans) ? raw.vlans : kind === 'switch' ? { 1: 'default' } : {},
    firewall: arr(raw.firewall),
    listening: arr(raw.listening),
    consoles: arr(raw.consoles),
  } as Device;
}

/** Returns a safe document, or null if the input is not a lab document at all. */
export function normalizeDoc(raw: unknown): LabDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<LabDoc>;
  if (!Array.isArray(d.devices)) return null;
  const devices = arr<Partial<Device>>(d.devices).map(fixDevice).filter((x): x is Device => !!x);
  const ids = new Set(devices.map((x) => x.id));
  return {
    ...d,
    version: 1,
    devices,
    cables: arr<LabDoc['cables'][number]>(d.cables).filter((c) => c && c.id && c.a && c.b && ids.has(c.a.device) && ids.has(c.b.device)).map((c) => ({ ...c, type: c.type ?? 'straight', disabled: !!c.disabled })),
    sites: arr(d.sites),
    racks: arr(d.racks),
    vlans: arr(d.vlans),
    subnets: arr(d.subnets),
    groups: arr<LabDoc['groups'][number]>(d.groups).filter((g) => g && g.id),
    annotations: arr<Annotation>(d.annotations)
      .filter((a) => a && a.id)
      .map((a) => ({ ...a, kind: KINDS.includes(a.kind) ? a.kind : 'text', color: COLORS.includes(a.color) ? a.color : 'grey', text: typeof a.text === 'string' ? a.text : '', x: Number(a.x) || 0, y: Number(a.y) || 0, w: Number(a.w) || 200, h: Number(a.h) || 80 })),
    goals: arr(d.goals),
    source: d.source ?? 'blank',
    generatedAt: d.generatedAt ?? new Date().toISOString(),
  } as LabDoc;
}
