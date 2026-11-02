import { describe, expect, it } from 'vitest';
import book from '../../src/content/books/ccna-v8.1.json';
import recall from '../../src/content/books/ccna-recall-v9.json';

describe('CCNA book content coverage', () => {
  it('has a reading path and a scenario recall check for every lesson and review', () => {
    const lessons = book.lessons as Array<{
      id: string;
      title: string;
      chapterId: string;
      beginner: { definition?: string; analogy?: string };
      technical: { definition?: string; explanation?: string };
      teaching?: { problem?: string; steps?: { text: string }[]; result?: string; verify?: string };
      assessments?: unknown;
    }>;
    const ids = new Set(lessons.map((lesson) => lesson.id));
    expect(ids.size).toBe(233);
    expect(Object.keys(recall).sort()).toEqual([...ids].sort());

    for (const lesson of lessons) {
      const chapter = book.chapters.find((entry) => entry.id === lesson.chapterId);
      expect(chapter?.lessonIds).toContain(lesson.id);
      expect(lesson.beginner.definition?.length).toBeGreaterThan(12);
      expect(lesson.technical.definition?.length).toBeGreaterThan(12);
      expect(lesson.assessments).toBeUndefined(); // obsolete off-topic distractors must stay out
      const items = recall[lesson.id as keyof typeof recall];
      expect(items.length).toBeGreaterThanOrEqual(3);
      for (const item of items) {
        expect(item.prompt.length).toBeGreaterThan(25);
        expect(item.beginnerAnswer.length).toBeGreaterThan(25);
        expect(item.technicalAnswer.length).toBeGreaterThan(25);
      }
      if (lesson.teaching) {
        expect(lesson.teaching.problem?.length).toBeGreaterThan(15);
        expect(lesson.teaching.steps?.length).toBeGreaterThanOrEqual(2);
        expect(lesson.teaching.result?.length).toBeGreaterThan(15);
        expect(lesson.teaching.verify?.length).toBeGreaterThan(15);
      }
    }
  });
});
