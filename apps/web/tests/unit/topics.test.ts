import { describe, expect, it } from 'vitest';
import { BUILTIN_LESSONS } from '@/content';
import { GAME_TEMPLATES } from '@/content/games';
import { ALL_TOPICS, COURSES } from '@/content/topics';
import { CHALLENGES } from '@/lab/challenges';
import { WORKBOOKS } from '@/lab/workbooks';

describe('topic catalog', () => {
  it('has hundreds of topics across every course', () => {
    expect(ALL_TOPICS.length).toBeGreaterThanOrEqual(200);
    for (const c of COURSES) expect(ALL_TOPICS.filter((t) => t.course === c.id).length, c.id).toBeGreaterThanOrEqual(8);
  });
  it('ids are unique and every topic is complete', () => {
    const ids = ALL_TOPICS.map((t) => t.id);
    expect(new Set(ids).size, ids.filter((x, i) => ids.indexOf(x) !== i).join()).toBe(ids.length);
    for (const t of ALL_TOPICS) {
      for (const lvl of [t.simple, t.technical, t.advanced]) expect(lvl.length, `${t.id} level text`).toBeGreaterThan(60);
      expect(t.terms.length, t.id).toBeGreaterThanOrEqual(3);
      expect(t.quiz.length, t.id).toBeGreaterThanOrEqual(3);
      for (const q of t.quiz) {
        expect(q.answer, `${t.id}: ${q.q}`).toBeLessThan(q.options.length);
        expect(new Set(q.options).size, `${t.id}: duplicate options`).toBe(q.options.length);
      }
    }
  });
  it('lab, game and lesson links all resolve', () => {
    for (const t of ALL_TOPICS) {
      if (t.lab?.workbook) expect(WORKBOOKS.some((w) => w.id === t.lab!.workbook), `${t.id} workbook ${t.lab.workbook}`).toBe(true);
      if (t.lab?.challenge) expect(CHALLENGES.some((c) => c.id === t.lab!.challenge), `${t.id} challenge ${t.lab.challenge}`).toBe(true);
      if (t.lab?.game) expect(GAME_TEMPLATES.some((g) => g.id === t.lab!.game), `${t.id} game ${t.lab.game}`).toBe(true);
      if (t.lesson) expect(BUILTIN_LESSONS.some((l) => l.id === t.lesson), `${t.id} lesson ${t.lesson}`).toBe(true);
    }
  });
});

describe('timed exams', () => {
  it('draws unique questions from the chosen course', async () => {
    const { buildExam } = await import('@/content/exam');
    const items = buildExam('networking', 20, () => 0.42);
    expect(items).toHaveLength(20);
    expect(items.every((q) => q.topic.course === 'networking')).toBe(true);
    expect(new Set(items.map((q) => q.q)).size).toBe(20);
    expect(buildExam('all', 1000).length).toBeGreaterThan(600);
  });
});
