'use client';
// Editor state for the lab designer: the document, selection, tools, undo/redo history,
// packet traces and saved layouts. Every change to the document goes through `commit`,
// which records history and autosaves the draft for this browser.
import { create } from 'zustand';
import { DEFAULT_MODEL, ifaceFromTemplate, KIND_LABEL, MODEL_BY_KEY } from './catalog';
import { DEVICE_H, DEVICE_W } from './inventory';
import { diffDocs } from './diff';
import { applyPoe, checkAssociation, dhcpLease, type DhcpResult } from './protocols';
import type { PacketTrace } from './simulate';
import { cableStatus, checkConnection, deviceById } from './validate';
import type { Annotation, Cable, CableEnd, CableIssue, CableType, Device, FirewallRule, Goal, Iface, LabDoc, LabSite, Rack, Route, Subnet, Vlan } from './types';

export type Tool = 'select' | 'cable' | 'simulate';
export type LabBackground = 'grid' | 'blueprint' | 'datacenter' | 'soc' | 'global';
export interface Selection {
  devices: string[];
  cables: string[];
}
export interface LogEntry {
  at: string;
  deviceId: string;
  text: string;
  level: 'info' | 'warn' | 'error';
}
export interface SavedLayout {
  name: string;
  savedAt: string;
  doc: LabDoc;
}

const HISTORY = 100;
export const GRID = 16;

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const clone = <T,>(v: T): T => structuredClone(v);

function storageGet<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function storageSet(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const keys = (scope: string) => ({ draft: `aegis.lab.draft.v1:${scope}`, layouts: `aegis.lab.layouts.v1:${scope}`, current: `aegis.lab.current.v1:${scope}`, background: `aegis.lab.background.v1:${scope}` });

interface LabState {
  scope: string;
  doc: LabDoc | null;
  baseline: LabDoc | null;
  /** The latest document built from the platform, to tell when the draft is out of date. */
  fresh: LabDoc | null;
  /** The platform document the current design was started from (or last refreshed against). */
  basis: LabDoc | null;
  past: LabDoc[];
  future: LabDoc[];
  selection: Selection;
  tool: Tool;
  cableType: CableType | 'auto';
  pendingEnd: CableEnd | null;
  snap: boolean;
  compare: boolean;
  traces: PacketTrace[];
  activeTrace: string | null;
  log: LogEntry[];
  layoutName: string | null;
  restoredAt: string | null;
  clipboard: { devices: Device[]; cables: Cable[] } | null;
  inspectorTab: string;
  inspectorOpen: boolean;
  lastError: { title: string; issues: CableIssue[]; tone?: 'error' | 'warn' | 'ok' } | null;
  portLabels: boolean;
  labelMode: 'full' | 'compact';
  background: LabBackground;
  simSrc: string;
  simDst: string;
  setView(v: Partial<Pick<LabState, 'portLabels' | 'labelMode' | 'simSrc' | 'simDst'>>): void;
  setBackground(v: LabBackground): void;

  init(scope: string, fresh: LabDoc, baseline: LabDoc): void;
  commit(label: string, fn: (d: LabDoc) => void, log?: Omit<LogEntry, 'at'>[]): void;
  undo(): void;
  redo(): void;
  select(sel: Partial<Selection>, additive?: boolean): void;
  clearSelection(): void;
  setTool(t: Tool): void;
  setCableType(t: CableType | 'auto'): void;
  setPendingEnd(e: CableEnd | null): void;
  setSnap(v: boolean): void;
  setCompare(v: boolean): void;
  openInspector(tab?: string): void;
  closeInspector(): void;
  setInspectorTab(tab: string): void;
  setError(e: LabState['lastError']): void;

  addDevice(modelKey: string, x: number, y: number, opts?: Partial<Device>): string;
  moveDevices(pos: Record<string, { x: number; y: number }>): void;
  duplicate(ids?: string[]): string[];
  deleteSelection(): void;
  copy(): void;
  paste(): void;
  updateDevice(id: string, patch: Partial<Device>): void;
  setPower(id: string, power: Device['power']): void;
  connect(a: CableEnd, b: CableEnd, type: CableType, extra?: Partial<Cable>): { ok: boolean; issues: CableIssue[]; id?: string };
  updateCable(id: string, patch: Partial<Cable>): void;
  replaceCable(id: string, type: CableType): { ok: boolean; issues: CableIssue[] };
  reconnectCable(id: string, end: 'a' | 'b', to: CableEnd): { ok: boolean; issues: CableIssue[] };
  removeCable(id: string): void;
  updateIface(deviceId: string, name: string, patch: Partial<Iface>): void;
  addIface(deviceId: string, iface: Iface): void;
  removeIface(deviceId: string, name: string): void;
  setRules(deviceId: string, rules: FirewallRule[]): void;
  setRoutes(deviceId: string, routes: Route[]): void;
  setVlans(deviceId: string, vlans: Record<number, string>): void;
  align(how: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'hspace' | 'vspace'): void;
  nudge(dx: number, dy: number): void;
  group(name?: string): void;
  ungroup(): void;
  addSite(site: Omit<LabSite, 'id'>, deviceIds?: string[]): string;
  addRack(rack: Omit<Rack, 'id'>): string;
  placeInRack(deviceId: string, rackId: string | null, u?: number): void;
  addVlan(v: Vlan, switchIds?: string[]): void;
  addSubnet(s: Subnet): void;
  addTrace(t: PacketTrace[]): void;
  setActiveTrace(id: string | null): void;
  clearTraces(): void;
  renewDhcp(deviceId: string, iface: string): DhcpResult;
  associateWireless(clientId: string, apId: string): { ok: boolean; reason?: string };
  addAnnotation(a: Omit<Annotation, 'id'>): string;
  updateAnnotation(id: string, patch: Partial<Annotation>): void;
  removeAnnotation(id: string): void;
  addGoal(g: Omit<Goal, 'id'>): string;
  removeGoal(id: string): void;
  startChallenge(c: { title: string; brief: string; fault: string }, fn: (d: LabDoc) => void): void;
  revealChallenge(): void;
  endChallenge(): void;
  importDoc(doc: LabDoc): void;

  saveLayout(name: string): boolean;
  loadLayout(name: string): boolean;
  deleteLayout(name: string): void;
  layouts(): SavedLayout[];
  resetToBaseline(): void;
  refreshFromLab(): void;
  staleCount(): number;
}

function autosave(s: Pick<LabState, 'scope' | 'doc' | 'layoutName' | 'basis'>) {
  if (!s.doc || typeof window === 'undefined') return;
  storageSet(keys(s.scope).draft, { savedAt: new Date().toISOString(), doc: s.doc, layoutName: s.layoutName, basis: s.basis });
}

function nextName(doc: LabDoc, kind: Device['kind']) {
  const base = KIND_LABEL[kind].replace(/\s+/g, '');
  let i = 0;
  const names = new Set(doc.devices.map((d) => d.name));
  while (names.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

function snapTo(v: number, on: boolean) {
  return on ? Math.round(v / GRID) * GRID : Math.round(v);
}

function linkLog(doc: LabDoc, c: Cable, up: boolean): Omit<LogEntry, 'at'>[] {
  return [c.a, c.b].map((e) => {
    const d = deviceById(doc, e.device);
    const ios = d?.kind === 'switch' || d?.kind === 'router';
    return { deviceId: e.device, level: up ? 'info' : 'warn', text: ios ? `%LINK-3-UPDOWN: Interface ${e.port}, changed state to ${up ? 'up' : 'down'}` : `${e.port}: link ${up ? 'up' : 'down'}` } as const;
  });
}

export const useLab = create<LabState>((set, get) => ({
  scope: 'default',
  doc: null,
  baseline: null,
  fresh: null,
  basis: null,
  past: [],
  future: [],
  selection: { devices: [], cables: [] },
  tool: 'select',
  cableType: 'auto',
  pendingEnd: null,
  snap: true,
  compare: false,
  traces: [],
  activeTrace: null,
  log: [],
  layoutName: null,
  restoredAt: null,
  clipboard: null,
  inspectorTab: 'overview',
  inspectorOpen: false,
  lastError: null,
  portLabels: true,
  labelMode: 'full',
  background: 'grid',
  simSrc: '',
  simDst: '',
  setView(v) {
    set(v);
  },
  setBackground(background) {
    set({ background });
    if (typeof window !== 'undefined') storageSet(keys(get().scope).background, background);
  },

  init(scope, fresh, baseline) {
    const draft = typeof window !== 'undefined' ? storageGet<{ savedAt: string; doc: LabDoc; layoutName?: string | null; basis?: LabDoc | null }>(keys(scope).draft) : null;
    const usable = draft?.doc?.version === 1 && draft.doc.source === fresh.source;
    set({
      scope,
      fresh,
      basis: usable ? draft!.basis ?? draft!.doc : clone(fresh),
      baseline,
      doc: usable ? draft!.doc : clone(fresh),
      layoutName: usable ? draft!.layoutName ?? null : null,
      background: storageGet<LabBackground>(keys(scope).background) ?? 'grid',
      restoredAt: usable ? draft!.savedAt : null,
      past: [],
      future: [],
      selection: { devices: [], cables: [] },
      traces: [],
      activeTrace: null,
    });
  },

  commit(label, fn, log) {
    const s = get();
    if (!s.doc) return;
    const before = s.doc;
    const next = clone(before);
    fn(next);
    applyPoe(next);
    const at = new Date().toISOString();
    set({ doc: next, past: [...s.past.slice(-HISTORY + 1), before], future: [], log: log?.length ? [...s.log, ...log.map((l) => ({ ...l, at }))].slice(-400) : s.log });
    autosave({ ...get() });
    void label;
  },
  undo() {
    const s = get();
    const prev = s.past.at(-1);
    if (!prev || !s.doc) return;
    set({ doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future].slice(0, HISTORY) });
    autosave(get());
  },
  redo() {
    const s = get();
    const next = s.future[0];
    if (!next || !s.doc) return;
    set({ doc: next, future: s.future.slice(1), past: [...s.past, s.doc].slice(-HISTORY) });
    autosave(get());
  },
  select(sel, additive) {
    const cur = get().selection;
    const devices = sel.devices ?? (additive ? cur.devices : []);
    const cables = sel.cables ?? (additive ? cur.cables : []);
    const next = additive ? { devices: [...new Set([...cur.devices, ...devices])], cables: [...new Set([...cur.cables, ...cables])] } : { devices, cables };
    const same = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
    if (same(next.devices, cur.devices) && same(next.cables, cur.cables)) return;
    set({ selection: next });
  },
  clearSelection() {
    set({ selection: { devices: [], cables: [] } });
  },
  setTool(tool) {
    set({ tool, pendingEnd: null });
  },
  setCableType(cableType) {
    set({ cableType });
  },
  setPendingEnd(pendingEnd) {
    set({ pendingEnd });
  },
  setSnap(snap) {
    set({ snap });
  },
  setCompare(compare) {
    set({ compare });
  },
  openInspector(tab) {
    set({ inspectorOpen: true, ...(tab ? { inspectorTab: tab } : {}) });
  },
  closeInspector() {
    set({ inspectorOpen: false });
  },
  setInspectorTab(inspectorTab) {
    set({ inspectorTab });
  },
  setError(lastError) {
    set({ lastError });
  },

  addDevice(modelKey, x, y, opts = {}) {
    const m = MODEL_BY_KEY[modelKey] ?? MODEL_BY_KEY[DEFAULT_MODEL.pc];
    const id = uid('dev');
    const s = get();
    get().commit('Add device', (doc) => {
      const d: Device = {
        id,
        origin: 'design',
        name: nextName(doc, m.kind),
        kind: m.kind,
        model: m.key,
        x: snapTo(x - DEVICE_W / 2, s.snap),
        y: snapTo(y - DEVICE_H / 2, s.snap),
        power: 'running',
        health: 'healthy',
        interfaces: m.ports().map((t) => ifaceFromTemplate(t, id, m.macPrefix)).map((i) => (m.kind === 'switch' && i.type !== 'console' ? { ...i, mode: 'access' as const, vlan: 1 } : i)),
        routes: [],
        vlans: m.kind === 'switch' ? { 1: 'default' } : {},
        firewall: m.kind === 'firewall' ? [{ id: 99, iface: 'any', src: 'any', dst: 'any', proto: 'any', port: 'any', action: 'block', log: true, enabled: true, descr: 'Default deny (logged)' }] : [],
        listening: [...m.listening],
        consoles: [],
        ...(m.kind === 'switch' ? { stp: { enabled: true, priority: 32768 } } : {}),
        ...(m.kind === 'ap' ? { wireless: { ssid: 'AEGIS-LAB', security: 'wpa2' as const, key: 'changeme123', channel: 6 } } : {}),
        ...(m.kind === 'switch' || m.kind === 'router' ? { security: { ssh: false, telnet: true, enableSecret: false } } : {}),
        ...opts,
      };
      doc.devices.push(d);
    });
    set({ selection: { devices: [id], cables: [] } });
    return id;
  },
  moveDevices(pos) {
    const snap = get().snap;
    get().commit('Move', (doc) => {
      for (const d of doc.devices) if (pos[d.id]) Object.assign(d, { x: snapTo(pos[d.id].x, snap), y: snapTo(pos[d.id].y, snap) });
    });
  },
  duplicate(ids) {
    const s = get();
    const src = (ids ?? s.selection.devices).map((i) => deviceById(s.doc!, i)).filter(Boolean) as Device[];
    if (!src.length) return [];
    const map: Record<string, string> = {};
    get().commit('Duplicate', (doc) => {
      for (const d of src) {
        const id = uid('dev');
        map[d.id] = id;
        const m = MODEL_BY_KEY[d.model];
        const copy: Device = { ...clone(d), id, nodeId: undefined, origin: 'design', name: nextName(doc, d.kind), x: d.x + GRID * 3, y: d.y + GRID * 3, groupId: undefined, rack: undefined };
        copy.interfaces = copy.interfaces.map((i) => ({ ...i, mac: i.mac ? ifaceFromTemplate({ name: i.name, type: i.type, speeds: i.speeds }, id, m?.macPrefix ?? '02:00:00').mac : '', ip: undefined, gateway: undefined, dhcp: i.dhcp, inferred: undefined }));
        copy.routes = copy.routes.filter((r) => r.kind !== 'connected');
        copy.consoles = [];
        doc.devices.push(copy);
      }
      // Copy cables that run between duplicated devices.
      for (const c of doc.cables.filter((c) => map[c.a.device] && map[c.b.device])) doc.cables.push({ ...clone(c), id: uid('cable'), linkId: undefined, a: { ...c.a, device: map[c.a.device] }, b: { ...c.b, device: map[c.b.device] } });
    });
    const newIds = Object.values(map);
    set({ selection: { devices: newIds, cables: [] } });
    return newIds;
  },
  deleteSelection() {
    const s = get();
    const { devices, cables } = s.selection;
    if (!devices.length && !cables.length) return;
    const logs: Omit<LogEntry, 'at'>[] = [];
    for (const id of cables) {
      const c = s.doc!.cables.find((x) => x.id === id);
      if (c) logs.push(...linkLog(s.doc!, c, false));
    }
    get().commit(
      'Delete',
      (doc) => {
        doc.devices = doc.devices.filter((d) => !devices.includes(d.id));
        doc.cables = doc.cables.filter((c) => !cables.includes(c.id) && !devices.includes(c.a.device) && !devices.includes(c.b.device));
      },
      logs,
    );
    set({ selection: { devices: [], cables: [] }, inspectorOpen: false });
  },
  copy() {
    const s = get();
    const devs = s.selection.devices.map((id) => deviceById(s.doc!, id)).filter(Boolean) as Device[];
    const ids = new Set(devs.map((d) => d.id));
    set({ clipboard: { devices: clone(devs), cables: clone(s.doc!.cables.filter((c) => ids.has(c.a.device) && ids.has(c.b.device))) } });
  },
  paste() {
    const cb = get().clipboard;
    if (!cb?.devices.length) return;
    const ids = cb.devices.map((d) => d.id);
    const present = ids.filter((id) => deviceById(get().doc!, id));
    if (present.length === ids.length) get().duplicate(ids);
    else {
      get().commit('Paste', (doc) => {
        doc.devices.push(...clone(cb.devices).map((d) => ({ ...d, x: d.x + GRID * 2, y: d.y + GRID * 2 })));
        doc.cables.push(...clone(cb.cables));
      });
      set({ selection: { devices: ids, cables: [] } });
    }
  },
  updateDevice(id, patch) {
    get().commit('Edit device', (doc) => {
      const d = deviceById(doc, id);
      if (d) Object.assign(d, patch);
    });
  },
  setPower(id, power) {
    const doc = get().doc!;
    const d = deviceById(doc, id);
    if (!d) return;
    const attached = doc.cables.filter((c) => c.a.device === id || c.b.device === id);
    get().commit(
      power === 'running' ? 'Power on' : 'Power off',
      (x) => {
        const dd = deviceById(x, id)!;
        dd.power = power;
        dd.health = power === 'running' ? 'healthy' : 'down';
      },
      [{ deviceId: id, level: power === 'running' ? 'info' : 'warn', text: power === 'running' ? 'System powered on, booting' : 'System powered off' }, ...attached.flatMap((c) => linkLog(doc, c, power === 'running')).filter((l) => l.deviceId !== id)],
    );
  },
  connect(a, b, type, extra = {}) {
    const doc = get().doc!;
    const issues = checkConnection(doc, a, b, type);
    if (issues.some((i) => i.severity === 'error')) return { ok: false, issues };
    const id = uid('cable');
    const cable: Cable = { id, a, b, type, disabled: false, ...extra };
    // Access and trunk cables also set the switch port mode, the way you would configure it.
    get().commit(
      'Connect',
      (d) => {
        d.cables.push(cable);
        for (const end of [a, b]) {
          const dev = deviceById(d, end.device);
          const p = dev?.interfaces.find((i) => i.name === end.port);
          if (!dev || !p || dev.kind !== 'switch') continue;
          if (type === 'trunk') Object.assign(p, { mode: 'trunk', allowedVlans: p.allowedVlans ?? 'all', nativeVlan: p.nativeVlan ?? 1, vlan: undefined });
          if (type === 'access') {
            const other = end === a ? b : a;
            const peer = deviceById(d, other.device)?.interfaces.find((i) => i.name === other.port);
            Object.assign(p, { mode: 'access', vlan: peer?.vlan ?? p.vlan ?? 1 });
          }
        }
      },
      linkLog(doc, cable, true),
    );
    const after = cableStatus(get().doc!, cable);
    set({ selection: { devices: [], cables: [id] } });
    return { ok: true, issues: [...issues, ...after.issues.filter((i) => !issues.includes(i))], id };
  },
  updateCable(id, patch) {
    const doc = get().doc!;
    const c = doc.cables.find((x) => x.id === id);
    const log = c && patch.disabled !== undefined && patch.disabled !== c.disabled ? linkLog(doc, c, !patch.disabled) : undefined;
    get().commit(
      'Edit cable',
      (d) => {
        const x = d.cables.find((y) => y.id === id);
        if (x) Object.assign(x, patch);
      },
      log,
    );
  },
  replaceCable(id, type) {
    const doc = get().doc!;
    const c = doc.cables.find((x) => x.id === id);
    if (!c) return { ok: false, issues: [] };
    const issues = checkConnection(doc, c.a, c.b, type, id);
    if (issues.some((i) => i.severity === 'error')) return { ok: false, issues };
    get().updateCable(id, { type });
    return { ok: true, issues };
  },
  reconnectCable(id, end, to) {
    const doc = get().doc!;
    const c = doc.cables.find((x) => x.id === id);
    if (!c) return { ok: false, issues: [] };
    const a = end === 'a' ? to : c.a;
    const b = end === 'b' ? to : c.b;
    const issues = checkConnection(doc, a, b, c.type, id);
    if (issues.some((i) => i.severity === 'error')) return { ok: false, issues };
    get().commit('Reconnect cable', (d) => {
      const x = d.cables.find((y) => y.id === id)!;
      x[end] = to;
      x.linkId = undefined;
      x.bend = undefined;
    }, [...linkLog(doc, c, false).filter((l) => l.deviceId === c[end].device), ...linkLog(doc, { ...c, a, b }, true).filter((l) => l.deviceId === to.device)]);
    return { ok: true, issues };
  },
  removeCable(id) {
    const doc = get().doc!;
    const c = doc.cables.find((x) => x.id === id);
    if (!c) return;
    get().commit('Remove cable', (d) => {
      d.cables = d.cables.filter((x) => x.id !== id);
    }, linkLog(doc, c, false));
    set((s) => ({ selection: { ...s.selection, cables: s.selection.cables.filter((x) => x !== id) } }));
  },
  updateIface(deviceId, name, patch) {
    const doc = get().doc!;
    const d = deviceById(doc, deviceId);
    const i = d?.interfaces.find((x) => x.name === name);
    const log: Omit<LogEntry, 'at'>[] = [];
    if (d && i && patch.shutdown !== undefined && patch.shutdown !== i.shutdown) {
      const ios = d.kind === 'switch' || d.kind === 'router';
      log.push({ deviceId, level: patch.shutdown ? 'warn' : 'info', text: ios ? `%LINK-5-CHANGED: Interface ${name}, changed state to ${patch.shutdown ? 'administratively down' : 'up'}` : `${name}: ${patch.shutdown ? 'disabled' : 'enabled'} by operator` });
    }
    if (d && i && patch.vlan !== undefined && patch.vlan !== i.vlan) log.push({ deviceId, level: 'info', text: `${name}: access VLAN ${i.vlan ?? 1} → ${patch.vlan}` });
    get().commit(
      'Edit interface',
      (x) => {
        const dev = deviceById(x, deviceId);
        const f = dev?.interfaces.find((y) => y.name === name);
        if (!dev || !f) return;
        Object.assign(f, patch, { inferred: false });
        // keep connected routes in step with interface addresses
        dev.routes = dev.routes.filter((r) => r.kind !== 'connected' || r.iface !== name);
        if (f.ip && f.prefix !== undefined) {
          const p = f.ip.split('.').map(Number);
          const n = ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
          const m = f.prefix === 0 ? 0 : (0xffffffff << (32 - f.prefix)) >>> 0;
          const b = (n & m) >>> 0;
          dev.routes.unshift({ prefix: `${(b >>> 24) & 255}.${(b >>> 16) & 255}.${(b >>> 8) & 255}.${b & 255}/${f.prefix}`, iface: name, kind: 'connected' });
        }
      },
      log,
    );
  },
  addIface(deviceId, iface) {
    get().commit('Add interface', (doc) => {
      const d = deviceById(doc, deviceId);
      if (d && !d.interfaces.some((i) => i.name === iface.name)) d.interfaces.push(iface);
    });
  },
  removeIface(deviceId, name) {
    get().commit('Remove interface', (doc) => {
      const d = deviceById(doc, deviceId);
      if (!d) return;
      d.interfaces = d.interfaces.filter((i) => i.name !== name && i.parent !== name);
      d.routes = d.routes.filter((r) => r.iface !== name);
      doc.cables = doc.cables.filter((c) => !((c.a.device === deviceId && c.a.port === name) || (c.b.device === deviceId && c.b.port === name)));
    });
  },
  setRules(deviceId, rules) {
    get().commit('Edit firewall rules', (doc) => {
      const d = deviceById(doc, deviceId);
      if (d) d.firewall = rules;
    });
  },
  setRoutes(deviceId, routes) {
    get().commit('Edit routes', (doc) => {
      const d = deviceById(doc, deviceId);
      if (d) d.routes = routes;
    });
  },
  setVlans(deviceId, vlans) {
    get().commit('Edit VLANs', (doc) => {
      const d = deviceById(doc, deviceId);
      if (d) d.vlans = vlans;
    });
  },
  align(how) {
    const s = get();
    const devs = s.selection.devices.map((id) => deviceById(s.doc!, id)).filter(Boolean) as Device[];
    if (devs.length < 2) return;
    const xs = devs.map((d) => d.x);
    const ys = devs.map((d) => d.y);
    get().commit('Align', (doc) => {
      const sel = doc.devices.filter((d) => s.selection.devices.includes(d.id));
      if (how === 'left') sel.forEach((d) => (d.x = Math.min(...xs)));
      if (how === 'right') sel.forEach((d) => (d.x = Math.max(...xs)));
      if (how === 'center') sel.forEach((d) => (d.x = Math.round((Math.min(...xs) + Math.max(...xs)) / 2)));
      if (how === 'top') sel.forEach((d) => (d.y = Math.min(...ys)));
      if (how === 'bottom') sel.forEach((d) => (d.y = Math.max(...ys)));
      if (how === 'middle') sel.forEach((d) => (d.y = Math.round((Math.min(...ys) + Math.max(...ys)) / 2)));
      if (how === 'hspace' || how === 'vspace') {
        const k = how === 'hspace' ? 'x' : 'y';
        const sorted = [...sel].sort((a, b) => a[k] - b[k]);
        const min = sorted[0][k];
        const max = sorted.at(-1)![k];
        const step = (max - min) / (sorted.length - 1);
        sorted.forEach((d, i) => (d[k] = Math.round(min + step * i)));
      }
    });
  },
  nudge(dx, dy) {
    const s = get();
    if (!s.selection.devices.length) return;
    get().commit('Nudge', (doc) => {
      for (const d of doc.devices) if (s.selection.devices.includes(d.id)) Object.assign(d, { x: d.x + dx, y: d.y + dy });
    });
  },
  group(name) {
    const s = get();
    if (s.selection.devices.length < 2) return;
    const id = uid('grp');
    get().commit('Group', (doc) => {
      doc.groups.push({ id, name: name ?? `Group ${doc.groups.length + 1}` });
      for (const d of doc.devices) if (s.selection.devices.includes(d.id)) d.groupId = id;
    });
  },
  ungroup() {
    const s = get();
    const gids = new Set(s.selection.devices.map((id) => deviceById(s.doc!, id)?.groupId).filter(Boolean));
    if (!gids.size) return;
    get().commit('Ungroup', (doc) => {
      for (const d of doc.devices) if (d.groupId && gids.has(d.groupId)) d.groupId = undefined;
      doc.groups = doc.groups.filter((g) => !gids.has(g.id));
    });
  },
  addSite(site, deviceIds) {
    const id = uid('site');
    get().commit('Add site', (doc) => {
      doc.sites.push({ ...site, id });
      for (const d of doc.devices) if (deviceIds?.includes(d.id)) d.siteId = id;
    });
    return id;
  },
  addRack(rack) {
    const id = uid('rack');
    get().commit('Add rack', (doc) => {
      doc.racks.push({ ...rack, id });
    });
    return id;
  },
  placeInRack(deviceId, rackId, u) {
    get().commit('Rack device', (doc) => {
      const d = deviceById(doc, deviceId);
      if (!d) return;
      d.rack = rackId ? { rackId, u: u ?? 1 } : undefined;
      if (rackId) d.siteId = doc.racks.find((r) => r.id === rackId)?.siteId ?? d.siteId;
    });
  },
  addVlan(v, switchIds) {
    get().commit('Add VLAN', (doc) => {
      doc.vlans = [...doc.vlans.filter((x) => x.id !== v.id), v].sort((a, b) => a.id - b.id);
      for (const d of doc.devices) if (d.kind === 'switch' && (!switchIds || switchIds.includes(d.id))) d.vlans[v.id] = v.name;
      if (v.subnet && !doc.subnets.some((s) => s.cidr === v.subnet)) doc.subnets.push({ cidr: v.subnet, name: `${v.name} (VLAN ${v.id})`, vlan: v.id, siteId: v.siteId });
    });
  },
  addSubnet(sn) {
    get().commit('Add subnet', (doc) => {
      doc.subnets = [...doc.subnets.filter((x) => x.cidr !== sn.cidr), sn];
    });
  },
  addTrace(t) {
    set((s) => ({ traces: [...t, ...s.traces].slice(0, 60), activeTrace: t[0]?.id ?? s.activeTrace }));
  },
  setActiveTrace(activeTrace) {
    set({ activeTrace });
  },
  clearTraces() {
    set({ traces: [], activeTrace: null });
  },
  renewDhcp(deviceId, iface) {
    const doc = get().doc;
    if (!doc) return { ok: false, reason: 'No lab loaded.' };
    const r = dhcpLease(doc, deviceId, iface);
    const name = deviceById(doc, deviceId)?.name ?? deviceId;
    if (r.ok)
      get().commit(`DHCP lease for ${name}`, (d) => {
        const i = deviceById(d, deviceId)?.interfaces.find((x) => x.name === iface);
        if (i) Object.assign(i, { dhcp: true, ip: r.ip, prefix: r.prefix, gateway: r.gateway, dns: r.dns });
      }, [{ deviceId, level: 'info', text: `DHCP: ${iface} leased ${r.ip}/${r.prefix} from ${r.server}${r.via ? ` via ${r.via}` : ''}` }]);
    else set((s) => ({ log: [...s.log, { at: new Date().toISOString(), deviceId, level: 'warn' as const, text: `DHCP: ${iface} got no lease. ${r.reason}` }].slice(-400) }));
    return r;
  },
  associateWireless(clientId, apId) {
    const doc = get().doc;
    if (!doc) return { ok: false, reason: 'No lab loaded.' };
    const client = deviceById(doc, clientId);
    const ap = deviceById(doc, apId);
    if (!client || !ap) return { ok: false, reason: 'Device not found.' };
    const res = checkAssociation(client, ap);
    if (!res.ok) {
      set({ lastError: { title: `${client.name} cannot join ${ap.name}`, issues: [{ code: 'disabled', severity: 'error', message: res.reason! }] } });
      return res;
    }
    const nic = client.interfaces.find((i) => i.type === 'wireless');
    const radio = ap.interfaces.find((i) => i.type === 'wireless');
    if (!nic || !radio) return { ok: false, reason: `${!nic ? client.name : ap.name} has no wireless interface.` };
    get().commit(`Associate ${client.name} with ${ap.name}`, (d) => {
      d.cables = d.cables.filter((c) => !((c.a.device === clientId && c.a.port === nic.name) || (c.b.device === clientId && c.b.port === nic.name)));
      d.cables.push({ id: uid('cbl'), a: { device: clientId, port: nic.name }, b: { device: apId, port: radio.name }, type: 'virtual', disabled: false, label: ap.wireless?.ssid });
    }, [{ deviceId: clientId, level: 'info', text: `WLAN: associated with SSID "${ap.wireless?.ssid}" on ${ap.name} (${ap.wireless?.security.toUpperCase()})` }]);
    return { ok: true };
  },
  addAnnotation(a) {
    const id = uid('note');
    get().commit('Add annotation', (d) => {
      d.annotations = [...(d.annotations ?? []), { ...a, id }];
    });
    return id;
  },
  updateAnnotation(id, patch) {
    get().commit('Edit annotation', (d) => {
      const a = d.annotations?.find((x) => x.id === id);
      if (a) Object.assign(a, patch);
    });
  },
  removeAnnotation(id) {
    get().commit('Delete annotation', (d) => {
      d.annotations = (d.annotations ?? []).filter((x) => x.id !== id);
    });
  },
  addGoal(g) {
    const id = uid('goal');
    get().commit('Add goal', (d) => {
      d.goals = [...(d.goals ?? []), { ...g, id }];
    });
    return id;
  },
  removeGoal(id) {
    get().commit('Remove goal', (d) => {
      d.goals = (d.goals ?? []).filter((x) => x.id !== id);
    });
  },
  startChallenge(c, fn) {
    get().commit(`Challenge: ${c.title}`, (d) => {
      fn(d);
      d.challenge = { id: uid('chl'), title: c.title, brief: c.brief, fault: c.fault, startedAt: new Date().toISOString(), revealed: false };
    });
  },
  revealChallenge() {
    get().commit('Reveal challenge', (d) => {
      if (d.challenge) d.challenge.revealed = true;
    });
  },
  endChallenge() {
    get().commit('End challenge', (d) => {
      d.challenge = undefined;
    });
  },
  importDoc(doc) {
    get().commit('Import lab', (d) => {
      Object.assign(d, clone(doc), { source: d.source });
    });
  },

  saveLayout(name) {
    const s = get();
    if (!s.doc || !name.trim()) return false;
    const all = storageGet<Record<string, SavedLayout>>(keys(s.scope).layouts) ?? {};
    all[name.trim()] = { name: name.trim(), savedAt: new Date().toISOString(), doc: s.doc };
    const ok = storageSet(keys(s.scope).layouts, all);
    if (ok) {
      set({ layoutName: name.trim() });
      autosave(get());
    }
    return ok;
  },
  loadLayout(name) {
    const s = get();
    const l = (storageGet<Record<string, SavedLayout>>(keys(s.scope).layouts) ?? {})[name];
    if (!l) return false;
    get().commit('Load layout', (doc) => {
      Object.assign(doc, clone(l.doc));
    });
    set({ layoutName: name, selection: { devices: [], cables: [] } });
    autosave(get());
    return true;
  },
  deleteLayout(name) {
    const s = get();
    const all = storageGet<Record<string, SavedLayout>>(keys(s.scope).layouts) ?? {};
    delete all[name];
    storageSet(keys(s.scope).layouts, all);
    if (s.layoutName === name) set({ layoutName: null });
  },
  layouts() {
    const all = storageGet<Record<string, SavedLayout>>(keys(get().scope).layouts) ?? {};
    return Object.values(all).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  },
  resetToBaseline() {
    const b = get().baseline;
    set({ basis: get().fresh ? clone(get().fresh!) : get().basis });
    if (!b) return;
    get().commit('Reset to baseline', (doc) => {
      Object.assign(doc, clone(b));
    });
    set({ selection: { devices: [], cables: [] }, layoutName: null, traces: [], activeTrace: null });
  },
  refreshFromLab() {
    const fresh = get().fresh;
    if (!fresh) return;
    get().commit('Refresh from lab', (doc) => {
      const keep = new Map(doc.devices.map((d) => [d.id, d]));
      const inv = fresh.devices.map((f) => {
        const old = keep.get(f.id);
        return old ? { ...clone(f), x: old.x, y: old.y, groupId: old.groupId, rack: old.rack } : clone(f);
      });
      const design = doc.devices.filter((d) => d.origin === 'design');
      doc.devices = [...inv, ...design];
      const ports = new Set(doc.devices.flatMap((d) => d.interfaces.map((i) => `${d.id}/${i.name}`)));
      const designCables = doc.cables.filter((c) => !c.linkId && ports.has(`${c.a.device}/${c.a.port}`) && ports.has(`${c.b.device}/${c.b.port}`));
      doc.cables = [...clone(fresh.cables).map((c) => ({ ...c, bend: doc.cables.find((o) => o.id === c.id)?.bend })), ...designCables];
      doc.sites = [...clone(fresh.sites), ...doc.sites.filter((s) => !fresh.sites.some((f) => f.id === s.id))];
      doc.vlans = [...clone(fresh.vlans), ...doc.vlans.filter((v) => !fresh.vlans.some((f) => f.id === v.id))];
      doc.generatedAt = fresh.generatedAt;
    });
    set({ restoredAt: null, basis: clone(fresh) });
    autosave(get());
  },
  staleCount() {
    // Differences between what the lab reports now and what it reported when this design was started.
    // Edits made on the canvas are not counted: they are the operator's own changes.
    const s = get();
    if (!s.basis || !s.fresh) return 0;
    const inv = (d: LabDoc): LabDoc => ({ ...d, devices: d.devices.filter((x) => x.origin === 'inventory'), cables: d.cables.filter((c) => c.linkId) });
    return diffDocs(inv(s.basis), inv(s.fresh)).filter((d) => d.subject !== 'vlan').length;
  },
}));

/** Feed the latest platform state to the store (keeps the user's draft, flags when it is stale). */
export function setFresh(doc: LabDoc) {
  useLab.setState({ fresh: doc });
}
