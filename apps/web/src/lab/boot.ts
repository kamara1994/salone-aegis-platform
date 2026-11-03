// Live hardware state that is not part of the saved design: boot (power-on self-test), spanning
// tree listening/learning after a link comes up, the LED mode each switch shows, and which view
// and port the operator is looking at. Times are sped up so a lab does not stall; the real values
// are shown next to them.
import { useEffect } from 'react';
import { create } from 'zustand';
import type { LedMode } from './panels';
import { useLab } from './store';
import type { Device, LabDoc } from './types';

/** Simulated durations in ms, with what real hardware takes. */
export const BOOT_MS: Record<string, { ms: number; real: string }> = {
  switch: { ms: 6000, real: 'about 90 seconds' },
  router: { ms: 7000, real: 'about 2 minutes' },
  firewall: { ms: 6000, real: 'about 2 minutes' },
  server: { ms: 5000, real: '1 to 3 minutes' },
  default: { ms: 2500, real: '20 to 60 seconds' },
};
export const STP_MS = { pvst: 5000, rapid: 1194, real: '30 seconds (15 s listening + 15 s learning)' };

export type LabView = 'logical' | 'physical' | 'rack';
export type Phase = 'off' | 'post' | 'stp' | 'ready' | 'fault';

interface BootState {
  /** Device id -> time the power came on */
  boots: Record<string, number>;
  /** "device|port" -> time the link came up (for STP listening/learning) */
  links: Record<string, number>;
  now: number;
  view: LabView;
  focus: { device: string; port: string } | null;
  modes: Record<string, LedMode>;
  start(id: string): void;
  skip(id: string): void;
  linkUp(device: string, port: string): void;
  tick(): void;
  setView(v: LabView): void;
  setFocus(f: { device: string; port: string } | null): void;
  cycleMode(device: string, modes: LedMode[]): void;
}

export const useBoot = create<BootState>((set, get) => ({
  boots: {},
  links: {},
  now: Date.now(),
  view: 'logical',
  focus: null,
  modes: {},
  start(id) {
    set((s) => ({ boots: { ...s.boots, [id]: Date.now() }, now: Date.now() }));
  },
  skip(id) {
    set((s) => {
      const boots = { ...s.boots };
      delete boots[id];
      const links = Object.fromEntries(Object.entries(s.links).filter(([k]) => !k.startsWith(`${id}|`)));
      return { boots, links };
    });
  },
  linkUp(device, port) {
    set((s) => ({ links: { ...s.links, [`${device}|${port}`]: Date.now() }, now: Date.now() }));
  },
  tick() {
    const now = Date.now();
    const s = get();
    // Drop finished timers so the clock can stop.
    const boots = Object.fromEntries(Object.entries(s.boots).filter(([, t]) => now - t < 20_000));
    const links = Object.fromEntries(Object.entries(s.links).filter(([, t]) => now - t < 20_000));
    set({ now, boots, links });
  },
  setView(view) {
    set({ view });
  },
  setFocus(focus) {
    set({ focus });
  },
  cycleMode(device, modes) {
    if (!modes.length) return;
    const cur = get().modes[device] ?? modes[0];
    set((s) => ({ modes: { ...s.modes, [device]: modes[(modes.indexOf(cur) + 1) % modes.length] } }));
  },
}));

export const bootSpec = (d: Pick<Device, 'kind'>) => BOOT_MS[d.kind] ?? BOOT_MS.default;

/** Where a device is in its power-on sequence. */
export function phaseOf(d: Device, boots: Record<string, number>, now: number): { phase: Phase; pct: number } {
  if (d.power === 'stopped') return { phase: 'off', pct: 0 };
  const t = boots[d.id];
  if (t !== undefined) {
    const el = now - t;
    const post = bootSpec(d).ms;
    if (el < post) return { phase: 'post', pct: Math.round((el / post) * 100) };
  }
  if (d.health === 'down') return { phase: 'fault', pct: 100 };
  return { phase: 'ready', pct: 100 };
}

/** True while a switch port is still in STP listening/learning after its link came up. */
export function learningOf(doc: LabDoc, d: Device, port: string, s: Pick<BootState, 'boots' | 'links' | 'now'>): boolean {
  if (d.kind !== 'switch' || d.stp?.enabled === false) return false;
  const i = d.interfaces.find((x) => x.name === port);
  if (!i || i.portfast || i.type === 'console') return false;
  const rapid = d.stp?.mode === 'rapid-pvst' || d.stp?.mode === 'mst';
  const dur = rapid ? STP_MS.rapid : STP_MS.pvst;
  const bootAt = s.boots[d.id];
  const starts = [s.links[`${d.id}|${port}`], bootAt !== undefined ? bootAt + bootSpec(d).ms : undefined].filter((x): x is number => x !== undefined);
  return starts.some((t) => s.now >= t && s.now - t < dur);
}

/** Re-render every 250 ms while anything is booting or converging. */
export function useBootClock() {
  const busy = useBoot((s) => Object.keys(s.boots).length + Object.keys(s.links).length > 0);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => useBoot.getState().tick(), 250);
    return () => clearInterval(t);
  }, [busy]);
}

// Watch the design: power coming on starts a boot, a new cable on a switch port starts STP.
if (typeof window !== 'undefined') {
  useLab.subscribe((s, prev) => {
    if (!s.doc || !prev.doc || s.doc === prev.doc) return;
    if (s.scope !== prev.scope) return;
    const was = new Map(prev.doc.devices.map((d) => [d.id, d.power]));
    const b = useBoot.getState();
    for (const d of s.doc.devices) {
      if (d.power === 'running' && was.get(d.id) === 'stopped') b.start(d.id);
      // A factory-new device boots the moment it is racked and powered.
      else if (!was.has(d.id) && d.factory && d.power === 'running') b.start(d.id);
    }
    const before = new Set(prev.doc.cables.map((c) => c.id));
    for (const c of s.doc.cables) {
      if (before.has(c.id)) continue;
      for (const e of [c.a, c.b]) {
        const d = s.doc.devices.find((x) => x.id === e.device);
        if (d?.kind === 'switch') b.linkUp(d.id, e.port);
      }
    }
  });
}
