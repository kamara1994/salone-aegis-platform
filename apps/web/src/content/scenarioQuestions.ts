// Scenario questions: built from the ticket cases in Games (cause, fix, escalation). Original content, not exam questions.
import { allGames } from './index';
import { shuffle } from './exam';
import type { GameCase, GameTemplate } from './types';
import type { Topic } from './topics';

export interface ScenarioQuestion {
  id: string;
  game: GameTemplate;
  kase: GameCase;
  stage: 'cause' | 'fix' | 'escalate';
  stem: string;
  options: string[];
  answer: number;
  explain: string;
}

export const STAGE_LABEL = { cause: 'Find the cause', fix: 'Choose the fix', escalate: 'Escalate or not' } as const;

/** Scenario questions come from the dashboard's own ticket cases: what caused it, how to fix it, whether to escalate. */
export function scenarioQuestions(gameIds: string[], rnd = Math.random): ScenarioQuestion[] {
  const out: ScenarioQuestion[] = [];
  for (const g of allGames().filter((x) => gameIds.includes(x.id))) {
    for (const c of g.cases) {
      const key = c.evidence.find((e) => e.key);
      const context = `${c.caller.name} (${c.caller.role}, by ${c.channel}): “${c.opening}”${key ? `\n\n${key.title}: ${key.content.split('\n').slice(0, 4).join(' ')}` : ''}`;
      const dx = shuffle(c.diagnoses, rnd);
      out.push({ id: `${c.id}:cause`, game: g, kase: c, stage: 'cause', stem: `${context}\n\nWhat is the most likely cause?`, options: dx.map((d) => d.text), answer: dx.findIndex((d) => d.correct), explain: c.diagnoses.find((d) => d.correct)?.why ?? '' });
      const fx = shuffle(c.fixes, rnd);
      out.push({ id: `${c.id}:fix`, game: g, kase: c, stage: 'fix', stem: `${c.caller.name}: “${c.opening}”\n\nThe cause is confirmed: ${c.diagnoses.find((d) => d.correct)?.text}. What is the right fix?`, options: fx.map((f) => f.text), answer: fx.findIndex((f) => f.correct), explain: c.fixes.find((f) => f.correct)?.why ?? '' });
      const opts = c.escalation.options.map((o) => (o === 'none' ? 'No, handle it yourself' : `Yes: ${o}`));
      const ans = c.escalation.options.indexOf(c.escalation.correct);
      if (ans >= 0) out.push({ id: `${c.id}:escalate`, game: g, kase: c, stage: 'escalate', stem: `${c.caller.name}: “${c.opening}”\n\nShould this ticket be escalated, and to whom?`, options: opts, answer: ans, explain: c.escalation.why });
    }
  }
  return out.filter((q) => q.answer >= 0);
}

/** Keeps questions whose case mentions the topic; empty when nothing matches. */
export function forTopic(list: ScenarioQuestion[], topic?: Topic): ScenarioQuestion[] {
  if (!topic) return list;
  const words = [topic.title, ...topic.terms.map(([t]) => t)].flatMap((w) => w.toLowerCase().split(/[^a-z0-9.+]+/)).filter((w) => w.length > 3);
  const hay = (c: GameCase) => [c.opening, ...c.diagnoses.map((d) => d.text), ...c.fixes.map((f) => f.text), ...c.evidence.map((e) => e.content)].join(' ').toLowerCase();
  return list.filter((q) => words.some((w) => hay(q.kase).includes(w)));
}

