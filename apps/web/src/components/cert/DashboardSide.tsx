'use client';

import { ArrowLeft, Briefcase, Check, ChevronRight, FlaskConical, Gamepad2, Layers, LineChart, Search, Timer } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { cx } from '@/components/ui';
import { certById, certTopics, CERTS, dashboardById, VENDOR_ACCENT } from '@/content/certs';
import { loadProgress, type Progress } from '@/content/progress';
import { COURSES, type Topic } from '@/content/topics';

/** What the dashboard playground shows: null (empty), "topic:<id>", "labs", "exam", "flashcards", "scenarios", "progress", "career". */
export const useDashItem = create<{ item: string | null; setItem: (item: string | null) => void }>((set) => ({
  item: null,
  setItem(item) {
    set({ item });
    try {
      const url = new URL(window.location.href);
      if (item) url.searchParams.set('item', item);
      else url.searchParams.delete('item');
      window.history.replaceState(null, '', url.toString());
    } catch {
      /* ignore */
    }
  },
}));

export const groupLabel = (t: Topic) => `${COURSES.find((k) => k.id === t.course)?.title.replace(/ \(.*\)$/, '')} · ${t.unit}`;

/** Grouped syllabus for a dashboard: one group per course unit, in study order. */
export function dashboardSyllabus(topics: Topic[]) {
  const groups: { name: string; topics: Topic[] }[] = [];
  for (const t of topics) {
    const g = groupLabel(t);
    const found = groups.find((x) => x.name === g);
    if (found) found.topics.push(t);
    else groups.push({ name: g, topics: [t] });
  }
  return groups;
}

const PRACTICE = [
  { item: 'labs', label: 'Labs', icon: FlaskConical },
  { item: 'exam', label: 'Practice exam', icon: Timer },
  { item: 'flashcards', label: 'Flashcards', icon: Layers },
  { item: 'scenarios', label: 'Scenarios', icon: Gamepad2 },
  { item: 'progress', label: 'Progress', icon: LineChart },
  { item: 'career', label: 'Career', icon: Briefcase },
] as const;

/** Replaces the main left menu inside a dashboard: what to cover for this set of certifications. */
export function DashboardSide() {
  const path = usePathname();
  const id = path.split('/')[2];
  const dash = dashboardById(id);
  const focus = certById(id);
  const { item, setItem } = useDashItem();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<Progress | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => setProgress(loadProgress()), [item]);
  const topics = useMemo(() => (focus ? certTopics(focus) : []), [focus]);
  const groups = useMemo(() => dashboardSyllabus(topics), [topics]);
  if (!dash || !focus) return null;
  const members = dash.certs.map((c) => CERTS.find((k) => k.id === c)!).filter(Boolean);
  const accent = VENDOR_ACCENT[members[0]?.vendor] ?? 'var(--action)';
  const done = (t: Topic) => progress?.topics?.[t.id]?.total !== undefined;
  const needle = q.trim().toLowerCase();
  const pick = (x: string) => {
    setItem(x);
    setMobileOpen(false);
  };
  return (
    <aside className="flex shrink-0 flex-col border-line bg-pane max-md:border-b md:w-[280px] md:border-r" aria-label={`${dash.title} menu`} data-testid="dashboard-side">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2" style={{ borderLeft: `3px solid ${accent}` }}>
        <div className="min-w-0 flex-1">
          <Link href="/" className="flex items-center gap-1 text-[11.5px] text-muted hover:text-text" data-testid="dashboard-back">
            <ArrowLeft className="size-3.5" /> Main menu
          </Link>
          <button className="block text-left text-[15px] font-semibold hover:underline" onClick={() => pick('')} data-testid="dashboard-side-title">
            {dash.title}
          </button>
          <p className="truncate text-[11px] text-muted" title={members.map((m) => m.name).join(', ')}>
            {members.map((m) => m.short).join(' · ')}
          </p>
        </div>
        <button className="rounded border border-line px-2 py-1 text-[12px] md:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen}>
          Menu
        </button>
      </div>
      <div className={cx('min-h-0 flex-1 overflow-auto', !mobileOpen && 'max-md:hidden')}>
        <nav className="space-y-0.5 border-b border-line p-2" aria-label="Practise">
          {PRACTICE.map((p) => (
            <button key={p.item} onClick={() => pick(p.item)} aria-current={item === p.item ? 'page' : undefined} className={cx('flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-[13px]', item === p.item ? 'bg-action/15 text-text' : 'text-muted hover:bg-pane-2 hover:text-text')} data-testid={`side-${p.item}`}>
              <p.icon className="size-4" style={{ color: accent }} /> {p.label}
              {p.item === 'labs' && <span className="ml-auto text-[11px] text-faint">{focus.labs.length}</span>}
              {p.item === 'scenarios' && <span className="ml-auto text-[11px] text-faint">{focus.games.length}</span>}
            </button>
          ))}
        </nav>
        <div className="space-y-1 p-2">
          <div className="flex items-baseline justify-between px-1">
            <p className="text-[12px] font-semibold">What to cover</p>
            <span className="text-[11px] text-faint" data-testid="side-coverage">
              {topics.filter(done).length}/{topics.length}
            </span>
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute top-2 left-2 size-3.5 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a topic" aria-label="Find a topic" className="h-7 w-full rounded-[5px] border border-line-strong bg-ink pl-7 text-[12px]" data-testid="side-search" />
          </label>
          <ul className="space-y-0.5" data-testid="side-syllabus">
            {groups.map((g) => {
              const list = needle ? g.topics.filter((t) => `${t.title} ${t.unit}`.toLowerCase().includes(needle)) : g.topics;
              if (!list.length) return null;
              const isOpen = needle ? true : (open[g.name] ?? g.topics.some((t) => item === `topic:${t.id}`));
              const n = g.topics.filter(done).length;
              return (
                <li key={g.name}>
                  <button onClick={() => setOpen({ ...open, [g.name]: !isOpen })} aria-expanded={isOpen} className="flex w-full items-center gap-1 rounded px-1 py-1 text-left text-[12.5px] hover:bg-pane-2" data-testid={`side-group-${g.name.replace(/\W+/g, '-').toLowerCase()}`}>
                    <ChevronRight className={cx('size-3.5 shrink-0 text-faint transition-transform', isOpen && 'rotate-90')} />
                    <span className="min-w-0 flex-1 truncate">{g.name.split(' · ')[1]}</span>
                    <span className="text-[10.5px] text-faint">
                      {n}/{g.topics.length}
                    </span>
                  </button>
                  {isOpen && (
                    <ul className="ml-4 border-l border-line pl-1">
                      {list.map((t) => (
                        <li key={t.id}>
                          <button onClick={() => pick(`topic:${t.id}`)} aria-current={item === `topic:${t.id}` ? 'page' : undefined} className={cx('flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[12.5px]', item === `topic:${t.id}` ? 'bg-action/15 text-text' : 'text-muted hover:bg-pane-2 hover:text-text')} data-testid={`side-topic-${t.id}`}>
                            {done(t) ? <Check className="size-3 shrink-0 text-healthy" /> : <span className="size-3 shrink-0" />}
                            <span className="truncate">{t.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </aside>
  );
}
