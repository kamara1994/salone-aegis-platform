import { describe, expect, it } from 'vitest';
import { initialLab } from '@/mock/lab';
import { BEHAVIOURS, PACKS, type RunCtx } from '@/mock/scenarios';

// Checks that depend on what the operator does in the platform rather than lab state.
const RUN_DEPENDENT = new Set(['classified', 'verified', 'no-reset']);
const run = (): RunCtx => ({ startedAt: new Date().toISOString(), identityChecks: [] });

describe('scenario packs (Contract 4)', () => {
  it('every pack has a behaviour and every check has an implementation', () => {
    for (const p of PACKS) {
      const b = BEHAVIOURS[p.id];
      expect(b, p.id).toBeDefined();
      for (const c of p.checks) expect(b.checks[c.id], `${p.id}/${c.id}`).toBeTypeOf('function');
    }
  });

  it('every rubric sums to 100', () => {
    for (const p of PACKS) expect(Object.values(p.debrief.rubric).reduce((a, b) => a + b, 0), p.id).toBe(100);
  });

  for (const p of PACKS) {
    it(`${p.id}: inject breaks at least one lab check, cleanup restores all of them`, () => {
      const b = BEHAVIOURS[p.id];
      const labChecks = p.checks.filter((c) => !RUN_DEPENDENT.has(c.id));
      const lab = initialLab();
      b.inject(lab);
      const ctx = run();
      if (labChecks.length && p.id !== 'onb-new-hire-finance') {
        expect(labChecks.some((c) => !b.checks[c.id](lab, ctx).passed), 'fault visible').toBe(true);
      }
      b.cleanup(lab);
      // Onboarding asks the operator to create something new, so its checks only pass after real work.
      if (p.id === 'onb-new-hire-finance') return;
      for (const c of labChecks) expect(b.checks[c.id](lab, ctx).passed, `${c.id} after cleanup`).toBe(true);
    });
  }
});
