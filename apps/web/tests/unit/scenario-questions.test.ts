import { describe, expect, it } from 'vitest';
import { forTopic, scenarioQuestions } from '@/content/scenarioQuestions';
import { certById } from '@/content/certs';
import { scopeTopics } from '@/content/exam';
import { ALL_TOPICS } from '@/content/topics';

describe('scenario questions', () => {
  it('every dashboard question has a valid answer and an explanation', () => {
    for (const id of ['networking', 'soc', 'pentest', 'security', 'it-support']) {
      const qs = scenarioQuestions(certById(id)!.games);
      expect(qs.length, id).toBeGreaterThan(0);
      for (const q of qs) {
        expect(q.options[q.answer]).toBeTruthy();
        expect(q.explain.length).toBeGreaterThan(0);
      }
    }
  });
  it('topic filter keeps matching cases or returns none', () => {
    const qs = scenarioQuestions(certById('networking')!.games);
    const vlan = forTopic(qs, ALL_TOPICS.find((t) => t.id === 'vlans'));
    expect(vlan.length).toBeLessThanOrEqual(qs.length);
  });
  it('a topic scope draws from that one topic', () => {
    expect(scopeTopics('topic:vlans').map((t) => t.id)).toEqual(['vlans']);
  });
});
