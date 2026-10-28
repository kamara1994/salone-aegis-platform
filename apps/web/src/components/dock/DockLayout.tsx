'use client';

import { DockviewReact, type DockviewApi, type DockviewReadyEvent, type IDockviewPanelProps } from 'dockview-react';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface DockPanelDef {
  title: string;
  render: () => ReactNode;
}

const PanelsCtx = createContext<Record<string, DockPanelDef>>({});

function PanelHost(props: IDockviewPanelProps<{ key: string }>) {
  const panels = useContext(PanelsCtx);
  const def = panels[props.params.key];
  return <div className="h-full min-h-0 overflow-auto bg-pane">{def ? def.render() : null}</div>;
}

const components = { panel: PanelHost };
const theme = { name: 'aegis', className: 'dockview-theme-aegis' };

/**
 * Dockable, resizable, pop-out panels. The layout is saved per screen and restored on return.
 * `buildDefault` places panels the first time (or after Reset layout).
 */
/** True below 768px, where docking panels side by side stops being usable. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

/** Small screens: the same panels, stacked in default order, each collapsible. */
function StackedPanels({ panels, order }: { panels: Record<string, DockPanelDef>; order: string[] }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  return (
    <div className="space-y-2 p-2">
      {order.map((key) => {
        const def = panels[key];
        if (!def) return null;
        const isClosed = closed[key];
        return (
          <section key={key} className="overflow-hidden rounded-[6px] border border-line bg-pane">
            <button className="flex w-full items-center justify-between border-b border-line bg-pane-2 px-3 py-2 text-left text-[13px] font-medium" aria-expanded={!isClosed} onClick={() => setClosed({ ...closed, [key]: !isClosed })}>
              {def.title}
              <span className="text-muted" aria-hidden>{isClosed ? '+' : '−'}</span>
            </button>
            {!isClosed && <div className="h-[60vh] min-h-[280px] overflow-auto">{def.render()}</div>}
          </section>
        );
      })}
    </div>
  );
}

export function DockLayout({ storageKey, panels, buildDefault }: { storageKey: string; panels: Record<string, DockPanelDef>; buildDefault: (add: (key: string, opts?: { ref?: string; dir?: 'right' | 'left' | 'below' | 'above' | 'within'; size?: number }) => void, api: DockviewApi) => void }) {
  const apiRef = useRef<DockviewApi | null>(null);
  const narrow = useNarrow();
  const order = useMemo(() => {
    const keys: string[] = [];
    buildDefault((k) => void keys.push(k), null as unknown as DockviewApi);
    return keys;
    // buildDefault is a static description of the layout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const value = useMemo(() => panels, [panels]);
  // Titles carry live counts ("Checks (1/2)", "Work notes (3)"), so push them into the tabs when they change.
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    for (const [key, def] of Object.entries(panels)) {
      const p = api.getPanel(key);
      if (p && p.title !== def.title) p.api.setTitle(def.title);
    }
  }, [panels]);

  const onReady = (e: DockviewReadyEvent) => {
    apiRef.current = e.api;
    const add = (key: string, opts: { ref?: string; dir?: 'right' | 'left' | 'below' | 'above' | 'within'; size?: number } = {}) => {
      if (!panels[key]) return;
      const p = e.api.addPanel({
        id: key,
        component: 'panel',
        title: panels[key].title,
        params: { key },
        position: opts.ref ? { referencePanel: opts.ref, direction: opts.dir ?? 'right' } : undefined,
      });
      if (opts.size) {
        try {
          p.group.api.setSize(opts.dir === 'below' || opts.dir === 'above' ? { height: opts.size } : { width: opts.size });
        } catch {
          /* sizing is best effort */
        }
      }
    };
    let restored = false;
    try {
      const saved = window.localStorage.getItem(`aegis.layout.${storageKey}`);
      if (saved) {
        e.api.fromJSON(JSON.parse(saved));
        const ids = new Set(e.api.panels.map((p) => p.id));
        restored = Object.keys(panels).every((k) => ids.has(k)) && e.api.panels.every((p) => panels[p.id]);
        if (!restored) e.api.clear();
        else for (const p of e.api.panels) p.api.setTitle(panels[p.id].title);
      }
    } catch {
      e.api.clear();
    }
    if (!restored) {
      buildDefault(add, e.api);
      // Show the first panel added to each group (chat before ticket details, console before map...).
      for (const g of e.api.groups) g.panels[0]?.api.setActive();
      e.api.panels[0]?.api.setActive();
    }
    e.api.onDidLayoutChange(() => {
      try {
        window.localStorage.setItem(`aegis.layout.${storageKey}`, JSON.stringify(e.api.toJSON()));
      } catch {
        /* storage blocked */
      }
    });
  };

  if (narrow) return <StackedPanels panels={panels} order={order} />;

  return (
    <PanelsCtx.Provider value={value}>
      <div className="h-full w-full p-1">
        <DockviewReact components={components} onReady={onReady} theme={theme} />
      </div>
    </PanelsCtx.Provider>
  );
}

export function resetLayout(storageKey: string) {
  try {
    window.localStorage.removeItem(`aegis.layout.${storageKey}`);
  } catch {
    /* ignore */
  }
}
