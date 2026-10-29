import { describe, expect, it } from 'vitest';
import { BUILTIN_LESSONS, TRACKS } from '@/content';
import { GAME_TEMPLATES } from '@/content/games';
import { validatePack } from '@/content/progress';
import { MAX, scoreCase, type PlayState } from '@/content/scoring';
import { CHALLENGES } from '@/lab/challenges';
import { WORKBOOKS } from '@/lab/workbooks';
import { findDevices } from '@/lab/find';
import { fitScale, checkBackgroundFile } from '@/lab/bgimage';
import { labToSvg } from '@/lab/svgExport';

const wbIds = new Set(WORKBOOKS.map((w) => w.id));
const chIds = new Set(CHALLENGES.map((c) => c.id));

describe('lesson content', () => {
  it('has unique lesson and section ids', () => {
    const ids = BUILTIN_LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of BUILTIN_LESSONS) {
      const s = l.sections.map((x) => x.id);
      expect(new Set(s).size, l.id).toBe(s.length);
    }
  });
  it('the VLAN lesson has all 16 parts', () => {
    expect(BUILTIN_LESSONS.find((l) => l.id === 'vlans')!.sections).toHaveLength(16);
  });
  it('quiz answers, trainer patterns and lab links are valid', () => {
    for (const l of BUILTIN_LESSONS) {
      if (l.lab?.workbook) expect(wbIds.has(l.lab.workbook), `${l.id} workbook`).toBe(true);
      if (l.lab?.challenge) expect(chIds.has(l.lab.challenge), `${l.id} challenge`).toBe(true);
      expect(l.tracks.every((t) => TRACKS.some((x) => x.id === t)), l.id).toBe(true);
      for (const s of l.sections)
        for (const b of s.blocks) {
          if (b.type === 'quiz') for (const q of b.questions) expect(q.answer, `${l.id}/${b.id}`).toBeLessThan(q.options.length);
          if (b.type === 'predict') expect(b.answer).toBeLessThan(b.options.length);
          if (b.type === 'trainer') for (const st of b.steps) expect(() => new RegExp(st.expect, 'i')).not.toThrow();
          if (b.type === 'lab') {
            if (b.workbook) expect(wbIds.has(b.workbook), `${l.id} lab block`).toBe(true);
            if (b.challenge) expect(chIds.has(b.challenge), `${l.id} lab block`).toBe(true);
          }
        }
    }
  });
});

describe('game content', () => {
  it('covers every required template', () => {
    const want = ['helpdesk', 'noc-outage', 'soc-alert', 'phishing', 'ransomware', 'firewall', 'cloud-breach', 'wireless', 'active-directory', 'cable-repair', 'dns', 'vpn', 'pentest', 'disaster-recovery', 'change-window', 'customer-escalation'];
    for (const id of want) expect(GAME_TEMPLATES.some((g) => g.id === id), id).toBe(true);
  });
  it('every case is winnable and consistent', () => {
    const ids = new Set<string>();
    for (const g of GAME_TEMPLATES)
      for (const c of g.cases) {
        expect(ids.has(`${g.id}/${c.id}`)).toBe(false);
        ids.add(`${g.id}/${c.id}`);
        expect(c.diagnoses.filter((d) => d.correct), c.id).toHaveLength(1);
        expect(c.fixes.filter((d) => d.correct), c.id).toHaveLength(1);
        expect(c.escalation.options, c.id).toContain(c.escalation.correct);
        expect(c.evidence.some((e) => e.key), c.id).toBe(true);
        expect(c.hints.length, c.id).toBeGreaterThan(0);
        if (c.lab?.workbook) expect(wbIds.has(c.lab.workbook), c.id).toBe(true);
        if (c.lab?.challenge) expect(chIds.has(c.lab.challenge), c.id).toBe(true);
      }
  });
});

describe('game scoring', () => {
  const c = GAME_TEMPLATES[0].cases[0];
  const perfect: PlayState = {
    urgency: c.urgency,
    impact: c.impact,
    asked: c.questions.filter((q) => q.useful).map((q) => q.id),
    opened: c.evidence.filter((e) => e.key).map((e) => e.id),
    diagnosis: c.diagnoses.find((d) => d.correct)!.id,
    fix: c.fixes.find((d) => d.correct)!.id,
    escalation: c.escalation.correct,
    note: `Found the issue. Changed it: ${c.noteKeywords.join(' ')}. Confirmed the user can work again.`,
    hintsUsed: 0,
    elapsedMs: 60_000,
  };
  it('a perfect run scores 100', () => {
    expect(Object.values(MAX).reduce((a, b) => a + b, 0)).toBe(100);
    expect(scoreCase(c, perfect).score).toBe(100);
  });
  it('penalises hints, wasted questions, wrong answers and slow work', () => {
    expect(scoreCase(c, { ...perfect, hintsUsed: 2 }).score).toBe(94);
    const waste = c.questions.find((q) => !q.useful)!;
    expect(scoreCase(c, { ...perfect, asked: [...perfect.asked, waste.id] }).breakdown.questions).toBe(MAX.questions - 2);
    const r = scoreCase(c, { ...perfect, diagnosis: c.diagnoses.find((d) => !d.correct)!.id, escalation: 'Security', elapsedMs: c.minutes * 3 * 60_000 });
    expect(r.breakdown.diagnosis).toBe(0);
    expect(r.breakdown.escalation).toBe(0);
    expect(r.breakdown.time).toBe(0);
  });
  it('gives half marks for triage one step off and checks the note', () => {
    const r = scoreCase(c, { ...perfect, urgency: 'critical', note: 'fixed' });
    expect(r.breakdown.urgency).toBe(5);
    expect(r.breakdown.documentation).toBe(0);
    expect(r.missedKeywords).toEqual(c.noteKeywords);
    expect(scoreCase(c, { ...perfect, note: perfect.note + ' User error, their fault.' }).breakdown.communication).toBe(0);
  });
});

describe('content packs', () => {
  const base = { format: 'aegis-content-pack', version: 1, name: 'Test', createdAt: '2026-01-01' };
  it('accepts valid packs and rejects bad ones', () => {
    expect(validatePack({ ...base, lessons: [BUILTIN_LESSONS[0]], games: [GAME_TEMPLATES[0]] }).ok).toBe(true);
    expect(validatePack({ ...base, format: 'x' }).ok).toBe(false);
    expect(validatePack({ ...base, name: '' }).ok).toBe(false);
    expect(validatePack({ ...base, lessons: [{ id: 'x', title: 'X', sections: [] }] }).ok).toBe(false);
    expect(validatePack({ ...base, labs: [{ name: 'bad', doc: { version: 2 } }] }).ok).toBe(false);
    expect(validatePack({ ...base, labs: [{ name: 'ok', doc: { version: 1, devices: [], cables: [] } }] }).ok).toBe(true);
    expect(validatePack({ ...base, description: 'x'.repeat(2_100_000) }).ok).toBe(false);
  });
});

describe('lab helpers', () => {
  const doc = WORKBOOKS.find((w) => w.id === 'vlans-trunking')!.build();
  it('finds devices by name, IP, VLAN and port', () => {
    const sw = doc.devices.find((d) => d.kind === 'switch')!;
    expect(findDevices(doc, sw.name)).toEqual([sw.id]);
    const withIp = doc.devices.find((d) => d.interfaces.some((i) => i.ip))!;
    expect(findDevices(doc, withIp.interfaces.find((i) => i.ip)!.ip!)).toContain(withIp.id);
    const port = sw.interfaces[0].name;
    expect(findDevices(doc, `${sw.name} ${port}`)).toEqual([sw.id]);
    expect(findDevices(doc, 'vlan 1').length).toBeGreaterThan(0);
    expect(findDevices(doc, 'no-such-thing')).toEqual([]);
  });
  it('exports a standalone SVG diagram', () => {
    const svg = labToSvg({ ...doc, annotations: [{ id: 'a', kind: 'arrow', x: 0, y: 0, w: 100, h: 40, text: '<uplink>', color: 'red', rotate: 45 }] }, 'Test & lab');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Test &amp; lab');
    expect(svg).toContain('&lt;uplink&gt;');
    for (const d of doc.devices) expect(svg).toContain(d.name);
  });
  it('limits background images', () => {
    expect(fitScale(4000, 2000)).toEqual({ w: 1920, h: 960 });
    expect(fitScale(800, 600)).toEqual({ w: 800, h: 600 });
    expect(checkBackgroundFile({ type: 'image/svg+xml', size: 10 })).toMatch(/PNG/);
    expect(checkBackgroundFile({ type: 'image/png', size: 5 * 1024 * 1024 })).toMatch(/4 MB/);
    expect(checkBackgroundFile({ type: 'image/gif', size: 1000 })).toBeNull();
  });
});
