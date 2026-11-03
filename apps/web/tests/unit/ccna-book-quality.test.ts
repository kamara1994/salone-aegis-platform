import { describe, expect, it } from 'vitest';
import book from '../../src/content/books/ccna-v8.1.json';

describe('CCNA book reading coverage', () => {
  it('has a reading path, two distinct explanations, and a worked example for every topic', () => {
    const ids = new Set(book.lessons.map((lesson) => lesson.id));
    expect(ids.size).toBe(233);
    for (const lesson of book.lessons) {
      const chapter = book.chapters.find((entry) => entry.id === lesson.chapterId);
      expect(chapter?.lessonIds).toContain(lesson.id);
      expect(lesson.beginner.definition.length).toBeGreaterThan(12);
      expect(lesson.technical.definition.length).toBeGreaterThan(12);
      expect(lesson.beginner.definition).not.toBe(lesson.technical.definition);
      expect(lesson.learningJourney.stages.at(-1)).toBe('recap');
      expect(lesson.learningJourney.stages).not.toContain('assessment');
      expect(lesson.learningJourney.stages).not.toContain('interview');
      expect(lesson).not.toHaveProperty('assessments');
      expect(lesson).not.toHaveProperty('quiz');
      if (lesson.learningJourney.kind === 'reading') {
        expect(lesson.teaching?.problem?.length).toBeGreaterThan(15);
        expect(lesson.teaching?.steps?.length).toBeGreaterThanOrEqual(2);
        expect(lesson.teaching?.result?.length).toBeGreaterThan(15);
        expect(lesson.depthV8?.concept?.length).toBeGreaterThan(30);
      }
    }
  });
});
