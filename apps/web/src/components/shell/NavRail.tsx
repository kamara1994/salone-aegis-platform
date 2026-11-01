'use client';

import { Cable, Gamepad2, GraduationCap, School, Settings, Trophy } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/components/ui';
import { dashboardById } from '@/content/certs';
import { useUi } from '@/state/ui';
import { RailActions, RailBrand, useRailPeek } from './Rail';

export const NAV = [
  { href: '/lab', label: 'Lab', icon: Cable },
  { href: '/arena', label: 'Arena', icon: Trophy },
  { href: '/learn', label: 'Learn', icon: School },
  { href: '/games', label: 'Games', icon: Gamepad2 },
  { href: '/skills', label: 'Skills', icon: GraduationCap },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function NavRail() {
  const path = usePathname();
  const dash = dashboardById(useUi((s) => s.certId));
  const { compact: focus, navProps, overlay, wrap } = useRailPeek();
  return wrap(
    <nav aria-label="Main" {...navProps} className={cx('flex shrink-0 items-stretch gap-0.5 overflow-x-auto border-t border-line bg-pane py-1', focus ? 'md:w-[52px]' : 'md:w-[68px]', ' md:flex-col md:overflow-visible md:border-t-0 md:border-r md:py-2', overlay)}>
      <RailBrand />
      {dash && (
        <Link href={`/dashboard/${dash.id}`} aria-current={path.startsWith('/dashboard') ? 'page' : undefined} title={`${dash.title} dashboard`} data-testid="nav-dashboard" className={cx('relative mx-0.5 flex min-w-[60px] flex-col items-center gap-0.5 rounded-[5px] py-1.5 text-center text-[11px] leading-tight md:mx-1.5 md:min-w-0', path.startsWith('/dashboard') ? 'bg-pane-2 text-text' : 'text-muted hover:bg-pane-2 hover:text-text')}>
          {path.startsWith('/dashboard') && <span className="absolute top-0 right-2 left-2 h-0.5 rounded bg-action md:top-1.5 md:right-auto md:bottom-1.5 md:left-0 md:h-auto md:w-0.5" aria-hidden />}
          <GraduationCap className="size-[18px]" aria-hidden />
          <span className={cx(focus && 'md:sr-only')}>{dash.short}</span>
        </Link>
      )}
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = path.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={cx('relative mx-0.5 flex min-w-[60px] flex-col items-center gap-0.5 rounded-[5px] py-1.5 text-[11px] md:mx-1.5 md:min-w-0', active ? 'bg-pane-2 text-text' : 'text-muted hover:bg-pane-2 hover:text-text')}>
            {active && <span className="absolute top-0 right-2 left-2 h-0.5 rounded bg-action md:top-1.5 md:right-auto md:bottom-1.5 md:left-0 md:h-auto md:w-0.5" aria-hidden />}
            <Icon className="size-[18px]" aria-hidden />
            <span className={cx(focus && 'md:sr-only')}>{label}</span>
          </Link>
        );
      })}
      <RailActions />
    </nav>
  );
}
