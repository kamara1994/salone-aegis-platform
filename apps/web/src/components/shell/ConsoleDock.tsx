'use client';

import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useTopology } from '@/api/hooks';
import { ConsoleView } from '@/components/console/ConsoleView';
import { cx, IconButton } from '@/components/ui';
import { useUi } from '@/state/ui';

/** Bottom console dock available on every screen (opened from the map, palette or node panels). */
export function ConsoleDock() {
  const { consoleTabs, activeConsole, dockOpen, setDock, closeConsole, setActiveConsole } = useUi();
  const topo = useTopology('all');
  if (!consoleTabs.length) return null;
  const name = (id: string) => topo.data?.nodes.find((n) => n.id === id)?.name ?? 'node';
  return (
    <div className={cx('shrink-0 border-t border-line-strong bg-pane', dockOpen ? 'h-[300px]' : 'h-9')} aria-label="Console dock">
      <div className="flex h-9 items-center gap-1 border-b border-line px-2">
        <span className="pr-2 text-[12.5px] font-semibold">Consoles</span>
        {consoleTabs.map((t) => (
          <div key={t.key} className={cx('flex items-center rounded-[4px] text-[12.5px]', activeConsole === t.key ? 'bg-pane-2 text-text' : 'text-muted')}>
            <button className="px-2 py-1" onClick={() => setActiveConsole(t.key)}>
              {name(t.nodeId)}
            </button>
            <button aria-label={`Close ${name(t.nodeId)} console`} className="pr-1.5 text-faint hover:text-text" onClick={() => closeConsole(t.key)}>
              <X className="size-3.5" />
            </button>
          </div>
        ))}
        <div className="flex-1" />
        <IconButton label={dockOpen ? 'Collapse consoles' : 'Expand consoles'} onClick={() => setDock(!dockOpen)}>
          {dockOpen ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </IconButton>
      </div>
      {dockOpen &&
        consoleTabs.map((t) => (
          <div key={t.key} className={cx('h-[calc(100%-36px)]', activeConsole === t.key ? 'block' : 'hidden')}>
            <ConsoleView nodeId={t.nodeId} ticketId={t.ticketId} />
          </div>
        ))}
    </div>
  );
}
