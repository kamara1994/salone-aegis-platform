'use client';

// Packet Tracer's bottom-right corner (Realtime / Simulation, Fast Forward Time, the PDU list)
// and the Inspect tool's floating tables.
import { Clock, FastForward, Mail, Play, Search, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cx } from '@/components/ui';
import { useBoot } from '@/lab/boot';
import { usePlayer } from '@/lab/player';
import { INSPECT_LABEL, inspectOptions, inspectText, usePt, type InspectWin } from '@/lab/ptTools';
import { useLab } from '@/lab/store';
import { deviceById } from '@/lab/validate';

/** Realtime / Simulation switch with a running clock and Fast Forward Time. */
export function ModeSwitch({ sim, setSim }: { sim: boolean; setSim: (v: boolean) => void }) {
  const [t0] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sim) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sim]);
  const s = Math.floor((now - t0) / 1000);
  const clock = `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return (
    <div className="flex items-center gap-1 rounded-full border border-line bg-pane/95 p-0.5 shadow-sm" data-testid="mode-switch">
      <span className="flex items-center gap-1 px-2 font-mono text-[11px] text-muted" title="Lab time">
        <Clock className="size-3" /> {sim ? 'paused' : clock}
      </span>
      <button
        type="button"
        onClick={() => {
          const b = useBoot.getState();
          Object.keys(b.boots).forEach((id) => b.skip(id));
          useBoot.setState({ links: {} });
        }}
        className="grid size-7 place-items-center rounded-full text-muted hover:bg-pane-2 hover:text-text"
        title="Fast Forward Time: finish boots and spanning-tree convergence now"
        aria-label="Fast Forward Time"
        data-testid="fast-forward"
      >
        <FastForward className="size-3.5" />
      </button>
      {(['realtime', 'simulation'] as const).map((m) => {
        const on = (m === 'simulation') === sim;
        return (
          <button key={m} type="button" role="radio" aria-checked={on} onClick={() => setSim(m === 'simulation')} className={cx('h-7 rounded-full px-3 text-[12px] font-medium', on ? 'bg-action text-white' : 'text-muted hover:text-text')} data-testid={`mode-${m}`}>
            {m === 'realtime' ? 'Realtime' : 'Simulation'}
          </button>
        );
      })}
    </div>
  );
}

/** Packet Tracer's scenario list: every Simple PDU with its last result, fire again or delete. */
export function PduList({ sim }: { sim: boolean }) {
  const pdus = usePt((s) => s.pdus);
  const doc = useLab((s) => s.doc);
  const [open, setOpen] = useState(true);
  if (!pdus.length || !doc) return null;
  const name = (id: string) => deviceById(doc, id)?.name ?? '?';
  return (
    <div className="w-[min(460px,calc(100vw-32px))] overflow-hidden rounded-[8px] border border-line bg-pane/95 text-[12px] shadow-lg" data-testid="pdu-list">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 border-b border-line px-2.5 py-1.5 text-left font-semibold">
        <Mail className="size-3.5 text-action" /> PDU list <span className="font-normal text-muted">({pdus.length})</span>
        <span className="flex-1" />
        <span className="text-[11px] font-normal text-muted">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="max-h-48 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-pane text-left text-[11px] text-muted">
              <tr>
                <th className="px-2 py-1 font-medium">Fire</th>
                <th className="px-2 py-1 font-medium">Last status</th>
                <th className="px-2 py-1 font-medium">Source</th>
                <th className="px-2 py-1 font-medium">Destination</th>
                <th className="px-2 py-1 font-medium">Type</th>
                <th className="px-2 py-1 font-medium">#</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pdus.map((p) => (
                <tr key={p.id} className="border-t border-line" data-testid="pdu-row" data-status={p.last}>
                  <td className="px-2 py-1">
                    <button
                      type="button"
                      onClick={() => {
                        usePt.getState().fire(p.id, sim);
                        const t = usePt.getState().pdus.find((x) => x.id === p.id)?.traceId;
                        if (sim && t) usePlayer.getState().load(t);
                      }}
                      className="grid size-6 place-items-center rounded bg-action/15 text-action hover:bg-action/30"
                      aria-label={`Fire again from ${name(p.src)} to ${name(p.dst)}`}
                      data-testid="pdu-fire"
                    >
                      <Play className="size-3" />
                    </button>
                  </td>
                  <td className={cx('px-2 py-1 font-semibold', p.last === 'ok' ? 'text-healthy' : p.last === 'fail' ? 'text-down' : 'text-muted')} title={p.reason}>
                    {p.last === 'ok' ? 'Successful' : p.last === 'fail' ? 'Failed' : 'In progress'}
                  </td>
                  <td className="px-2 py-1">{name(p.src)}</td>
                  <td className="px-2 py-1">{name(p.dst)}</td>
                  <td className="px-2 py-1">ICMP</td>
                  <td className="px-2 py-1 tabular-nums text-muted">{p.fired}</td>
                  <td className="px-1 py-1">
                    <button type="button" onClick={() => usePt.getState().removePdu(p.id)} className="grid size-6 place-items-center rounded text-muted hover:text-down" aria-label="Delete this PDU">
                      <Trash2 className="size-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pdus.some((p) => p.last === 'fail') && (
            <p className="border-t border-line px-2.5 py-1.5 text-[11px] text-muted">
              Tip: the first ping across a network can fail while ARP resolves, the same as real gear. Fire it again. Hover a Failed status for the reason.
            </p>
          )}
          <div className="flex justify-end border-t border-line px-2 py-1">
            <button type="button" className="text-[11px] text-muted hover:text-down" onClick={() => usePt.getState().clearPdus()}>
              Delete all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The magnifying glass menu next to a device: which table to look at. */
export function InspectMenu() {
  const menu = usePt((s) => s.inspectMenu);
  if (!menu) return null;
  const opts = inspectOptions(menu.device);
  const d = deviceById(useLab.getState().doc!, menu.device);
  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={() => usePt.getState().openInspectMenu(null)} />
      <div role="menu" aria-label={`Inspect ${d?.name}`} className="fixed z-[61] w-56 rounded-[7px] border border-line-strong bg-pane py-1 text-[12.5px] shadow-xl" style={{ left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 260) }} data-testid="inspect-menu">
        <p className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold text-muted">
          <Search className="size-3" /> Inspect {d?.name}
        </p>
        {opts.map((k) => (
          <button key={k} type="button" role="menuitem" className="block w-full px-3 py-1.5 text-left hover:bg-pane-2" onClick={() => usePt.getState().openInspect(menu.device, k, menu.x + 20, menu.y)} data-testid={`inspect-${k}`}>
            {INSPECT_LABEL[k]}
          </button>
        ))}
      </div>
    </>
  );
}

function InspectWindow({ w }: { w: InspectWin }) {
  const doc = useLab((s) => s.doc);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const d = doc ? deviceById(doc, w.device) : undefined;
  // Re-read on every design change, so the table updates live like Packet Tracer's.
  const text = doc ? inspectText(w.device, w.kind) : '';
  return (
    <div role="dialog" aria-label={`${d?.name} ${INSPECT_LABEL[w.kind]}`} className="fixed z-50 flex max-h-[60vh] w-[min(560px,calc(100vw-24px))] flex-col overflow-hidden rounded-[8px] border border-line-strong bg-pane shadow-[0_14px_40px_rgba(0,0,0,0.5)]" style={{ left: Math.min(w.x, window.innerWidth - 300), top: Math.min(w.y, window.innerHeight - 120) }} data-testid="inspect-window">
      <header
        className="flex h-8 shrink-0 cursor-move items-center gap-2 border-b border-line bg-pane-2 px-2 select-none"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          drag.current = { dx: e.clientX - w.x, dy: e.clientY - w.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => drag.current && usePt.getState().moveInspect(w.id, e.clientX - drag.current.dx, e.clientY - drag.current.dy)}
        onPointerUp={() => (drag.current = null)}
      >
        <Search className="size-3.5 text-action" />
        <span className="truncate text-[12.5px] font-semibold">
          {INSPECT_LABEL[w.kind]} for {d?.name}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={() => usePt.getState().closeInspect(w.id)} className="grid size-6 place-items-center rounded text-muted hover:text-down" aria-label="Close">
          <X className="size-3.5" />
        </button>
      </header>
      <pre className="min-h-0 flex-1 overflow-auto p-2.5 font-mono text-[11.5px] leading-snug whitespace-pre text-text" data-testid="inspect-text">
        {text.replace(/\r/g, '') || 'Nothing to show yet.'}
      </pre>
    </div>
  );
}

export function InspectWindows() {
  const wins = usePt((s) => s.inspects);
  return (
    <>
      <InspectMenu />
      {wins.map((w) => (
        <InspectWindow key={w.id} w={w} />
      ))}
    </>
  );
}
