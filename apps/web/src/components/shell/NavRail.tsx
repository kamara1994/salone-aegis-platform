'use client';

import { Activity, BarChart3, Cable, BookOpen, GraduationCap, History, LayoutDashboard, Network, Settings, ShieldAlert, Ticket } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAlerts, useTickets } from '@/api/hooks';
import { cx } from '@/components/ui';

export const NAV = [
  { href: '/', label: 'Cockpit', icon: LayoutDashboard },
  { href: '/tickets', label: 'Tickets', icon: Ticket },
  { href: '/topology', label: 'Map', icon: Network },
  { href: '/lab', label: 'Lab', icon: Cable },
  { href: '/soc', label: 'SOC', icon: ShieldAlert },
  { href: '/scenarios', label: 'Scenarios', icon: BookOpen },
  { href: '/skills', label: 'Skills', icon: GraduationCap },
  { href: '/evidence', label: 'Evidence', icon: BarChart3 },
  { href: '/replay', label: 'Replay', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function NavRail() {
  const path = usePathname();
  const open = useTickets({ status: ['new', 'acknowledged', 'investigating', 'pending_verification', 'client_explanation', 'debrief'] });
  const alerts = useAlerts();
  const counts: Record<string, number> = {
    '/tickets': open.data?.items.length ?? 0,
    '/soc': alerts.data?.items.filter((a) => a.state !== 'classified').length ?? 0,
  };
  return (
    <nav aria-label="Main" className="flex shrink-0 items-stretch gap-0.5 overflow-x-auto border-t border-line bg-pane py-1 md:w-[68px] md:flex-col md:overflow-visible md:border-t-0 md:border-r md:py-2">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/' ? path === '/' : path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={cx('relative mx-0.5 flex min-w-[60px] flex-col items-center gap-0.5 rounded-[5px] py-1.5 text-[11px] md:mx-1.5 md:min-w-0', active ? 'bg-pane-2 text-text' : 'text-muted hover:bg-pane-2 hover:text-text')}>
            {active && <span className="absolute top-0 right-2 left-2 h-0.5 rounded bg-action md:top-1.5 md:right-auto md:bottom-1.5 md:left-0 md:h-auto md:w-0.5" aria-hidden />}
            <Icon className="size-[18px]" aria-hidden />
            {label}
            {counts[href] > 0 && <span className="absolute top-0.5 right-1.5 min-w-4 rounded-full bg-action px-1 text-center text-[10px] leading-4 font-semibold text-white">{counts[href]}</span>}
          </Link>
        );
      })}
      <div className="hidden flex-1 md:block" />
      <Activity className="mx-auto hidden size-4 text-faint md:block" aria-hidden />
    </nav>
  );
}
