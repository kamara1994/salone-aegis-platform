'use client';

import { ChevronDown, Plus, SquareTerminal, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cx, IconButton } from '@/components/ui';
import { focusTerminal, useArenaUi } from '@/lab/arena/session';
import { DesignCli } from '@/lab/cli';
import { useLab } from '@/lab/store';
import { useUi } from '@/state/ui';

const XtermMock = dynamic(() => import('@/components/console/XtermMock').then((m) => m.XtermMock), { ssr: false });

/** One console per device. Kept mounted while its tab exists, so history and mode survive tab switches. */
function Console({ id, visible }: { id: string; visible: boolean }) {
  const theme = useUi((s) => s.theme);
  const con = useMemo(() => new DesignCli(id), [id]);
  return (
    <div className={cx('absolute inset-0', visible ? 'block' : 'hidden')} data-testid={`arena-term-${id}`}>
      <XtermMock con={con} theme={theme} />
    </div>
  );
}

/** Packet Tracer style CLI dock: several device consoles in tabs at the bottom of the canvas. */
export function TerminalDock() {
  const ui = useArenaUi();
  const devices = useLab((s) => s.doc?.devices ?? []);
  const [picker, setPicker] = useState(false);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const cli = devices.filter((d) => d.kind !== 'cloud');
  const name = (id: string) => devices.find((d) => d.id === id)?.name ?? id;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        const s = useArenaUi.getState();
        if (!s.terms.length) setPicker(true);
        s.setTermOpen(!s.termOpen || !s.terms.length);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, h: ui.termHeight };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag.current) ui.setTermHeight(drag.current.h + (drag.current.y - e.clientY));
  };

  if (!ui.termOpen)
    return (
      <button className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line-strong bg-pane px-3 py-1.5 text-[12.5px] shadow-lg hover:border-action" onClick={() => (ui.terms.length ? ui.setTermOpen(true) : (ui.setTermOpen(true), setPicker(true)))} data-testid="arena-term-open">
        <SquareTerminal className="size-4 text-action" /> Terminal {ui.terms.length > 0 && <span className="text-muted">({ui.terms.length})</span>}
        <span className="ml-1 rounded border border-line px-1 font-mono text-[10.5px] text-faint">Ctrl `</span>
      </button>
    );

  return (
    <section className="absolute inset-x-0 bottom-0 z-20 flex flex-col border-t border-line-strong bg-pane shadow-[0_-8px_24px_rgba(0,0,0,.25)]" style={{ height: ui.termHeight }} aria-label="Device terminals" data-testid="arena-terminal-dock">
      <div className="h-1.5 cursor-row-resize bg-pane-2 hover:bg-action/40" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} role="separator" aria-orientation="horizontal" aria-label="Resize terminal" />
      <div className="flex items-center gap-1 border-b border-line px-2" role="tablist" aria-label="Open consoles">
        <SquareTerminal className="mr-1 size-4 shrink-0 text-action" aria-hidden />
        <div className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto">
          {ui.terms.map((id) => (
            <div key={id} role="tab" aria-selected={ui.activeTerm === id} className={cx('group flex shrink-0 items-center gap-1 border-b-2 pr-1 pl-2.5 text-[12.5px]', ui.activeTerm === id ? 'border-action text-text' : 'border-transparent text-muted hover:text-text')}>
              <button className="py-1.5 font-mono" onClick={() => (useArenaUi.setState({ activeTerm: id }), focusTerminal())}>
                {name(id)}
              </button>
              <button className="rounded p-0.5 opacity-60 hover:bg-pane-2 hover:opacity-100" aria-label={`Close ${name(id)} console`} onClick={() => ui.closeTerm(id)}>
                <X className="size-3" />
              </button>
            </div>
          ))}
          <div className="relative flex items-center">
            <button className="flex items-center gap-1 rounded px-2 py-1 text-[12.5px] text-muted hover:bg-pane-2 hover:text-text" onClick={() => setPicker(!picker)} aria-expanded={picker} data-testid="arena-term-add">
              <Plus className="size-3.5" /> Console
            </button>
            {picker && (
              <ul className="absolute top-full left-0 z-30 mt-1 max-h-72 w-56 overflow-auto rounded-[6px] border border-line-strong bg-pane p-1 shadow-xl" role="listbox" aria-label="Open a console">
                {cli.map((d) => (
                  <li key={d.id}>
                    <button
                      className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[12.5px] hover:bg-pane-2"
                      onClick={() => {
                        ui.openTerm(d.id);
                        setPicker(false);
                      }}
                    >
                      <span className="font-mono">{d.name}</span>
                      <span className="text-[11px] text-faint">{d.kind}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <IconButton label="Hide terminal" onClick={() => ui.setTermOpen(false)}>
          <ChevronDown className="size-4" />
        </IconButton>
      </div>
      <div className="relative min-h-0 flex-1">
        {ui.terms.length === 0 && <p className="p-4 text-[12.5px] text-muted">Pick a device with “+ Console”, or double-click a device on the canvas. Every console works like the device CLI: enable, configure terminal, show commands, ping and traceroute.</p>}
        {ui.terms.map((id) => (
          <Console key={id} id={id} visible={ui.activeTerm === id} />
        ))}
      </div>
    </section>
  );
}
