// Timed exam builder: draws questions from the topic catalog.
import { certById, certTopics } from './certs';
import { ALL_TOPICS, type CourseId, type Topic, type TopicQuestion } from './topics';

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

/** 'all', a course id, or 'cert:<certification id>' */
export type ExamScope = CourseId | 'all' | `cert:${string}`;

export function scopeTopics(scope: ExamScope): Topic[] {
  if (scope.startsWith('cert:')) {
    const c = certById(scope.slice(5));
    return c ? certTopics(c) : [];
  }
  return ALL_TOPICS.filter((t) => scope === 'all' || t.course === scope);
}

export function buildExam(scope: ExamScope, count: number, rnd = Math.random): ExamItem[] {
  const pool = scopeTopics(scope).flatMap((t) => t.quiz.map((q) => ({ ...q, topic: t })));
  return shuffle(pool, rnd).slice(0, count);
}
