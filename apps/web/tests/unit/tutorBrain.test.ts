import { describe, expect, it } from 'vitest';
import { act, chat, findPair, gradeTeach, keyIdeas, lessonById, mapReply, patterns, resolveLesson, welcome, type Memory } from '@/learn/tutorBrain';

const mem = (): Memory => ({ struggled: {}, known: {}, visits: 0 });

describe('tutor brain', () => {
  it('finds the right lesson for a flashcard', () => {
    expect(resolveLesson({ kind: 'Flashcard', label: 'VLANs', text: 'What is a VLAN?' })?.id).toBe('8.01');
  });

  it('matches common mix-ups in either order', () => {
    expect(findPair('access | trunk')).toBeGreaterThanOrEqual(0);
    expect(findPair('UDP | TCP')).toBeGreaterThanOrEqual(0);
    expect(findPair('OSPF | BGP')).toBe(-1);
  });

  it('answers "X vs Y" with a comparison table', () => {
    const r = chat('TCP vs UDP', { kind: '', label: '' }, mem(), null);
    expect(r.msgs[0].table?.head).toEqual(['', 'TCP', 'UDP']);
  });

  it('grades a teach-back on key ideas and clears the teach-back mode', () => {
    const l = lessonById('8.01')!;
    const ideas = keyIdeas(l);
    expect(ideas.length).toBeGreaterThan(0);
    const good = gradeTeach(`A VLAN ${ideas.join(' ')} on the same switch`, l, mem());
    expect(good.msgs[0].tone).toBe('ok');
    expect(good.await).toBeNull();
    const weak = gradeTeach('it is a thing', l, mem());
    expect(weak.msgs[0].tone).toBe('bad');
  });

  it('routes the next message to teach-back when asked', () => {
    const r = act({ k: 'teach' }, { kind: 'Lesson', label: 'VLANs', lessonId: '8.01' }, mem(), null);
    expect(r.await).toBe('8.01');
  });

  it('draws the topic map with the current lesson in the middle', () => {
    const r = mapReply(lessonById('8.01')!, mem());
    const nodes = r.msgs[0].map!;
    expect(nodes.some((n) => n.here)).toBe(true);
    expect(nodes.findIndex((n) => n.here)).toBeGreaterThan(0);
  });

  it('spots a repeated mix-up and offers it on the next visit', () => {
    const m: Memory = { ...mem(), misses: [1, 2, 3].map((i) => ({ label: 'VLANs', text: `trunk question ${i}`, at: '' })) };
    expect(patterns(m)[0]?.n).toBe(3);
    expect(welcome(m).msgs[0].actions?.[0].a.k).toBe('compare');
  });
});
