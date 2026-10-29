'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { DashboardSide } from '@/components/cert/DashboardSide';
import { DebriefOverlay } from '@/components/debrief/DebriefOverlay';
import { CommandPalette } from './CommandPalette';
import { ConsoleDock } from './ConsoleDock';
import { NavRail } from './NavRail';
import { NotificationsDrawer } from './NotificationsDrawer';
import { Toasts } from './Toasts';
import { TopBar } from './TopBar';

export function AppShell({ children }: { children: ReactNode }) {
  const dashboard = usePathname().startsWith('/dashboard/');
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-action focus:px-3 focus:py-1 focus:text-white">
        Skip to content
      </a>
      <TopBar />
      <div className={dashboard ? 'flex min-h-0 flex-1 flex-col md:flex-row' : 'flex min-h-0 flex-1 flex-col-reverse md:flex-row'}>
        {/* Inside a certification dashboard the left side becomes that dashboard's own menu. */}
        {dashboard ? <DashboardSide /> : <NavRail />}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <main id="main" className="min-h-0 flex-1 overflow-auto">
            {children}
          </main>
          <ConsoleDock />
        </div>
      </div>
      <NotificationsDrawer />
      <CommandPalette />
      <DebriefOverlay />
      <Toasts />
    </div>
  );
}
