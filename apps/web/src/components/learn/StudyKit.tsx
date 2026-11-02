'use client';

// Shared pieces for Learn pages that follow the Learn by topic layout:
// a contents sidebar on the left (ring, continue, filters, chapter accordion) and one focused item on the right.
import { ArrowRight, Check, ChevronRight, PanelLeftClose, PanelLeftOpen, Play } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cx } from '@/components/ui';

export function MiniRing({ pct, size, stroke, color, children }: { pct: number; size: number; stroke: number; color: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-line" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.16,1,.3,1)', filter: pct ? `drop-shadow(0 0 3px ${color})` : undefined }} />
      </svg>
      {children}
    </span>
  );
}

/** Read and write a small JSON value in this browser, with a safe fallback. */
export function useStored<T>(key: string, init: T) {
  const [v, setV] = useState<T>(init);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setV({ ...init, ...JSON.parse(raw) });
    } catch {
      /* storage blocked */
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (next: T) => {
    setV(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* progress lasts for this visit */
    }
  };
  return [v, set] as const;
}

/** Remembered show / hide for a page's sidebar. Starts open on wide screens. */
export function useSide(key: string) {
  const [side, setSide] = useState(true);
  useEffect(() => {
    let v: string | null = null;
    try {
      v = window.localStorage.getItem(key);
    } catch {
      /* optional */
    }
    setSide(v === null ? window.innerWidth >= 1100 : v === '1');
  }, [key]);
  const set = (b: boolean) => {
    setSide(b);
    try {
      window.localStorage.setItem(key, b ? '1' : '0');
    } catch {
      /* optional */
    }
  };
  return [side, set] as const;
}

export type SideItem = { id: string; label: string; done: boolean; mark?: ReactNode };
export type SideGroup = { key: string; title: string; hue: string; items: SideItem[] };

/**
 * The contents sidebar used across Learn: progress ring, a Continue button, All / To do / Done filters,
 * and an accordion of groups with a timeline of items. `current` is the open item's id.
 */
export function StudySide({
  eyebrow,
  doneLabel,
  groups,
  current,
  onItem,
  onHide,
  testid,
  extra,
  footer,
}: {
  eyebrow: string;
  doneLabel: string;
  groups: SideGroup[];
  current?: string;
  onItem: (id: string) => void;
  onHide: () => void;
  testid: string;
  extra?: ReactNode;
  footer?: ReactNode;
}) {
  const all = groups.flatMap((g) => g.items);
  const done = all.filter((x) => x.done).length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  const curGroup = groups.find((g) => g.items.some((x) => x.id === current))?.key;
  const [open, setOpen] = useState<Set<string>>(() => new Set([curGroup ?? groups[0]?.key ?? '']));
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('all');
  const curRef = useRef<HTMLButtonElement>(null);
  const next = all.find((x) => !x.done && x.id !== current);
  useEffect(() => {
    if (!curGroup) return;
    setOpen((s) => (s.has(curGroup) ? s : new Set([...s, curGroup])));
    const id = setTimeout(() => curRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 300);
    return () => clearTimeout(id);
  }, [current, curGroup]);
  return (
    <aside className="book-toc sticky top-0 hidden h-[calc(100dvh-96px)] w-[300px] shrink-0 flex-col self-start md:flex" aria-label={`${eyebrow} contents`} data-testid={testid}>
      <div className="toc-head relative mb-3 flex items-center gap-3 overflow-hidden rounded-2xl px-3 py-3">
        <MiniRing pct={pct} size={46} stroke={4} color="var(--action)">
          <span className="text-[11px] font-semibold">{pct}%</span>
        </MiniRing>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold tracking-[0.22em] text-faint uppercase">{eyebrow}</p>
          <p className="text-[12.5px] text-text">
            <b>{done}</b>
            <span className="text-muted">
              {' '}
              / {all.length} {doneLabel}
            </span>
          </p>
        </div>
        <button type="button" onClick={onHide} className="grid size-7 place-items-center rounded-md text-muted hover:bg-pane-2 hover:text-text" title="Hide contents" aria-label="Hide contents" data-testid={`${testid}-hide`}>
          <PanelLeftClose className="size-4" />
        </button>
      </div>
      {next && (
        <button type="button" onClick={() => onItem(next.id)} className="toc-continue group mb-3 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left" data-testid={`${testid}-continue`}>
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-action text-white shadow-[0_0_14px_var(--action)]">
            <Play className="size-3.5 translate-x-px fill-current" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold tracking-[0.18em] text-action uppercase">Continue · {groups.find((g) => g.items.includes(next))?.title}</span>
            <span className="block truncate text-[12.5px] text-text">{next.label}</span>
          </span>
          <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-1" />
        </button>
      )}
      {extra}
      <div className="mb-2 flex gap-1" role="radiogroup" aria-label="Show">
        {([['all', 'All'], ['todo', 'To do'], ['done', 'Done']] as const).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => setFilter(k)} className={cx('toc-chip rounded-full px-2.5 py-1 text-[11.5px]', filter === k ? 'is-on' : 'text-muted hover:text-text')}>
            {label}
          </button>
        ))}
      </div>
      <nav className="toc-scroll min-h-0 flex-1 overflow-y-auto pr-1">
        <ol className="space-y-1">
          {groups.map((g, gi) => {
            const shown = filter === 'all' ? g.items : g.items.filter((x) => (filter === 'done') === x.done);
            if (!shown.length) return null;
            const gDone = g.items.filter((x) => x.done).length;
            const isOpen = filter !== 'all' || open.has(g.key);
            const isCur = g.key === curGroup;
            const curIdx = shown.findIndex((x) => x.id === current);
            const lastDone = shown.reduce((m, x, k) => (x.done ? k : m), -1);
            const reach = Math.max(curIdx, lastDone);
            return (
              <li key={g.key} className={cx('toc-chapter rounded-xl', isCur && 'is-current')} style={{ '--hue': g.hue } as CSSProperties}>
                <button
                  type="button"
                  onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
                  aria-expanded={isOpen}
                  className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left"
                >
                  <MiniRing pct={g.items.length ? (gDone / g.items.length) * 100 : 0} size={28} stroke={2.5} color={g.hue}>
                    <span className="text-[10.5px] font-semibold" style={{ color: isCur ? g.hue : undefined }}>
                      {gi + 1}
                    </span>
                  </MiniRing>
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate text-[12.5px] leading-tight', isCur ? 'font-semibold text-text' : 'text-muted group-hover:text-text')}>{g.title}</span>
                    <span className="block text-[10.5px] text-faint">{gDone === g.items.length ? '✓ Done' : `${gDone}/${g.items.length} done`}</span>
                  </span>
                  <ChevronRight className={cx('size-3.5 text-faint transition-transform duration-300', isOpen && 'rotate-90')} />
                </button>
                <div className={cx('grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(.16,1,.3,1)]', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                  <div className="min-h-0 overflow-hidden">
                    <ol className="toc-line relative mt-0.5 mb-2 ml-[46px] pl-4" style={{ '--reach': shown.length ? `${((reach + 0.5) / shown.length) * 100}%` : '0%' } as CSSProperties}>
                      {shown.map((x) => {
                        const on = x.id === current;
                        return (
                          <li key={x.id} className="relative">
                            <span className={cx('toc-node', on ? 'is-on' : x.done ? 'is-done' : '')} aria-hidden>
                              {x.done && !on && <Check className="size-2 text-ink" strokeWidth={4} />}
                            </span>
                            <button ref={on ? curRef : undefined} type="button" onClick={() => onItem(x.id)} aria-current={on ? 'page' : undefined} className={cx('toc-lesson flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-muted', on && 'is-on')} data-testid={`${testid}-item-${x.id}`}>
                              <span className="line-clamp-2 min-w-0 flex-1 leading-snug">{x.label}</span>
                              {x.mark}
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </nav>
      {footer}
    </aside>
  );
}

/** The small button that brings a hidden sidebar back. */
export function ShowSide({ onShow, label = 'Contents' }: { onShow: () => void; label?: string }) {
  return (
    <button type="button" onClick={onShow} className="toc-chip hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] text-muted hover:text-text md:inline-flex" data-testid="study-side-show">
      <PanelLeftOpen className="size-3.5" /> {label}
    </button>
  );
}

/** Thin segmented stepper (same look as the lesson stepper): one segment per item in the current group. */
export function Segments({ n, at, done, onPick, hue, labels }: { n: number; at: number; done: (k: number) => boolean; onPick: (k: number) => void; hue: string; labels?: string[] }) {
  return (
    <ol className="book-segments" style={{ '--hue': hue } as CSSProperties} aria-label="Items in this group">
      {Array.from({ length: n }, (_, k) => (
        <li key={k}>
          <button type="button" onClick={() => onPick(k)} data-state={k === at ? 'current' : done(k) ? 'done' : 'todo'} aria-label={labels?.[k] ?? `Item ${k + 1}`} data-label={labels?.[k] ? `${k + 1}. ${labels[k]}` : undefined} aria-current={k === at ? 'step' : undefined} />
        </li>
      ))}
    </ol>
  );
}
