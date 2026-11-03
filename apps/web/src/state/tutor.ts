// Shared state for the study tutor. Kept light (no lesson data here) so any page can add an
// "Ask AI" button without loading the tutor. The dock does the thinking.
import { create } from 'zustand';
import type { Detour, Memory, Msg, TutorCtx } from '@/learn/tutorBrain';

const KEY = 'aegis.tutor.v1';
export const emptyMemory = (): Memory => ({ struggled: {}, known: {}, visits: 0 });

type Saved = { memory: Memory; detour: Detour | null };
const load = (): Saved => {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? 'null');
    return { memory: { ...emptyMemory(), ...(v?.memory ?? {}) }, detour: v?.detour ?? null };
  } catch {
    return { memory: emptyMemory(), detour: null };
  }
};

type TutorState = {
  ready: boolean;
  open: boolean;
  ctx: TutorCtx | null;
  msgs: Msg[];
  memory: Memory;
  detour: Detour | null;
  /** A quiet offer to help, shown by the launcher when someone looks stuck. */
  nudge: TutorCtx | null;
  /** Bumped to ask the dock to greet (new context) or welcome back (end of a detour). */
  req: { kind: 'open' | 'back' | 'arrive' | 'welcome' | 'select'; n: number; text?: string } | null;
  /** Lesson id when the next message is a teach-back answer. */
  awaiting: string | null;
  setAwaiting: (id: string | null) => void;
  /** Ask about a highlighted bit of text. */
  askText: (ctx: TutorCtx, text: string) => void;
  /** Record a missed question anywhere in AEGIS, for mistake patterns. */
  miss: (label: string, text: string) => void;
  hydrate: () => void;
  ask: (ctx: TutorCtx) => void;
  close: () => void;
  toggle: () => void;
  setNudge: (ctx: TutorCtx | null) => void;
  push: (m: Omit<Msg, 'id'>[]) => void;
  save: (p: Partial<Pick<TutorState, 'memory' | 'detour'>>) => void;
  endDetour: () => void;
  forget: () => void;
};

let nextId = 1;
export const useTutor = create<TutorState>((set, get) => ({
  ready: false,
  open: false,
  ctx: null,
  msgs: [],
  memory: emptyMemory(),
  detour: null,
  nudge: null,
  req: null,
  awaiting: null,
  setAwaiting: (awaiting) => set({ awaiting }),
  askText: (ctx, text) => set((s) => ({ open: true, ctx, nudge: null, req: { kind: 'select', n: (s.req?.n ?? 0) + 1, text } })),
  miss: (label, text) => {
    const s = get();
    const memory = { ...s.memory, misses: [...(s.memory.misses ?? []), { label, text: text.slice(0, 200), at: new Date().toISOString() }].slice(-80) };
    s.save({ memory });
  },
  hydrate: () => {
    if (get().ready) return;
    set({ ...load(), ready: true });
  },
  ask: (ctx) => set((s) => ({ open: true, ctx, nudge: null, req: { kind: 'open', n: (s.req?.n ?? 0) + 1 } })),
  close: () => set({ open: false }),
  toggle: () => set((s) => ({ open: !s.open, nudge: null, req: !s.open && !s.msgs.length ? { kind: 'welcome', n: (s.req?.n ?? 0) + 1 } : s.req })),
  setNudge: (nudge) => set((s) => (s.open ? s : { nudge })),
  push: (m) => set((s) => ({ msgs: [...s.msgs, ...m.map((x) => ({ ...x, id: nextId++ }))].slice(-60) })),
  save: (p) => {
    set(p);
    const { memory, detour } = { ...get(), ...p };
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ memory, detour }));
    } catch {
      /* storage blocked */
    }
  },
  endDetour: () => set((s) => ({ open: true, req: { kind: 'back', n: (s.req?.n ?? 0) + 1 } })),
  forget: () => {
    const memory = emptyMemory();
    set({ memory, msgs: [] });
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ memory, detour: get().detour }));
    } catch {
      /* storage blocked */
    }
  },
}));
