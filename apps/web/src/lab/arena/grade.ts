// Scores an Arena lab against the live design: weighted assessment items plus connectivity tests.
// A hinted item earns half its points. Nothing here reads what the student typed, only the result.
import { makeCtx } from '../workbooks';
import type { LabDoc } from '../types';
import type { ArenaLab, Grade, ItemResult, TestResult } from './types';

export const HINT_FACTOR = 0.5;

export function gradeArena(lab: ArenaLab, doc: LabDoc, log: { deviceId: string; text: string }[], hinted: ReadonlySet<string> = new Set()): Grade {
  const ctx = makeCtx(doc, log);
  const items: ItemResult[] = lab.items.map((it) => {
    let ok = false;
    let detail: string | undefined;
    try {
      const r = it.check(ctx);
      const v = typeof r === 'boolean' ? { ok: r } : r;
      ok = v.ok;
      detail = v.detail;
    } catch (e) {
      detail = `could not check: ${(e as Error).message}`;
    }
    const h = hinted.has(it.id);
    return { id: it.id, group: it.group, text: it.text, points: it.points, earned: ok ? (h ? Math.round(it.points * HINT_FACTOR) : it.points) : 0, ok, detail, hinted: h };
  });
  const tests: TestResult[] = lab.tests.map((t) => {
    let reached = false;
    let detail: string | undefined;
    try {
      const r = t.proto === 'tcp' ? ctx.tcp(t.src, t.dst, t.port ?? 80) : ctx.ping(t.src, t.dst);
      reached = r.ok;
      detail = r.detail;
    } catch (e) {
      detail = `could not run: ${(e as Error).message}`;
    }
    const ok = t.expect === 'reach' ? reached : !reached;
    return { id: t.id, label: t.label, points: t.points, earned: ok ? t.points : 0, ok, detail: ok ? undefined : t.expect === 'reach' ? detail ?? 'no reply' : 'traffic got through but should be blocked' };
  });
  const max = [...items, ...tests].reduce((n, x) => n + x.points, 0);
  const score = [...items, ...tests].reduce((n, x) => n + x.earned, 0);
  const total = items.length + tests.length;
  const okCount = items.filter((x) => x.ok).length + tests.filter((x) => x.ok).length;
  return { items, tests, score, max, pct: max ? Math.round((score / max) * 100) : 0, completion: total ? Math.round((okCount / total) * 100) : 0 };
}

/** Groups item results by their tree path for the Packet Tracer style assessment tree. */
export function itemTree(items: ItemResult[]): { group: string; items: ItemResult[]; earned: number; points: number }[] {
  const map = new Map<string, ItemResult[]>();
  for (const i of items) map.set(i.group, [...(map.get(i.group) ?? []), i]);
  return [...map.entries()].map(([group, list]) => ({ group, items: list, earned: list.reduce((n, x) => n + x.earned, 0), points: list.reduce((n, x) => n + x.points, 0) }));
}
