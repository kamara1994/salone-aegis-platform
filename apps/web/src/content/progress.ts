// Local-only progress, bookmarks and imported content packs. Everything lives in this browser's
// storage; nothing is sent anywhere. Export/import lets the user move it between machines.
import type { GameTemplate, Lesson } from './types';

const KEY = 'aegis.learn.progress.v1';
const PACKS = 'aegis.content.packs.v1';

export interface LessonProgress {
  section: number;
  visited: string[];
  quiz: Record<string, { correct: number; total: number }>;
  trainer: Record<string, number>;
  done: boolean;
  updatedAt: string;
}
export interface GameResult {
  template: string;
  caseId: string;
  score: number;
  max: number;
  at: string;
  breakdown: Record<string, number>;
}
export interface Progress {
  version: 1;
  lessons: Record<string, LessonProgress>;
  bookmarks: { lesson: string; section: string; note?: string; at: string }[];
  games: GameResult[];
  notes: Record<string, string>;
  mode: 'watch' | 'guided' | 'independent';
  level: 'beginner' | 'advanced';
  /** Topic catalog: chosen teaching level and the end-of-topic exam result */
  topics?: Record<string, { level?: 'simple' | 'technical' | 'advanced'; score?: number; total?: number; at: string }>;
  /** Timed exams taken */
  exams?: { course: string; score: number; total: number; minutes: number; at: string }[];
  /** Preferred teaching level for new topics */
  teach?: 'simple' | 'technical' | 'advanced';
}

const empty = (): Progress => ({ version: 1, lessons: {}, bookmarks: [], games: [], notes: {}, mode: 'guided', level: 'beginner' });

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, v: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

export function loadProgress(): Progress {
  if (typeof window === 'undefined') return empty();
  const p = read<Progress>(KEY);
  return p?.version === 1 ? { ...empty(), ...p } : empty();
}
export function saveProgress(p: Progress) {
  write(KEY, p);
}
export function updateProgress(fn: (p: Progress) => void): Progress {
  const p = loadProgress();
  fn(p);
  saveProgress(p);
  return p;
}
export function lessonProgress(p: Progress, id: string): LessonProgress {
  return p.lessons[id] ?? { section: 0, visited: [], quiz: {}, trainer: {}, done: false, updatedAt: '' };
}

// ---------------- content packs ----------------

export interface ContentPack {
  format: 'aegis-content-pack';
  version: 1;
  name: string;
  description?: string;
  createdAt: string;
  lessons?: Lesson[];
  games?: GameTemplate[];
  labs?: { name: string; doc: unknown }[];
}

export function loadPacks(): ContentPack[] {
  if (typeof window === 'undefined') return [];
  return read<ContentPack[]>(PACKS) ?? [];
}

/** Validates the shape of a pack (data only; no code is ever executed from a pack). */
export function validatePack(x: unknown): { ok: true; pack: ContentPack } | { ok: false; error: string } {
  const p = x as ContentPack;
  if (!p || p.format !== 'aegis-content-pack' || p.version !== 1) return { ok: false, error: 'not an AEGIS content pack (format aegis-content-pack, version 1)' };
  if (!p.name || typeof p.name !== 'string') return { ok: false, error: 'the pack has no name' };
  for (const l of p.lessons ?? []) {
    if (!l.id || !l.title || !Array.isArray(l.sections) || !l.sections.length) return { ok: false, error: `lesson ${l.id ?? '?'} needs id, title and sections` };
    for (const s of l.sections) if (!s.id || !Array.isArray(s.blocks)) return { ok: false, error: `lesson ${l.id}: section ${s.id ?? '?'} needs id and blocks` };
  }
  for (const g of p.games ?? []) {
    if (!g.id || !g.title || !Array.isArray(g.cases) || !g.cases.length) return { ok: false, error: `game ${g.id ?? '?'} needs id, title and cases` };
    for (const c of g.cases) if (!c.id || !c.opening || !Array.isArray(c.diagnoses) || !Array.isArray(c.fixes)) return { ok: false, error: `game ${g.id}: case ${c.id ?? '?'} is incomplete` };
  }
  for (const l of p.labs ?? []) {
    const d = l?.doc as { version?: number; devices?: unknown; cables?: unknown } | undefined;
    if (!l?.name || d?.version !== 1 || !Array.isArray(d.devices) || !Array.isArray(d.cables)) return { ok: false, error: `lab ${l?.name ?? '?'} is not an AEGIS lab file (version 1)` };
  }
  const size = JSON.stringify(p).length;
  if (size > 2_000_000) return { ok: false, error: 'packs are limited to 2 MB' };
  return { ok: true, pack: p };
}

export function installPack(pack: ContentPack): boolean {
  const packs = loadPacks().filter((x) => x.name !== pack.name);
  return write(PACKS, [...packs, pack]);
}
export function removePack(name: string) {
  write(PACKS, loadPacks().filter((x) => x.name !== name));
}

export function exportProgressFile(): string {
  return JSON.stringify({ format: 'aegis-progress', exportedAt: new Date().toISOString(), progress: loadProgress() }, null, 2);
}
export function importProgressFile(text: string): { ok: boolean; error?: string } {
  try {
    const x = JSON.parse(text) as { format?: string; progress?: Progress };
    if (x.format !== 'aegis-progress' || x.progress?.version !== 1) return { ok: false, error: 'not an AEGIS progress file' };
    saveProgress({ ...empty(), ...x.progress });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
