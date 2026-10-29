// Scoring for the triage games. Pure functions so they can be unit-tested and reused by imported packs.
import type { GameCase, Impact, Urgency } from './types';

export const URGENCY: Urgency[] = ['low', 'medium', 'high', 'critical'];
export const IMPACT: Impact[] = ['individual', 'team', 'department', 'organization'];

export interface PlayState {
  urgency?: Urgency;
  impact?: Impact;
  asked: string[];
  opened: string[];
  diagnosis?: string;
  fix?: string;
  escalation?: string;
  note: string;
  hintsUsed: number;
  elapsedMs: number;
}

/** Points available per category; they add up to 100. */
export const MAX = { urgency: 10, impact: 10, questions: 12, evidence: 13, diagnosis: 15, fix: 15, escalation: 10, documentation: 8, communication: 4, time: 3 } as const;
export type Category = keyof typeof MAX;

const ladder = <T>(list: T[], got: T | undefined, want: T, max: number) => {
  if (got === undefined) return 0;
  const d = Math.abs(list.indexOf(got) - list.indexOf(want));
  return d === 0 ? max : d === 1 ? Math.round(max / 2) : 0;
};

const BLAME = /\b(stupid|idiot|user error|their fault|dumb|pebkac)\b/i;

export function scoreCase(c: GameCase, s: PlayState) {
  const b: Record<Category, number> = { urgency: 0, impact: 0, questions: 0, evidence: 0, diagnosis: 0, fix: 0, escalation: 0, documentation: 0, communication: 0, time: 0 };
  b.urgency = ladder(URGENCY, s.urgency, c.urgency, MAX.urgency);
  b.impact = ladder(IMPACT, s.impact, c.impact, MAX.impact);

  const useful = c.questions.filter((q) => q.useful);
  const askedUseful = useful.filter((q) => s.asked.includes(q.id)).length;
  const askedWaste = c.questions.filter((q) => !q.useful && s.asked.includes(q.id)).length;
  b.questions = Math.max(0, Math.round((useful.length ? askedUseful / useful.length : 1) * MAX.questions) - askedWaste * 2);

  const key = c.evidence.filter((e) => e.key);
  const openedKey = key.filter((e) => s.opened.includes(e.id)).length;
  const openedExtra = c.evidence.filter((e) => !e.key && s.opened.includes(e.id)).length;
  b.evidence = Math.max(0, Math.round((key.length ? openedKey / key.length : 1) * MAX.evidence) - openedExtra);

  b.diagnosis = c.diagnoses.find((d) => d.id === s.diagnosis)?.correct ? MAX.diagnosis : 0;
  b.fix = c.fixes.find((f) => f.id === s.fix)?.correct ? MAX.fix : 0;
  b.escalation = s.escalation === c.escalation.correct ? MAX.escalation : 0;

  const note = s.note.toLowerCase();
  const hits = c.noteKeywords.filter((k) => note.includes(k.toLowerCase()));
  b.documentation = c.noteKeywords.length ? Math.round((hits.length / c.noteKeywords.length) * MAX.documentation) : MAX.documentation;

  const sentences = s.note.split(/[.!?\n]+/).filter((x) => x.trim().split(/\s+/).length >= 3).length;
  b.communication = BLAME.test(s.note) ? 0 : sentences >= 2 ? MAX.communication : sentences === 1 ? 2 : 0;

  const mins = s.elapsedMs / 60000;
  b.time = mins <= c.minutes ? MAX.time : mins <= c.minutes * 2 ? 1 : 0;

  const hintPenalty = s.hintsUsed * 3;
  const raw = Object.values(b).reduce((a, x) => a + x, 0);
  return { breakdown: b, hintPenalty, missedKeywords: c.noteKeywords.filter((k) => !hits.includes(k)), score: Math.max(0, raw - hintPenalty), max: 100 };
}
