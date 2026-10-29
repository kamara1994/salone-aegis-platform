'use client';

import { ArrowLeft, Briefcase, FlaskConical, FolderKanban, Gamepad2, GraduationCap, LineChart, Settings, Target } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { create } from 'zustand';
import { cx } from '@/components/ui';
import { certById, CERTS, dashboardById, VENDOR_ACCENT } from '@/content/certs';

/** What the dashboard playground shows: null (empty), "learn", "learn/exam", "learn/flashcards", "labs", "games", "projects", "skills", "progress", "career", "settings". */
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

/** Replaces the main left menu inside a dashboard: the sections of this certification area. */
export function DashboardSide() {
  const path = usePathname();
  const id = path.split('/')[2];
  const dash = dashboardById(id);
  const focus = certById(id);
  const { item, setItem } = useDashItem();
  const [mobileOpen, setMobileOpen] = useState(false);
  if (!dash || !focus) return null;
  const members = dash.certs.map((c) => CERTS.find((k) => k.id === c)!).filter(Boolean);
  const accent = VENDOR_ACCENT[members[0]?.vendor] ?? 'var(--action)';
  const pick = (x: string) => {
    setItem(x);
    setMobileOpen(false);
  };
  const active = (x: string) => item === x || item?.startsWith(`${x}/`);
  return (
    <aside className="flex shrink-0 flex-col border-line bg-pane max-md:border-b md:w-[240px] md:border-r" aria-label={`${dash.title} menu`} data-testid="dashboard-side">
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
      <nav className={cx('min-h-0 flex-1 space-y-0.5 overflow-auto p-2', !mobileOpen && 'max-md:hidden')} aria-label={`${dash.title} sections`}>
        {SIDE_ITEMS.map((p) => (
          <button key={p.item} onClick={() => pick(p.item)} aria-current={active(p.item) ? 'page' : undefined} className={cx('flex w-full items-center gap-2.5 rounded-[5px] px-2.5 py-2 text-left text-[13.5px]', active(p.item) ? 'bg-action/15 text-text' : 'text-muted hover:bg-pane-2 hover:text-text')} data-testid={`side-${p.item}`}>
            <p.icon className="size-4" style={{ color: accent }} /> {p.label}
            {p.item === 'labs' && <span className="ml-auto text-[11px] text-faint">{focus.labs.length}</span>}
            {p.item === 'games' && <span className="ml-auto text-[11px] text-faint">{focus.games.length}</span>}
          </button>
        ))}
      </nav>
    </aside>
  );
}
