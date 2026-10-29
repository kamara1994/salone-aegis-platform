// Timed exam builder: draws questions from the topic catalog.
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

export function buildExam(course: CourseId | 'all', count: number, rnd = Math.random): ExamItem[] {
  const pool = ALL_TOPICS.filter((t) => course === 'all' || t.course === course).flatMap((t) => t.quiz.map((q) => ({ ...q, topic: t })));
  return shuffle(pool, rnd).slice(0, count);
}
