'use client';

import { Award, BriefcaseBusiness, FolderGit2, GraduationCap, Joystick, Network, Settings2, TrendingUp } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { create } from 'zustand';
import { cx } from '@/components/ui';
import { certById, CERTS, dashboardById, VENDOR_ACCENT } from '@/content/certs';
import { RailActions, RailBrand, useRailPeek } from '@/components/shell/Rail';

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
  { item: 'labs', label: 'Labs', icon: Network },
  { item: 'games', label: 'Games', icon: Joystick },
  { item: 'projects', label: 'Projects', icon: FolderGit2 },
  { item: 'skills', label: 'Skills', icon: Award },
  { item: 'progress', label: 'Progress', icon: TrendingUp },
  { item: 'career', label: 'Career', icon: BriefcaseBusiness },
  { item: 'settings', label: 'Settings', icon: Settings2 },
] as const;

export type DashSection = (typeof SIDE_ITEMS)[number]['item'];

export const sectionOf = (item: string | null): DashSection | null => {
  if (!item) return null;
  const section = item.split('/')[0];
  return (section === 'scenario-lab' ? 'labs' : section) as DashSection;
};

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
  const { compact: slim, slim: inFocus, navProps, overlay, wrap } = useRailPeek();
  if (!dash || !focus) return null;
  const accent = dashAccent(id);
  const current = sectionOf(item);
  const cls = (active: boolean) => cx('relative mx-0.5 flex min-w-[60px] flex-col items-center gap-1 rounded-[6px] py-1 text-center text-[11px] leading-tight md:mx-1.5 md:min-w-0', active ? 'font-medium text-text' : 'text-muted hover:text-text [&:hover>span]:bg-pane-2');
  return wrap(
    <nav aria-label={`${dash.title} menu`} data-testid="dashboard-side" data-focus={inFocus || undefined} {...navProps} className={`flex shrink-0 items-stretch gap-0.5 overflow-x-auto border-t border-line bg-pane py-1 md:flex-col md:transition-[width] md:duration-200 ${slim ? 'md:w-[52px]' : 'md:w-[72px]'} md:overflow-visible md:border-t-0 md:border-r md:py-2 ${overlay}`}>
      <RailBrand />
      <button onClick={() => setItem(null)} title={`${dash.title} home`} className={cx('mx-0.5 mb-1 hidden rounded-[5px] border-b-2 px-0.5 py-1 text-center text-[10px] leading-tight font-semibold md:mx-1.5', slim ? 'md:hidden' : 'md:block')} style={{ borderColor: accent }} data-testid="dashboard-side-title">
        <span className="sr-only">{dash.title}</span>
        <span aria-hidden className="block truncate">{dash.short}</span>
      </button>
      {SIDE_ITEMS.map((p) => {
        const active = current === p.item;
        return (
          <button key={p.item} onClick={() => setItem(p.item)} aria-current={active ? 'page' : undefined} title={p.label} className={cls(active)} data-testid={`side-${p.item}`}>
            <span className={cx('grid size-8 place-items-center rounded-[8px] transition-colors', active ? 'text-white shadow-sm' : 'bg-pane-2/70')} style={active ? { background: accent } : undefined} aria-hidden>
              <p.icon className="size-[17px]" strokeWidth={active ? 2.25 : 1.75} />
            </span>
            <span className={cx(slim && 'md:sr-only')}>{p.label}</span>
          </button>
        );
      })}
      <RailActions />
    </nav>
  );
}
