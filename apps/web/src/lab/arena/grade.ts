// Scores an Arena lab against the live design: weighted assessment items plus connectivity tests.
// A hinted item earns half its points. Nothing here reads what the student typed, only the result.
import { MODEL_BY_KEY } from '../catalog';
import { makeCtx } from '../workbooks';
import type { LabDoc } from '../types';
import { cableStatus } from '../validate';
import type { ArenaLab, Grade, ItemResult, QuestionResult, TestResult } from './types';

export const HINT_FACTOR = 0.5;
const DEVICE_POINTS = 2;
const CABLE_POINTS = 2;

/** Build labs start from an empty canvas; troubleshooting and simlets start from the given network. */
export const startsBlank = (lab: ArenaLab) => (lab.start ?? (lab.kind === 'troubleshoot' || lab.kind === 'simlet' ? 'built' : 'blank')) === 'blank';

/**
 * Blank-canvas labs: the student builds the network, the lab's build() is the reference.
 * Devices are matched by hostname (like Packet Tracer assessments), then the student's design is
 * re-keyed to the reference ids so every config check and connectivity test runs unchanged.
 */
export function matchReference(ref: LabDoc, doc: LabDoc): { doc: LabDoc; items: ItemResult[] } {
  const norm = (s: string) => s.trim().toLowerCase();
  const refIds = new Set(ref.devices.map((d) => d.id));
  const idMap = new Map<string, string>();
  const items: ItemResult[] = [];
  for (const r of ref.devices) {
    const s = doc.devices.find((d) => norm(d.name) === norm(r.name) && !idMap.has(d.id));
    const want = MODEL_BY_KEY[r.model];
    let ok = false;
    let detail: string | undefined;
    if (!s) detail = `no device named ${r.name}: place a ${want?.vendor ?? ''} ${want?.name ?? r.model} and name it ${r.name}`;
    else {
      idMap.set(s.id, r.id);
      ok = s.model === r.model;
      if (!ok) detail = `${r.name} is a ${MODEL_BY_KEY[s.model]?.name ?? s.model}; the design calls for a ${want?.name ?? r.model}`;
    }
    items.push({ id: `dev:${r.id}`, group: 'Topology › Devices', text: `${r.name}: ${want?.vendor ?? ''} ${want?.name ?? r.model}`.trim(), points: DEVICE_POINTS, earned: ok ? DEVICE_POINTS : 0, ok, detail, hinted: false });
  }
  const mapped: LabDoc = structuredClone(doc);
  const newId = (id: string) => idMap.get(id) ?? (refIds.has(id) ? `student-${id}` : id);
  for (const d of mapped.devices) d.id = newId(d.id);
  for (const c of mapped.cables) {
    c.a = { ...c.a, device: newId(c.a.device) };
    c.b = { ...c.b, device: newId(c.b.device) };
  }
  const name = (id: string) => ref.devices.find((d) => d.id === id)?.name ?? id;
  for (const rc of ref.cables) {
    const same = (c: { a: { device: string; port: string }; b: { device: string; port: string } }) => (c.a.device === rc.a.device && c.a.port === rc.a.port && c.b.device === rc.b.device && c.b.port === rc.b.port) || (c.a.device === rc.b.device && c.a.port === rc.b.port && c.b.device === rc.a.device && c.b.port === rc.a.port);
    const hit = mapped.cables.find(same);
    const label = `${name(rc.a.device)} ${rc.a.port} to ${name(rc.b.device)} ${rc.b.port}`;
    let ok = false;
    let detail: string | undefined;
    if (!hit) {
      const nearby = mapped.cables.find((c) => [c.a.device, c.b.device].includes(rc.a.device) && [c.a.device, c.b.device].includes(rc.b.device));
      detail = nearby ? `${name(rc.a.device)} and ${name(rc.b.device)} are connected, but not on ${rc.a.port} and ${rc.b.port}` : 'not connected';
    } else {
      const st = cableStatus(mapped, hit);
      ok = st.state === 'up' || st.state === 'degraded';
      if (!ok) detail = st.state === 'disabled' ? 'the cable is disabled' : 'connected, but the link is down: check the cable type and that both ports are enabled';
    }
    items.push({ id: `cab:${rc.a.device}/${rc.a.port}`, group: 'Topology › Cabling', text: label, points: CABLE_POINTS, earned: ok ? CABLE_POINTS : 0, ok, detail, hinted: false });
  }
  return { doc: mapped, items };
}

export function gradeArena(lab: ArenaLab, studentDoc: LabDoc, log: { deviceId: string; text: string }[], hinted: ReadonlySet<string> = new Set(), answers: Readonly<Record<string, string[]>> = {}): Grade {
  const built = startsBlank(lab) ? matchReference(lab.build(), studentDoc) : null;
  const doc = built?.doc ?? studentDoc;
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
  const questions: QuestionResult[] = (lab.questions ?? []).map((q) => {
    const chosen = answers[q.id] ?? [];
    const ok = chosen.length === q.answer.length && q.answer.every((a) => chosen.includes(a));
    const h = hinted.has(q.id);
    return { id: q.id, prompt: q.prompt, points: q.points, earned: ok ? (h ? Math.round(q.points * HINT_FACTOR) : q.points) : 0, ok, answered: chosen.length > 0, chosen, hinted: h };
  });
  const topology = built?.items ?? [];
  const all = [...topology, ...items, ...tests, ...questions];
  const max = all.reduce((n, x) => n + x.points, 0);
  const score = all.reduce((n, x) => n + x.earned, 0);
  const total = all.length;
  const okCount = topology.filter((x) => x.ok).length + items.filter((x) => x.ok).length + tests.filter((x) => x.ok).length + questions.filter((x) => x.answered).length;
  return { topology, items, tests, questions, score, max, pct: max ? Math.round((score / max) * 100) : 0, completion: total ? Math.round((okCount / total) * 100) : 0 };
}

/** Groups item results by their tree path for the Packet Tracer style assessment tree. */
export function itemTree(items: ItemResult[]): { group: string; items: ItemResult[]; earned: number; points: number }[] {
  const map = new Map<string, ItemResult[]>();
  for (const i of items) map.set(i.group, [...(map.get(i.group) ?? []), i]);
  return [...map.entries()].map(([group, list]) => ({ group, items: list, earned: list.reduce((n, x) => n + x.earned, 0), points: list.reduce((n, x) => n + x.points, 0) }));
}
