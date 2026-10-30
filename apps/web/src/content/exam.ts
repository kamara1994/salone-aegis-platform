// Timed exam builder: draws questions from the topic catalog.
import { certById, certTopics } from './certs';
import { ALL_TOPICS, type CourseId, type ExamDifficulty, type Topic, type TopicQuestion } from './topics';

export function shuffle<T>(a: T[], rnd = Math.random): T[] {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

export interface ExamItem extends TopicQuestion {
  topic: Topic;
}

const DIFFICULTY_RANK: Record<ExamDifficulty, number> = { beginner: 1, intermediate: 2, advanced: 3 };

/** Fills a requested exam with matching questions first, then nearby review questions if the pool is small. */
export function selectExamQuestions<T extends { difficulty?: ExamDifficulty }>(pool: T[], count: number, level: ExamDifficulty, rnd = Math.random): T[] {
  const matching = shuffle(pool.filter((item) => (item.difficulty ?? 'intermediate') === level), rnd);
  if (matching.length >= count) return matching.slice(0, count);
  const remaining = shuffle(pool.filter((item) => (item.difficulty ?? 'intermediate') !== level), rnd)
    .sort((a, b) => Math.abs(DIFFICULTY_RANK[a.difficulty ?? 'intermediate'] - DIFFICULTY_RANK[level]) - Math.abs(DIFFICULTY_RANK[b.difficulty ?? 'intermediate'] - DIFFICULTY_RANK[level]));
  return shuffle([...matching, ...remaining.slice(0, Math.max(0, count - matching.length))], rnd);
}

/** 'all', a course id, 'cert:<certification id>' or 'topic:<topic id>' */
export type ExamScope = CourseId | 'all' | `cert:${string}` | `topic:${string}`;

export function scopeTopics(scope: ExamScope): Topic[] {
  if (scope.startsWith('topic:')) return ALL_TOPICS.filter((t) => t.id === scope.slice(6));
  if (scope.startsWith('cert:')) {
    const c = certById(scope.slice(5));
    return c ? certTopics(c) : [];
  }
  return ALL_TOPICS.filter((t) => scope === 'all' || t.course === scope);
}

export function buildExam(scope: ExamScope, count: number, rnd = Math.random, level: ExamDifficulty = 'intermediate'): ExamItem[] {
  const pool = scopeTopics(scope).flatMap((t) => t.quiz.map((q) => ({ ...q, topic: t })));
  return selectExamQuestions(pool, count, level, rnd);
}
