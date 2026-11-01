'use client';

import { Check, Command, LogOut, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { signOut } from '@/api/auth';
import { CERTS, dashboardById, DASHBOARDS } from '@/content/certs';
import { useRouter } from 'next/navigation';
import { cx, IconButton, Kbd } from '@/components/ui';
import { useUi } from '@/state/ui';

export function TopBar() {
  const { theme, setTheme, certId, setCert, setPalette } = useUi();
  const current = dashboardById(certId) ?? dashboardById('networking')!;
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-pane px-3 sm:gap-3">
      {/* The certificate menu lives inside the AEGIS mark: hover (or focus, or tap) to see and switch it. */}
      <div className="group relative" onMouseLeave={() => setOpen(false)}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`AEGIS. Dashboard: ${current.title}. Change certificate`}
          title={`${current.title}: ${current.summary}`}
          className="flex h-8 items-center rounded-[5px] px-2 text-[15px] font-semibold tracking-tight hover:bg-pane-2"
          data-testid="cert-switch"
          data-value={current.id}
        >
          AEGIS
        </button>
        <div
          role="menu"
          aria-label="Choose a certificate"
          className={cx(
            'absolute top-full left-0 z-[2200] pt-1 transition-opacity duration-150',
            open ? 'visible opacity-100' : 'invisible opacity-0 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100',
          )}
          data-testid="cert-menu"
        >
          <ul className="w-[300px] max-w-[90vw] rounded-md border border-line-strong bg-pane p-1 shadow-xl">
            {DASHBOARDS.map((x) => {
              const on = x.id === current.id;
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    onClick={() => {
                      setCert(x.id);
                      setOpen(false);
                      (document.activeElement as HTMLElement | null)?.blur();
                      router.push(`/dashboard/${x.id}`);
                    }}
                    className={cx('flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-[12.5px] hover:bg-pane-2', on && 'bg-action/10')}
                    data-testid={`cert-option-${x.id}`}
                  >
                    <Check className={cx('mt-0.5 size-3.5 shrink-0 text-action', !on && 'invisible')} aria-hidden />
                    <span className="min-w-0">
                      <span className="block font-medium text-text">{x.title}</span>
                      <span className="block truncate text-[11.5px] text-muted">{x.certs.map((c) => CERTS.find((k) => k.id === c)?.short).join(', ')}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="flex-1" />
      <button onClick={() => setPalette(true)} className="hidden h-8 items-center gap-2 rounded-[5px] border border-line-strong px-2 text-[12.5px] text-muted hover:text-text lg:flex">
        <Command className="size-3.5" aria-hidden /> Actions <Kbd>Ctrl K</Kbd>
      </button>
      <IconButton label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </IconButton>
      <IconButton label="Sign out" onClick={() => void signOut()}>
        <LogOut className="size-4" />
      </IconButton>
    </header>
  );
}
