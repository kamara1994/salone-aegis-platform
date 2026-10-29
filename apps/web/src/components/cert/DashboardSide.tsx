'use client';

import { ArrowLeft, Briefcase, FlaskConical, FolderKanban, Gamepad2, GraduationCap, LineChart, Settings, Target } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { create } from 'zustand';
import { cx } from '@/components/ui';
import { certById, CERTS, dashboardById, VENDOR_ACCENT } from '@/content/certs';

/** What the dashboard shows: null (empty playground) or "<section>/<part>", e.g. "learn/exam", "labs", "games/<template>". */
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

export const SIDE_ITEMS = [
  { item: 'learn', label: 'Learn', icon: GraduationCap },
  { item: 'labs', label: 'Labs', icon: FlaskConical },
  { item: 'games', label: 'Games', icon: Gamepad2 },
  { item: 'projects', label: 'Projects', icon: FolderKanban },
  { item: 'skills', label: 'Skills', icon: Target },
  { item: 'progress', label: 'Progress', icon: LineChart },
  { item: 'career', label: 'Career', icon: Briefcase },
  { item: 'settings', label: 'Settings', icon: Settings },
] as const;

export type DashSection = (typeof SIDE_ITEMS)[number]['item'];

export const sectionOf = (item: string | null) => (item ? (item.split('/')[0] as DashSection) : null);

export function dashAccent(id: string) {
  const dash = dashboardById(id);
  const first = dash && CERTS.find((c) => c.id === dash.certs[0]);
  return (first && VENDOR_ACCENT[first.vendor]) ?? 'var(--action)';
}

/** Replaces the main icon rail inside a dashboard: the sections of this certification area. */
export function DashboardSide() {
  const id = usePathname().split('/')[2];
  const dash = dashboardById(id);
  const focus = certById(id);
  const { item, setItem } = useDashItem();
  if (!dash || !focus) return null;
  const accent = dashAccent(id);
  const current = sectionOf(item);
  const cls = (active: boolean) => cx('relative mx-0.5 flex min-w-[60px] flex-col items-center gap-0.5 rounded-[5px] py-1.5 text-center text-[11px] leading-tight md:mx-1.5 md:min-w-0', active ? 'bg-pane-2 text-text' : 'text-muted hover:bg-pane-2 hover:text-text');
  return (
    <nav aria-label={`${dash.title} menu`} data-testid="dashboard-side" className="flex shrink-0 items-stretch gap-0.5 overflow-x-auto border-t border-line bg-pane py-1 md:w-[68px] md:flex-col md:overflow-visible md:border-t-0 md:border-r md:py-2">
      <Link href="/" title="Back to the main menu" className={cls(false)} data-testid="dashboard-back">
        <ArrowLeft className="size-[18px]" aria-hidden />
        Main
      </Link>
      <button onClick={() => setItem(null)} title={`${dash.title} home`} className="mx-0.5 mb-1 hidden rounded-[5px] border-b-2 px-1 py-1 text-center text-[10.5px] leading-tight font-semibold md:mx-1.5 md:block" style={{ borderColor: accent }} data-testid="dashboard-side-title">
        <span className="sr-only">{dash.title}</span>
        <span aria-hidden className="break-words">{dash.short}</span>
      </button>
      {SIDE_ITEMS.map((p) => {
        const active = current === p.item;
        return (
          <button key={p.item} onClick={() => setItem(p.item)} aria-current={active ? 'page' : undefined} className={cls(active)} data-testid={`side-${p.item}`}>
            {active && <span className="absolute top-0 right-2 left-2 h-0.5 rounded md:top-1.5 md:right-auto md:bottom-1.5 md:left-0 md:h-auto md:w-0.5" style={{ background: accent }} aria-hidden />}
            <p.icon className="size-[18px]" style={{ color: active ? accent : undefined }} aria-hidden />
            {p.label}
          </button>
        );
      })}
    </nav>
  );
}
