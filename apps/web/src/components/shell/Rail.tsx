'use client';

import { Check, Command, LogOut, Moon, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { signOut } from '@/api/auth';
import { cx } from '@/components/ui';
import { CERTS, dashboardById, DASHBOARDS } from '@/content/certs';
import { useUi } from '@/state/ui';

/** Focus mode: once a lab is open, the side rail shrinks to icons and the lab picker folds away. */
export const useFocus = create<{ focus: boolean; setFocus: (focus: boolean) => void }>((set) => ({ focus: false, setFocus: (focus) => set({ focus }) }));

/**
 * In focus mode the rail keeps a slim 52px slot. Hovering it slides the full rail out over the
 * canvas (no layout jump); moving the mouse away folds it back.
 */
export function useRailPeek() {
  const slim = useFocus((s) => s.focus);
  const [peek, setPeek] = useState(false);
  useEffect(() => {
    if (!slim) setPeek(false);
  }, [slim]);
  const compact = slim && !peek;
  const navProps = slim ? { onMouseOver: () => setPeek(true), onMouseLeave: () => setPeek(false), onFocus: () => setPeek(true), onBlur: (e: React.FocusEvent) => !e.currentTarget.contains(e.relatedTarget as Node) && setPeek(false) } : {};
  const overlay = slim ? cx('md:absolute md:inset-y-0 md:left-0 md:z-40 md:transition-[width,box-shadow] md:duration-150', peek && 'md:shadow-2xl') : '';
  const wrap = (nav: React.ReactNode) => (slim ? <div className="max-md:contents md:relative md:w-[52px] md:shrink-0">{nav}</div> : nav);
  return { slim, compact, navProps, overlay, wrap };
}

/** Top of the left rail: the AEGIS mark. Hover, focus or tap it to switch certificate. */
export function RailBrand() {
  const { certId, setCert } = useUi();
  const current = dashboardById(certId) ?? dashboardById('networking')!;
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const focus = useFocus((s) => s.focus);
  return (
      <div className="group relative mx-0.5 shrink-0 md:mx-1.5 md:mb-1" onMouseLeave={() => setOpen(false)}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`AEGIS. Dashboard: ${current.title}. Change certificate`}
          title={`${current.title}: ${current.summary}`}
          className={cx('flex h-9 w-full items-center justify-center rounded-[5px] px-1 font-semibold tracking-tight hover:bg-pane-2', focus ? 'min-w-[40px] text-[10.5px]' : 'min-w-[60px] text-[13.5px]')}
          data-testid="cert-switch"
          data-value={current.id}
        >
          AEGIS
        </button>
        <div
          role="menu"
          aria-label="Choose a certificate"
          className={cx(
            'absolute bottom-full left-0 z-[2200] pb-1 transition-opacity duration-150 md:top-0 md:bottom-auto md:left-full md:pb-0 md:pl-1',
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
  );
}

const iconBtn = 'grid size-9 shrink-0 place-items-center rounded-[6px] text-muted hover:bg-pane-2 hover:text-text';

/** Bottom of the left rail: Actions (Ctrl K), theme and sign out. */
export function RailActions() {
  const { theme, setTheme, setPalette } = useUi();
  return (
    <div className="flex shrink-0 items-center gap-0.5 px-0.5 md:mt-auto md:flex-col md:border-t md:border-line md:px-0 md:pt-2" data-testid="rail-actions">
      <button type="button" onClick={() => setPalette(true)} className={iconBtn} title="Actions (Ctrl K)" aria-label="Actions (Ctrl K)" data-testid="rail-command">
        <Command className="size-4" />
      </button>
      <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className={iconBtn} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
      <button type="button" onClick={() => void signOut()} className={iconBtn} title="Sign out" aria-label="Sign out">
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
