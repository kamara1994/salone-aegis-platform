'use client';

import { AlertTriangle, Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLab } from '@/lab/store';
import type { CableEnd, CableIssue, CableType } from '@/lab/types';
import { CABLE_LABEL, CABLE_TYPES, cableOnPort, cableStatus, deviceById, ifaceOf, otherEnd, portAvailability, portTypeName, suggestCableType } from '@/lab/validate';
import { Button, cx, Dialog, IconButton } from '@/components/ui';

export function CableTypeSelect({ value, onChange, id, allowAuto = true }: { value: CableType | 'auto'; onChange: (v: CableType | 'auto') => void; id?: string; allowAuto?: boolean }) {
  return (
    <select id={id} aria-label="Cable type" value={value} onChange={(e) => onChange(e.target.value as CableType | 'auto')} className="h-8 rounded-[5px] border border-line-strong bg-ink px-2 text-[12.5px]">
      {allowAuto && <option value="auto">Automatic (pick for me)</option>}
      {CABLE_TYPES.map((t) => (
        <option key={t} value={t}>
          {CABLE_LABEL[t]}
        </option>
      ))}
    </select>
  );
}

/** Lists every port on a device with its state and whether the chosen cable fits it. */
export function PortPicker({ open, deviceId, from, ignoreCableId, title, onPick, onCancel, showType = true }: { open: boolean; deviceId: string | null; from?: CableEnd | null; ignoreCableId?: string; title: string; onPick: (port: string) => void; onCancel: () => void; showType?: boolean }) {
  const doc = useLab((s) => s.doc);
  const cableType = useLab((s) => s.cableType);
  const setCableType = useLab((s) => s.setCableType);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) setTimeout(() => listRef.current?.querySelector<HTMLButtonElement>('button[data-ok="true"]')?.focus(), 30);
  }, [open, deviceId]);
  const device = doc && deviceId ? deviceById(doc, deviceId) : undefined;
  const fromDev = doc && from ? deviceById(doc, from.device) : undefined;
  return (
    <Dialog open={open && !!device} onClose={onCancel} title={title} wide>
      {device && doc && (
        <div className="space-y-3">
          {from && fromDev && (
            <p className="text-[12.5px] text-muted">
              From <span className="font-medium text-text">{fromDev.name} {from.port}</span>. Ports that cannot take this cable are crossed out with the reason; picking one shows exactly why.
            </p>
          )}
          {showType && (
            <label className="flex items-center gap-2 text-[12.5px]">
              <span className="text-muted">Cable</span>
              <CableTypeSelect value={cableType} onChange={setCableType} />
              {cableType === 'auto' && from && <span className="text-faint">uses the cable an engineer would pick for each port</span>}
            </label>
          )}
          <div ref={listRef} role="listbox" aria-label={`Ports on ${device.name}`} className="max-h-[50vh] overflow-auto rounded border border-line">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-pane-2 text-left text-[11.5px] text-muted">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Port</th>
                  <th className="px-2 py-1.5 font-medium">Type</th>
                  <th className="px-2 py-1.5 font-medium">Speed</th>
                  <th className="px-2 py-1.5 font-medium">State</th>
                  <th className="px-2 py-1.5 font-medium">Fits this cable?</th>
                </tr>
              </thead>
              <tbody>
                {device.interfaces
                  .filter((i) => !i.parent && !/^vlan\d+$/i.test(i.name) && !(i.type === 'virtual' && i.ip && device.interfaces.some((x) => x.bridge === i.name)))
                  .map((i) => {
                    const av = portAvailability(doc, device.id, i.name, cableType, from ?? undefined, ignoreCableId);
                    const used = cableOnPort(doc, device.id, i.name, ignoreCableId);
                    const peer = used ? otherEnd(used, device.id, i.name) : undefined;
                    const t = from ? (cableType === 'auto' ? suggestCableType(doc, from, { device: device.id, port: i.name }) : cableType) : null;
                    return (
                      <tr key={i.name} className={cx('border-t border-line', !av.ok && 'text-muted')}>
                        <td className="px-2 py-1">
                          <button
                            type="button"
                            role="option"
                            aria-selected={false}
                            data-ok={av.ok}
                            data-testid={`port-option-${i.name}`}
                            aria-describedby={`why-${i.name}`}
                            onClick={() => onPick(i.name)}
                            className={cx('rounded px-1.5 py-0.5 text-left font-mono hover:bg-pane-2 focus-visible:bg-pane-2', !av.ok && 'line-through decoration-down/70')}
                          >
                            {i.name}
                          </button>
                        </td>
                        <td className="px-2 py-1 text-muted">{portTypeName(i.type)}</td>
                        <td className="px-2 py-1 font-mono text-[11.5px]">{i.speed === 'auto' ? `auto ${i.speeds.join('/')}` : `${i.speed}`}{i.duplex !== 'auto' ? ` ${i.duplex}` : ''}</td>
                        <td className="px-2 py-1">{i.shutdown ? <span className="text-degraded">shutdown</span> : used ? <span>to {deviceById(doc, peer!.device)?.name} {peer!.port}</span> : <span className="text-healthy">free</span>}</td>
                        <td id={`why-${i.name}`} className="px-2 py-1 text-[12px]">
                          {av.ok ? (
                            <span className="inline-flex items-center gap-1 text-healthy">
                              <Check className="size-3.5" /> {t ? CABLE_LABEL[t] : 'Free'}
                            </span>
                          ) : (
                            <span className="inline-flex items-start gap-1 text-down">
                              <X className="mt-0.5 size-3.5 shrink-0" /> {av.reason}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Keyboard-friendly cable form: both ends and the cable type in one place. */
export function NewCableDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: Partial<{ a: CableEnd; b: CableEnd }> }) {
  const doc = useLab((s) => s.doc);
  const connect = useLab((s) => s.connect);
  const setError = useLab((s) => s.setError);
  const [a, setA] = useState<CableEnd>({ device: '', port: '' });
  const [b, setB] = useState<CableEnd>({ device: '', port: '' });
  const [type, setType] = useState<CableType | 'auto'>('auto');
  const [issues, setIssues] = useState<CableIssue[]>([]);
  useEffect(() => {
    if (open) {
      setA({ device: initial?.a?.device ?? '', port: initial?.a?.port ?? '' });
      setB({ device: initial?.b?.device ?? '', port: initial?.b?.port ?? '' });
      setType('auto');
      setIssues([]);
    }
  }, [open, initial]);
  if (!doc) return null;
  const ports = (id: string) => deviceById(doc, id)?.interfaces.filter((i) => !i.parent && !/^vlan\d+$/i.test(i.name)) ?? [];
  const effective: CableType | null = a.device && a.port && b.device && b.port ? (type === 'auto' ? suggestCableType(doc, a, b) : type) : null;
  const end = (label: string, v: CableEnd, set: (e: CableEnd) => void, key: string) => (
    <fieldset className="space-y-1.5">
      <legend className="text-[12px] font-medium text-muted">{label}</legend>
      <div className="flex gap-2">
        <select aria-label={`${label} device`} value={v.device} onChange={(e) => set({ device: e.target.value, port: '' })} className="h-8 min-w-0 flex-1 rounded-[5px] border border-line-strong bg-ink px-2 text-[13px]" data-testid={`cable-${key}-device`}>
          <option value="">Device…</option>
          {[...doc.devices].sort((x, y) => x.name.localeCompare(y.name)).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select aria-label={`${label} port`} value={v.port} onChange={(e) => set({ ...v, port: e.target.value })} disabled={!v.device} className="h-8 w-36 rounded-[5px] border border-line-strong bg-ink px-2 font-mono text-[12.5px]" data-testid={`cable-${key}-port`}>
          <option value="">Port…</option>
          {ports(v.device).map((i) => {
            const used = cableOnPort(doc, v.device, i.name);
            return (
              <option key={i.name} value={i.name}>
                {i.name} {used ? '(in use)' : ''}
              </option>
            );
          })}
        </select>
      </div>
    </fieldset>
  );
  return (
    <Dialog open={open} onClose={onClose} title="New cable">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!effective) return;
          const r = connect(a, b, effective);
          if (!r.ok) {
            setIssues(r.issues);
            setError({ title: 'This cable cannot be connected', issues: r.issues });
            return;
          }
          const problems = r.issues.filter((i) => i.severity === 'down' || i.severity === 'degraded');
          setError(problems.length ? { title: 'Connected, but the link has problems', issues: problems, tone: 'warn' } : null);
          onClose();
        }}
      >
        {end('First end', a, setA, 'a')}
        {end('Second end', b, setB, 'b')}
        <label className="flex items-center gap-2 text-[12.5px]">
          <span className="text-muted">Cable</span>
          <CableTypeSelect value={type} onChange={setType} />
        </label>
        {effective && type === 'auto' && <p className="text-[12px] text-muted">Will use: {CABLE_LABEL[effective]}</p>}
        {issues.length > 0 && <IssueList issues={issues} />}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!effective} data-testid="cable-connect">
            Connect
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function IssueList({ issues, compact }: { issues: CableIssue[]; compact?: boolean }) {
  return (
    <ul className="space-y-1.5" data-testid="cable-issues">
      {issues.map((i, k) => (
        <li key={k} className={cx('rounded border px-2 py-1.5 text-[12.5px]', i.severity === 'error' || i.severity === 'down' ? 'border-down/50 bg-down/5' : i.severity === 'degraded' ? 'border-degraded/50 bg-degraded/5' : 'border-line bg-pane-2')}>
          <span className={cx('mr-1 font-semibold', i.severity === 'error' || i.severity === 'down' ? 'text-down' : i.severity === 'degraded' ? 'text-degraded' : 'text-muted')}>{i.severity === 'error' ? 'Cannot connect.' : i.severity === 'down' ? 'Link down.' : i.severity === 'degraded' ? 'Problem.' : 'Note.'}</span>
          {i.message}
          {!compact && i.fix && <div className="mt-0.5 text-muted">Fix: {i.fix}</div>}
        </li>
      ))}
    </ul>
  );
}

/** Alert shown over the canvas after a rejected action. */
export function ErrorBanner() {
  const e = useLab((s) => s.lastError);
  const setError = useLab((s) => s.setError);
  if (!e) return null;
  return (
    <div role="alert" className={cx('absolute top-2 left-1/2 z-20 w-[min(560px,calc(100%-24px))] -translate-x-1/2 rounded-[8px] border bg-pane p-3 shadow-lg', e.tone === 'ok' ? 'border-healthy/60' : e.tone === 'warn' ? 'border-degraded/60' : 'border-down/60')} data-testid="lab-error" data-tone={e.tone ?? 'error'}>
      <div className="mb-2 flex items-start gap-2">
        {e.tone === 'ok' ? <Check className="mt-0.5 size-4 shrink-0 text-healthy" /> : <AlertTriangle className={cx('mt-0.5 size-4 shrink-0', e.tone === 'warn' ? 'text-degraded' : 'text-down')} />}
        <p className="flex-1 text-[13px] font-semibold">{e.title}</p>
        <IconButton label="Dismiss" onClick={() => setError(null)}>
          <X className="size-4" />
        </IconButton>
      </div>
      {e.issues.length > 0 && <IssueList issues={e.issues} />}
    </div>
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
  separator?: boolean;
}

export function ContextMenu({ x, y, title, items, onClose }: { x: number; y: number; title?: string; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLButtonElement>('button:not([disabled])');
    first?.focus();
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', away);
    return () => window.removeEventListener('mousedown', away);
  }, [onClose]);
  const move = (dir: 1 | -1) => {
    const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    btns[(i + dir + btns.length) % btns.length]?.focus();
  };
  if (typeof document === 'undefined') return null;
  // Portalled to <body> so `position: fixed` is relative to the viewport, not a transformed ancestor.
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={title ?? 'Actions'}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          move(1);
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          move(-1);
        }
      }}
      className="fixed z-50 min-w-[210px] rounded-[7px] border border-line-strong bg-pane py-1 text-[13px] shadow-xl"
      style={{ left: Math.max(4, Math.min(Number.isFinite(x) ? x : 200, window.innerWidth - 230)), top: Math.max(4, Math.min(Number.isFinite(y) ? y : 200, window.innerHeight - items.length * 32 - 40)) }}
    >
      {title && <div className="border-b border-line px-3 pt-1 pb-1.5 text-[11.5px] font-semibold text-muted">{title}</div>}
      {items.map((it, k) =>
        it.separator ? (
          <div key={k} className="my-1 border-t border-line" />
        ) : (
          <button
            key={k}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onSelect();
            }}
            className={cx('flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left hover:bg-pane-2 focus-visible:bg-pane-2 focus-visible:outline-none disabled:opacity-40', it.danger && 'text-down')}
          >
            <span>{it.label}</span>
            {it.hint && <span className="text-[11px] text-faint">{it.hint}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

/** Link test: what the two ends negotiate and every problem on the link. */
export function linkTestSummary(doc: NonNullable<ReturnType<typeof useLab.getState>['doc']>, cableId: string): { ok: boolean; title: string; issues: CableIssue[] } {
  const c = doc.cables.find((x) => x.id === cableId)!;
  const st = cableStatus(doc, c);
  const A = ifaceOf(doc, c.a);
  const B = ifaceOf(doc, c.b);
  const head = `${A.device?.name} ${c.a.port} ↔ ${B.device?.name} ${c.b.port}`;
  if (st.state === 'up') return { ok: true, title: `Link test passed: ${head} is up${st.negotiated ? ` at ${st.negotiated}` : ''}.`, issues: st.issues };
  return { ok: false, title: `Link test: ${head} is ${st.state}.`, issues: st.issues.length ? st.issues : [{ code: 'disabled', severity: 'down', message: 'No link.' }] };
}
