// Running an Arena attempt: load the initial network, track hints and time, submit and record.
import { create } from 'zustand';
import { useLab } from '../store';
import { gradeArena } from './grade';
import { ARENA_PREFIX, arenaLab } from './index';
import { readArena, updateArena } from './progress';
import type { Attempt, Grade } from './types';

interface ArenaUi {
  /** Open terminal tabs (device ids) and the active one */
  terms: string[];
  activeTerm: string | null;
  termOpen: boolean;
  termHeight: number;
  resultsOpen: boolean;
  /** Grade frozen at submit time, with the attempt it produced */
  submitted: { grade: Grade; attempt: Attempt } | null;
  openTerm(deviceId: string): void;
  closeTerm(deviceId: string): void;
  setTermOpen(v: boolean): void;
  setTermHeight(h: number): void;
  setResultsOpen(v: boolean): void;
  setSubmitted(v: ArenaUi['submitted']): void;
}

export const useArenaUi = create<ArenaUi>((set, get) => ({
  terms: [],
  activeTerm: null,
  termOpen: false,
  termHeight: 280,
  resultsOpen: false,
  submitted: null,
  openTerm(id) {
    const t = get().terms;
    set({ terms: t.includes(id) ? t : [...t, id], activeTerm: id, termOpen: true });
  },
  closeTerm(id) {
    const t = get().terms.filter((x) => x !== id);
    set({ terms: t, activeTerm: get().activeTerm === id ? t[t.length - 1] ?? null : get().activeTerm, termOpen: t.length ? get().termOpen : false });
  },
  setTermOpen: (v) => set({ termOpen: v }),
  setTermHeight: (h) => set({ termHeight: Math.max(160, Math.min(h, 640)) }),
  setResultsOpen: (v) => set({ resultsOpen: v }),
  setSubmitted: (v) => set({ submitted: v }),
}));

/** Puts the keyboard back in the active console (after a dialog closes, so typing never lands on the canvas). */
export function focusTerminal() {
  if (typeof document === 'undefined') return;
  const id = useArenaUi.getState().activeTerm;
  if (!id || !useArenaUi.getState().termOpen) return;
  setTimeout(() => (document.querySelector(`[data-testid="arena-term-${id}"] textarea`) as HTMLTextAreaElement | null)?.focus(), 30);
}

export const activeArenaId = (): string | null => {
  const id = useLab.getState().doc?.workbook?.id;
  return id?.startsWith(ARENA_PREFIX) ? id.slice(ARENA_PREFIX.length) : null;
};

export function startArena(labId: string): boolean {
  const lab = arenaLab(labId);
  if (!lab) return false;
  useLab.getState().startWorkbook(lab.build(), ARENA_PREFIX + lab.id, lab.title);
  updateArena((p) => {
    p.active = { labId, startedAt: new Date().toISOString(), hinted: [] };
  });
  useArenaUi.setState({ terms: [], activeTerm: null, termOpen: false, resultsOpen: false, submitted: null });
  return true;
}

/** The live attempt for the running lab; recreated if storage was cleared mid-lab. */
export function activeAttempt(labId: string) {
  const a = readArena().active;
  if (a?.labId === labId) return a;
  const fresh = { labId, startedAt: useLab.getState().doc?.workbook?.startedAt ?? new Date().toISOString(), hinted: [] as string[] };
  updateArena((p) => {
    p.active = fresh;
  });
  return fresh;
}

export function takeHint(labId: string, itemId: string) {
  activeAttempt(labId);
  updateArena((p) => {
    if (p.active && !p.active.hinted.includes(itemId)) p.active.hinted.push(itemId);
  });
}

export function submitArena(labId: string, timedOut = false): { grade: Grade; attempt: Attempt } | null {
  const lab = arenaLab(labId);
  const st = useLab.getState();
  if (!lab || !st.doc) return null;
  const a = activeAttempt(labId);
  const grade = gradeArena(lab, st.doc, st.log, new Set(a.hinted));
  const now = new Date();
  const attempt: Attempt = {
    labId,
    startedAt: a.startedAt,
    finishedAt: now.toISOString(),
    seconds: Math.max(0, Math.round((now.getTime() - new Date(a.startedAt).getTime()) / 1000)),
    score: grade.score,
    max: grade.max,
    pct: grade.pct,
    hints: a.hinted.length,
    timedOut,
    missed: [...grade.items, ...grade.tests].filter((x) => !x.ok).map((x) => x.id),
  };
  updateArena((p) => {
    p.attempts.push(attempt);
    p.active = undefined;
  });
  const out = { grade, attempt };
  useArenaUi.setState({ submitted: out, resultsOpen: true });
  return out;
}

export function leaveArena() {
  updateArena((p) => {
    p.active = undefined;
  });
  useArenaUi.setState({ terms: [], activeTerm: null, termOpen: false, resultsOpen: false, submitted: null });
  useLab.getState().endWorkbook();
}
