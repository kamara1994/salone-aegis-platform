'use client';

import { BookOpen, Briefcase, FlaskConical, Gamepad2, LineChart, Timer } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { CertStrip } from '@/components/cert/CertStrip';
import { Badge, EmptyState } from '@/components/ui';
import { CERTS, dashboardById, VENDOR_ACCENT } from '@/content/certs';
import { useUi } from '@/state/ui';

const SECTIONS = [
  { key: 'study', title: 'Study', icon: BookOpen, href: '/learn?tab=topics', cta: 'Open topics' },
  { key: 'labs', title: 'Labs', icon: FlaskConical, href: '/lab', cta: 'Open the Lab' },
  { key: 'exams', title: 'Practice exams', icon: Timer, href: '/learn?tab=exams', cta: 'Start a practice exam' },
  { key: 'scenarios', title: 'Scenarios', icon: Gamepad2, href: '/games', cta: 'Play a scenario' },
  { key: 'progress', title: 'Progress', icon: LineChart, href: '/learn?tab=tracks', cta: 'See tracks and progress' },
  { key: 'career', title: 'Career', icon: Briefcase, href: '/skills', cta: 'Open skills' },
] as const;

/** One dashboard per certification area. Sections are placeholders, to be designed one by one. */
export default function DashboardPage() {
  const { id } = useParams<{ id: string }>();
  const dash = dashboardById(id);
  // Opening a dashboard by URL makes it the current focus (once per visit, so switching away is not undone).
  useEffect(() => {
    if (dash && useUi.getState().certId !== dash.id) useUi.getState().setCert(dash.id);
  }, [dash]);
  if (!dash) return <EmptyState title="No such dashboard" body="Choose a certification area from the drop-down at the top." />;
  const members = dash.certs.map((c) => CERTS.find((k) => k.id === c)!).filter(Boolean);
  const accent = VENDOR_ACCENT[members[0]?.vendor] ?? 'var(--action)';
  return (
    <div className="h-full overflow-auto" data-testid={`dashboard-${dash.id}`}>
      <header className="border-b border-line px-4 pt-4 pb-3" style={{ borderTop: `3px solid ${accent}` }}>
        <h1 className="text-[22px] font-semibold" data-testid="dashboard-title">
          {dash.title}
        </h1>
        <p className="max-w-3xl text-[13px] text-muted">{dash.summary}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5" data-testid="dashboard-certs">
          <span className="text-[12px] text-muted">Covers:</span>
          {members.map((c) => (
            <Badge key={c.id} title={`${c.name} · ${c.level} · ${c.format}`}>
              {c.short} <span className="text-faint">({c.vendor})</span>
            </Badge>
          ))}
        </div>
      </header>
      <CertStrip />
      <section className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3" aria-label={`${dash.title} dashboard sections`}>
        {SECTIONS.map((s) => (
          <div key={s.key} className="flex min-h-[160px] flex-col rounded-[8px] border border-dashed border-line-strong p-3" data-testid={`dashboard-section-${s.key}`}>
            <h2 className="flex items-center gap-2 text-[14px] font-semibold">
              <s.icon className="size-4" style={{ color: accent }} /> {s.title}
            </h2>
            <p className="mt-1 flex-1 text-[12.5px] text-muted">This {dash.title.toLowerCase()} section is reserved. Its content will be designed next.</p>
            <Link href={s.href} className="mt-2 self-start text-[12.5px] text-action underline">
              {s.cta}
            </Link>
          </div>
        ))}
      </section>
    </div>
  );
}
