// Lab Arena attempt history: every submitted attempt, best score per lab and topic mastery.
// Stored in this browser only, like the rest of Learn progress.
import { useSyncExternalStore } from 'react';
import type { ArenaLab, Attempt } from './types';

const KEY = 'aegis.arena.v1';
export interface ArenaProgress {
  version: 1;
  attempts: Attempt[];
  /** Live attempt state, so a reload keeps the timer and the hints you used. */
  active?: { labId: string; startedAt: string; hinted: string[]; /** simlet answers by question id */ answers?: Record<string, string[]> };
}

const empty = (): ArenaProgress => ({ version: 1, attempts: [] });
let cache: ArenaProgress | null = null;
const listeners = new Set<() => void>();

export function readArena(): ArenaProgress {
  if (cache) return cache;
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as ArenaProgress) : empty();
    cache = p && p.version === 1 && Array.isArray(p.attempts) ? p : empty();
  } catch {
    cache = empty();
  }
  return cache;
}

export function updateArena(fn: (p: ArenaProgress) => void) {
  const next = structuredClone(readArena());
  fn(next);
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: keep it for this session */
  }
  listeners.forEach((l) => l());
}

export function useArena(): ArenaProgress {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    readArena,
    empty,
  );
}

/** For tests */
export function resetArenaCache() {
  cache = null;
}

export const attemptsFor = (p: ArenaProgress, labId: string) => p.attempts.filter((a) => a.labId === labId);
export const bestFor = (p: ArenaProgress, labId: string) => attemptsFor(p, labId).reduce<Attempt | undefined>((b, a) => (!b || a.pct > b.pct ? a : b), undefined);

/** Mastery for a topic: average of the best score on each lab (unattempted labs count as 0). */
export function topicMastery(p: ArenaProgress, labs: ArenaLab[]): { pct: number; done: number; total: number } {
  if (!labs.length) return { pct: 0, done: 0, total: 0 };
  const best = labs.map((l) => bestFor(p, l.id)?.pct ?? 0);
  return { pct: Math.round(best.reduce((a, b) => a + b, 0) / labs.length), done: best.filter((b) => b >= 80).length, total: labs.length };
}

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
