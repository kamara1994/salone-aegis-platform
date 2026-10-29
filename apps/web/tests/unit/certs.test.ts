import { describe, expect, it } from 'vitest';
import { GAME_TEMPLATES } from '@/content/games';
import { buildExam } from '@/content/exam';
import { TRACKS } from '@/content';
import { CERTS, certTopics } from '@/content/certs';
import { TRACKS as AI_TRACKS } from '@/learn/api';
import { WORKBOOKS } from '@/lab/workbooks';

describe('certification focus catalogue', () => {
  it('covers the requested certifications', () => {
    for (const id of ['security-plus', 'network-plus', 'ccna', 'psaa', 'ejpt', 'pjpt', 'pnpt', 'cysa-plus', 'pentest-plus', 'oscp', 'cissp', 'aws-security']) expect(CERTS.some((c) => c.id === id), id).toBe(true);
    expect(new Set(CERTS.map((c) => c.id)).size).toBe(CERTS.length);
  });
  it('every certification has topics, valid labs, games and tracks', () => {
    for (const c of CERTS) {
      expect(certTopics(c).length, c.id).toBeGreaterThanOrEqual(10);
      expect(c.domains.length, c.id).toBeGreaterThanOrEqual(3);
      for (const l of c.labs) expect(WORKBOOKS.some((w) => w.id === l), `${c.id} lab ${l}`).toBe(true);
      for (const g of c.games) expect(GAME_TEMPLATES.some((t) => t.id === g), `${c.id} game ${g}`).toBe(true);
      if (c.track) expect(TRACKS.some((t) => t.id === c.track), `${c.id} track`).toBe(true);
      if (c.aiTrack) expect(AI_TRACKS.some((t) => t.key === c.aiTrack), `${c.id} ai track`).toBe(true);
      for (const id of c.extraTopics ?? []) expect(certTopics(c).some((t) => t.id === id), `${c.id} extra ${id}`).toBe(true);
    }
  });
  it('exams can be scoped to a certification', () => {
    const ejpt = CERTS.find((c) => c.id === 'ejpt')!;
    const ids = new Set(certTopics(ejpt).map((t) => t.id));
    const items = buildExam('cert:ejpt', 15, () => 0.3);
    expect(items).toHaveLength(15);
    expect(items.every((q) => ids.has(q.topic.id))).toBe(true);
  });
});

describe('dashboards group certifications that cover the same ground', async () => {
  const { DASHBOARDS, certById, certTopics: topicsOf, dashboardOfCert } = await import('@/content/certs');
  it('every certification is on exactly one dashboard', () => {
    for (const c of CERTS) expect(DASHBOARDS.filter((d) => d.certs.includes(c.id)).length, c.id).toBe(1);
  });
  it('Network+ and CCNA share the Networking dashboard; pentest certs share one', () => {
    expect(dashboardOfCert('network-plus')?.id).toBe('networking');
    expect(dashboardOfCert('ccna')?.id).toBe('networking');
    expect(dashboardOfCert('ccnp')?.id).toBe('networking');
    for (const id of ['ejpt', 'pjpt', 'pnpt', 'pentest-plus', 'oscp']) expect(dashboardOfCert(id)?.id).toBe('pentest');
  });
  it('a dashboard scopes topics, labs and games from all of its certifications', () => {
    const net = certById('networking')!;
    const ccna = certById('ccna')!;
    const ids = new Set(topicsOf(net).map((t) => t.id));
    for (const t of topicsOf(ccna)) expect(ids.has(t.id)).toBe(true);
    for (const l of ccna.labs) expect(net.labs).toContain(l);
    expect(buildExam('cert:networking', 10).length).toBe(10);
  });
});
