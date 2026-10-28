'use client';

import clsx from 'clsx';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import type { Health, Priority, TicketStatus } from '@/api/types';
import { errorText } from './providers';

export const cx = clsx;

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({ variant = 'secondary', size = 'md', busy, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; busy?: boolean }) {
  return (
    <button
      {...p}
      disabled={p.disabled || busy}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-[5px] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-3 text-[13px]',
        variant === 'primary' && 'bg-action text-action-ink hover:brightness-110',
        variant === 'secondary' && 'border border-line-strong bg-pane-2 text-text hover:border-action',
        variant === 'ghost' && 'text-muted hover:bg-pane-2 hover:text-text',
        variant === 'danger' && 'border border-down/60 bg-down/10 text-down hover:bg-down/20',
        className,
      )}
    >
      {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button {...p} aria-label={label} title={label} className={cx('grid size-8 place-items-center rounded-[5px] text-muted hover:bg-pane-2 hover:text-text', className)}>
      {children}
    </button>
  );
}

const TONES = {
  neutral: 'border-line-strong text-muted',
  info: 'border-action/50 text-action bg-action/10',
  good: 'border-healthy/50 text-healthy bg-healthy/10',
  warn: 'border-degraded/50 text-degraded bg-degraded/10',
  bad: 'border-down/50 text-down bg-down/10',
} as const;
export function Badge({ tone = 'neutral', children, className, title }: { tone?: keyof typeof TONES; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex h-5 items-center gap-1 rounded-[4px] border px-1.5 text-[11.5px] leading-none font-medium whitespace-nowrap', TONES[tone], className)}>
      {children}
    </span>
  );
}

export function PriorityBadge({ p }: { p: Priority }) {
  const tone = p === 'P1' ? 'bad' : p === 'P2' ? 'warn' : p === 'P3' ? 'info' : 'neutral';
  return <Badge tone={tone}>{p}</Badge>;
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  investigating: 'Investigating',
  pending_verification: 'Checking',
  verified: 'Verified',
  client_explanation: 'Explain to client',
  debrief: 'Debrief',
  closed: 'Closed',
};
export function StatusBadge({ s }: { s: TicketStatus }) {
  const tone = s === 'new' ? 'info' : s === 'closed' ? 'neutral' : s === 'verified' || s === 'client_explanation' || s === 'debrief' ? 'good' : s === 'pending_verification' ? 'warn' : 'neutral';
  return <Badge tone={tone}>{STATUS_LABEL[s]}</Badge>;
}

export function HealthDot({ h, power, className }: { h: Health; power?: string; className?: string }) {
  const c = power === 'stopped' || h === 'down' ? 'bg-down' : h === 'degraded' ? 'bg-degraded' : h === 'healthy' ? 'bg-healthy' : 'bg-faint';
  return <span aria-label={power === 'stopped' ? 'powered off' : h} title={power === 'stopped' ? 'powered off' : h} className={cx('inline-block size-2 shrink-0 rounded-full', c, className)} />;
}

export function Pane({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx('flex min-h-0 flex-col overflow-hidden rounded-[6px] border border-line bg-pane', className)}>
      {(title || actions) && (
        <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
          <h2 className="truncate text-[13px] font-semibold">{title}</h2>
          <div className="flex items-center gap-1">{actions}</div>
        </header>
      )}
      <div className={cx('min-h-0 flex-1 overflow-auto', bodyClassName)}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="font-medium">{title}</p>
      {body && <p className="max-w-sm text-[13px] text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div role="alert" className="flex h-full min-h-24 flex-col items-center justify-center gap-2 p-4 text-center">
      <AlertTriangle className="size-5 text-down" aria-hidden />
      <p className="max-w-md text-[13px] text-text">{errorText(error)}</p>
      {retry && (
        <Button size="sm" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-pane-2" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

/** Wraps a query's three states so every panel has loading, error and empty handling. */
export function QueryView<T>({ q, empty, children, rows }: { q: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => unknown }; empty?: (d: T) => boolean | ReactNode; children: (d: T) => ReactNode; rows?: number }) {
  if (q.isLoading) return <Loading rows={rows} />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (q.data === undefined) return null;
  if (empty) {
    const e = empty(q.data);
    if (e === true) return <EmptyState title="Nothing here yet" />;
    if (e) return <>{e}</>;
  }
  return <>{children(q.data)}</>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-pane-2 px-1 font-mono text-[11px] text-muted">{children}</kbd>;
}

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx('h-8 w-full rounded-[5px] border border-line-strong bg-ink px-2.5 text-[13px] text-text placeholder:text-faint focus:border-action', p.className)} />;
}
export function Textarea(p: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx('w-full rounded-[5px] border border-line-strong bg-ink px-2.5 py-2 text-[13px] text-text placeholder:text-faint focus:border-action', p.className)} />;
}
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[12.5px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-faint">{hint}</span>}
    </label>
  );
}

export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} className={cx('m-auto w-[calc(100%-32px)] rounded-[8px] border border-line-strong bg-pane p-0 text-text backdrop:bg-black/55', wide ? 'max-w-3xl' : 'max-w-md')}>
      {open && (
        <div>
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <IconButton label="Close" onClick={onClose}>
              <X className="size-4" />
            </IconButton>
          </header>
          <div className="p-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

/** Destructive actions say what they affect and, when it matters, ask for a typed confirmation. */
export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel, typed, busy }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: ReactNode; confirmLabel: string; typed?: string; busy?: boolean }) {
  const [v, setV] = useState('');
  useEffect(() => {
    if (!open) setV('');
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="space-y-4 text-[13.5px]">
        <div className="text-muted">{body}</div>
        {typed && (
          <Field label={`Type ${typed} to confirm`}>
            <Input autoFocus value={v} onChange={(e) => setV(e.target.value)} aria-label={`Type ${typed} to confirm`} />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" busy={busy} disabled={!!typed && v !== typed} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: { key: K; label: ReactNode }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <button key={t.key} role="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)} className={cx('-mb-px border-b-2 px-3 py-2 text-[13px]', value === t.key ? 'border-action text-text' : 'border-transparent text-muted hover:text-text')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------- time ----------
export function useNow(ms = 1000) {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

export function relTime(isoStr: string, now = Date.now()): string {
  const d = (now - Date.parse(isoStr)) / 1000;
  if (d < 45) return 'just now';
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  return `${Math.round(d / 86400)} d ago`;
}

export function fmtDuration(ms: number): string {
  const neg = ms < 0;
  const s = Math.abs(Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const out = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return neg ? `-${out}` : out;
}

export function SlaClock({ due, closed }: { due: string; closed?: boolean }) {
  const now = useNow(1000);
  if (closed) return <span className="text-faint">done</span>;
  const left = Date.parse(due) - now;
  const tone = left < 0 ? 'text-down font-semibold' : left < 30 * 60e3 ? 'text-degraded' : 'text-muted';
  return (
    <span className={cx('tabular-nums', tone)} title={`SLA due ${new Date(due).toLocaleString()}`}>
      {left < 0 ? `breached ${fmtDuration(-left)} ago` : `${fmtDuration(left)} left`}
    </span>
  );
}

export function fmtBytes(bps: number): string {
  const b = bps * 8;
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} Gb/s`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} Mb/s`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(0)} kb/s`;
  return `${Math.round(b)} b/s`;
}
