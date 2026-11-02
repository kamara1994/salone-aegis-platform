'use client';

import { Command, LogOut, Moon, Pin, PinOff, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { signOut } from '@/api/auth';
import { cx } from '@/components/ui';
import { CERTS, dashboardById, DASHBOARDS } from '@/content/certs';
import { useUi } from '@/state/ui';
import { readArena } from '@/lab/arena/progress';

/** Focus mode: once a lab is open, the side rail shrinks to icons and the lab picker folds away. */
export const useFocus = create<{ focus: boolean; setFocus: (focus: boolean) => void }>((set) => ({ focus: false, setFocus: (focus) => set({ focus }) }));

/** Rail state shared by both rails: open (peeking) and pinned (kept open, pushing the page over). */
const PIN_KEY = 'aegis.rail.pinned';
export const useRail = create<{ open: boolean; pinned: boolean; setOpen: (v: boolean) => void; togglePin: () => void }>((set, get) => ({
  open: false,
  pinned: false,
  setOpen: (open) => set({ open }),
  togglePin: () => {
    const pinned = !get().pinned;
    try {
      window.localStorage.setItem(PIN_KEY, pinned ? '1' : '0');
    } catch {
      /* storage blocked */
    }
    set({ pinned, open: pinned });
  },
}));

/**
 * The left rail is fully hidden on desktop. Resting on the left edge for a moment (or pressing [)
 * wipes it in as a black HUD panel: a light scan line crosses it and labels resolve one by one.
 * Items magnify like a dock under the pointer. It wipes away a moment after the pointer leaves,
 * unless pinned. Phones keep the bottom bar.
 */
export function useRailPeek() {
  const { open: peek, pinned, setOpen } = useRail();
  const open = peek || pinned;
  const closeT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const openT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = () => {
    clearTimeout(closeT.current);
    setOpen(true);
  };
  // The edge waits a beat so brushing past the side of the screen does not open it.
  const armEdge = () => {
    clearTimeout(closeT.current);
    if (!openT.current) openT.current = setTimeout(() => { openT.current = undefined; setOpen(true); }, 150);
  };
  const disarmEdge = () => {
    clearTimeout(openT.current);
    openT.current = undefined;
  };
  const hide = (ms = 280) => {
    clearTimeout(closeT.current);
    closeT.current = setTimeout(() => setOpen(false), ms);
  };
  // Restore the pin after hydration so server and browser render the same first frame.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(PIN_KEY) === '1') useRail.setState({ pinned: true });
    } catch {
      /* storage blocked */
    }
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable || !!t.closest('.xterm');
      if (e.key === 'Escape') setOpen(false);
      else if (e.key === '[' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        clearTimeout(closeT.current);
        setOpen(!useRail.getState().open);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [setOpen]);
  // Dock magnification: the item under the pointer grows most, its neighbours a little.
  const magnify = (e: React.MouseEvent<HTMLElement>) => {
    for (const el of e.currentTarget.querySelectorAll<HTMLElement>('[data-rail-item]')) {
      const r = el.getBoundingClientRect();
      const d = Math.abs(e.clientY - (r.top + r.height / 2));
      el.style.setProperty('--mag', (1 + 0.42 * Math.max(0, 1 - d / 110) ** 2).toFixed(3));
    }
  };
  const settle = (nav: HTMLElement) => nav.querySelectorAll<HTMLElement>('[data-rail-item]').forEach((el) => el.style.setProperty('--mag', '1'));
  const navProps = {
    'data-open': open || undefined,
    'data-pinned': pinned || undefined,
    onMouseEnter: show,
    onMouseMove: magnify,
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      settle(e.currentTarget);
      hide();
    },
    onFocus: show,
    onBlur: (e: React.FocusEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) hide(0);
    },
  };
  const overlay = cx('edge-rail md:fixed md:inset-y-0 md:left-0 md:z-[60]', !open && 'md:pointer-events-none');
  const wrap = (nav: React.ReactNode) => (
    <>
      {/* Pinned: hold the rail's width so the page moves over instead of sitting under it. */}
      {pinned && <div className="hidden w-[92px] shrink-0 md:block" aria-hidden />}
      <div className="fixed inset-y-0 left-0 z-[59] w-2 max-md:hidden" onMouseEnter={armEdge} onMouseMove={armEdge} onMouseLeave={disarmEdge} onPointerDown={show} aria-hidden data-testid="rail-edge" />
      {nav}
    </>
  );
  return { slim: false, compact: false, navProps, overlay, wrap, open };
}

/** Pin button for the top corner of the rail. */
export function RailPin() {
  const { pinned, togglePin } = useRail();
  return (
    <button type="button" onClick={togglePin} className="rail-pin max-md:hidden" aria-pressed={pinned} title={pinned ? 'Unpin: hide the menu again ( [ )' : 'Pin the menu open ( [ toggles it )'} aria-label={pinned ? 'Unpin the menu' : 'Pin the menu open'} data-testid="rail-pin">
      {pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
    </button>
  );
}

/** SpaceX-style readout under the icons: area, lessons done and labs passed on this computer. */
export function RailStatus({ short }: { short: string }) {
  const open = useRail((s) => s.open || s.pinned);
  const [stat, setStat] = useState({ lessons: 0, labs: 0 });
  useEffect(() => {
    if (!open) return;
    let lessons = 0;
    try {
      const saved = JSON.parse(window.localStorage.getItem('aegis.ccna-book.v8.1') ?? '{}') as { completed?: string[] };
      lessons = Array.isArray(saved.completed) ? saved.completed.length : 0;
    } catch {
      /* none yet */
    }
    const best = new Map<string, number>();
    for (const a of readArena().attempts) best.set(a.labId, Math.max(best.get(a.labId) ?? 0, a.pct));
    setStat({ lessons, labs: [...best.values()].filter((p) => p >= 80).length });
  }, [open]);
  return (
    <div className="rail-status max-md:hidden" data-testid="rail-status" aria-label={`${short}: ${stat.lessons} lessons done, ${stat.labs} labs passed`}>
      <span>{short}</span>
      <span>
        <b>{String(stat.lessons).padStart(2, '0')}</b> LSN
      </span>
      <span>
        <b>{String(stat.labs).padStart(2, '0')}</b> LAB
      </span>
    </div>
  );
}

/** Top of the left rail: the AEGIS mark. Hover, focus or tap it to switch certificate. */
export function RailBrand() {
  const { certId, setCert } = useUi();
  const current = dashboardById(certId) ?? dashboardById('networking')!;
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hoverOpen = () => {
    clearTimeout(t.current);
    t.current = setTimeout(() => setOpen(true), 90);
  };
  const hoverClose = () => {
    clearTimeout(t.current);
    t.current = setTimeout(() => setOpen(false), 180);
  };
  return (
      <div className="relative mx-0.5 shrink-0 md:mx-1.5 md:mb-2" data-rail-item onMouseEnter={hoverOpen} onMouseLeave={hoverClose} onFocus={() => setOpen(true)} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`AEGIS. Dashboard: ${current.title}. Change certificate`}
          title={`${current.title}: ${current.summary}`}
          className={cx('rail-brand flex h-10 w-full min-w-[60px] items-center justify-center px-1 text-[13.5px] font-semibold', open && 'is-open')}
          data-testid="cert-switch"
          data-value={current.id}
        >
          AEGIS
        </button>
        <div
          role="menu"
          aria-label="Choose a certificate"
          className="cert-pop absolute bottom-full left-0 z-[2200] pb-2 md:top-0 md:bottom-auto md:left-full md:pb-0 md:pl-3"
          data-open={open || undefined}
          data-testid="cert-menu"
        >
          <ul className="cert-list w-[330px] max-w-[90vw]">
            <li className="cert-head">Certification area</li>
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
                    onMouseMove={(e) => e.currentTarget.style.setProperty('--mx', `${e.clientX - e.currentTarget.getBoundingClientRect().left}px`)}
                    className={cx('cert-item flex w-full items-start gap-3 px-4 py-2.5 text-left', on && 'is-on')}
                    data-testid={`cert-option-${x.id}`}
                  >
                    <span className="cert-dot" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="cert-title block">{x.title}</span>
                      <span className="cert-sub block truncate">{x.certs.map((c) => CERTS.find((k) => k.id === c)?.short).join(' · ')}</span>
                    </span>
                    <span className="cert-arrow" aria-hidden>→</span>
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
      <button type="button" data-rail-item onClick={() => setPalette(true)} className={iconBtn} title="Actions (Ctrl K)" aria-label="Actions (Ctrl K)" data-testid="rail-command">
        <Command className="size-4" />
      </button>
      <button type="button" data-rail-item onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className={iconBtn} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
      <button type="button" data-rail-item onClick={() => void signOut()} className={iconBtn} title="Sign out" aria-label="Sign out">
        <LogOut className="size-4" />
      </button>
    </div>
  );
}
