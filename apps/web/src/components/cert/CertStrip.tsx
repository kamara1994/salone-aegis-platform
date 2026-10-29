'use client';

import { BookOpen, FlaskConical, Gamepad2, GraduationCap, Timer } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui';
import { certById, certTopics } from '@/content/certs';
import { loadProgress, type Progress } from '@/content/progress';
import { WORKBOOKS } from '@/lab/workbooks';
import { useUi } from '@/state/ui';

const action = 'inline-flex h-8 items-center gap-1.5 rounded-[5px] border border-line-strong px-2.5 text-[12.5px] hover:border-action';

/** The cockpit's certification panel: follows the certification chosen in the top bar. */
export function CertStrip() {
  const certId = useUi((s) => s.certId);
  const cert = certById(certId);
  const [p, setP] = useState<Progress | null>(null);
  useEffect(() => setP(loadProgress()), [certId]);
  if (!cert)
    return (
      <div className="mx-3 mt-2 flex flex-wrap items-center gap-2 rounded-[6px] border border-dashed border-line px-3 py-2 text-[12.5px] text-muted" data-testid="cert-strip-empty">
        <GraduationCap className="size-4" /> Studying for a certification? Choose it in the drop-down at the top (Security+, CCNA, eJPT, PJPT, PSAA…) and the whole platform focuses on it.
      </div>
    );
  const topics = certTopics(cert);
  const checked = topics.filter((t) => p?.topics?.[t.id]?.total !== undefined);
  const next = topics.find((t) => p?.topics?.[t.id]?.total === undefined) ?? topics[0];
  const nextLab = WORKBOOKS.find((w) => w.id === cert.labs.find((id) => !p?.lessons[`lab:${id}`]?.done)) ?? WORKBOOKS.find((w) => w.id === cert.labs[0]);
  const labsDone = cert.labs.filter((id) => p?.lessons[`lab:${id}`]?.done).length;
  const exams = (p?.exams ?? []).filter((e) => e.course === `cert:${cert.id}`);
  const best = exams.length ? Math.max(...exams.map((e) => Math.round((e.score / e.total) * 100))) : null;
  const pct = topics.length ? Math.round((checked.length / topics.length) * 100) : 0;
  return (
    <section className="mx-3 mt-2 space-y-2 rounded-[8px] border border-action/40 bg-action/5 px-3 py-2.5" data-testid="cert-strip" aria-label={`${cert.name} study focus`}>
      <div className="flex flex-wrap items-center gap-2">
        <GraduationCap className="size-5 text-action" aria-hidden />
        <h2 className="text-[15px] font-semibold" data-testid="cert-strip-name">
          {cert.name}
        </h2>
        <Badge>{cert.level}</Badge>
        <span className="text-[12px] text-muted">{cert.format}</span>
        <span className="ml-auto flex items-center gap-2 text-[12px]">
          <span className="h-2 w-40 overflow-hidden rounded bg-pane-2">
            <span className="block h-full bg-healthy" style={{ width: `${pct}%` }} />
          </span>
          <span data-testid="cert-strip-progress">
            {checked.length}/{topics.length} topics · {labsDone}/{cert.labs.length} labs{best !== null ? ` · best exam ${best}%` : ''}
          </span>
        </span>
      </div>
      <p className="text-[12.5px] text-muted">{cert.summary}</p>
      <div className="flex flex-wrap gap-1.5" aria-label="Exam domains">
        {cert.domains.map((d) => (
          <span key={d} className="rounded-full border border-line px-2 py-0.5 text-[11.5px]">
            {d}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {next && (
          <Link href={`/learn?topic=${next.id}`} className={`${action} border-action bg-action text-action-ink`} data-testid="cert-next-topic">
            <BookOpen className="size-4" /> Next topic: {next.title}
          </Link>
        )}
        <Link href="/learn?tab=exams" className={action} data-testid="cert-exam">
          <Timer className="size-4" /> {cert.short} practice exam
        </Link>
        {nextLab && (
          <Link href={`/lab?workbook=${nextLab.id}`} className={action} data-testid="cert-lab">
            <FlaskConical className="size-4" /> Lab: {nextLab.title}
          </Link>
        )}
        {cert.games[0] && (
          <Link href={`/games?template=${cert.games[0]}`} className={action} data-testid="cert-game">
            <Gamepad2 className="size-4" /> Scenario practice
          </Link>
        )}
      </div>
    </section>
  );
}
