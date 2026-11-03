'use client';

// A floating device window, like Packet Tracer: drag it by the title bar, resize it from the corner,
// dock it to the side if you prefer. Position and size are remembered per browser.
import { PanelRight, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSyncExternalStore } from 'react';

type Box = { x: number; y: number; w: number; h: number };
const KEY = 'aegis.lab.window.v1';
const MODE_KEY = 'aegis.lab.inspector.v1';

const subs = new Set<() => void>();
let mode: 'window' | 'dock' | null = null;
export function getInspectorMode(): 'window' | 'dock' {
  if (mode) return mode;
  try {
    mode = window.localStorage.getItem(MODE_KEY) === 'dock' ? 'dock' : 'window';
  } catch {
    mode = 'window';
  }
  return mode;
}
export function setInspectorMode(m: 'window' | 'dock') {
  mode = m;
  try {
    window.localStorage.setItem(MODE_KEY, m);
  } catch {
    /* ignore */
  }
  subs.forEach((f) => f());
}
export const useInspectorMode = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    getInspectorMode,
    () => 'window' as const,
  );

function initial(): Box {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1400;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
  const w = Math.min(700, vw - 32);
  const h = Math.min(600, vh - 140);
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Box | null;
    if (saved && saved.w > 300 && saved.h > 240) return clamp(saved);
  } catch {
    /* ignore */
  }
  return { x: Math.max(16, vw - w - 40), y: 110, w, h };
}
function clamp(b: Box): Box {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(b.w, vw - 16);
  const h = Math.min(b.h, vh - 16);
  return { w, h, x: Math.min(Math.max(8 - w + 120, b.x), vw - 120), y: Math.min(Math.max(8, b.y), vh - 40) };
}

export function DeviceWindow({ title, sub, icon, onClose, children }: { title: string; sub?: string; icon?: string; onClose: () => void; children: ReactNode }) {
  const [box, setBox] = useState<Box | null>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setBox(initial()), []);
  useEffect(() => {
    if (!box) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(box));
    } catch {
      /* ignore */
    }
  }, [box]);
  // Pick up the user's resize (CSS resize handle) on mouse up.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox((b) => (b && (Math.abs(b.w - el.offsetWidth) > 2 || Math.abs(b.h - el.offsetHeight) > 2) ? { ...b, w: el.offsetWidth, h: el.offsetHeight } : b)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [box !== null]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!box) return null;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`${title} window`}
      className="fixed z-40 flex resize flex-col overflow-hidden rounded-[8px] border border-line-strong bg-pane shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h, minWidth: 380, minHeight: 280 }}
      data-testid="inspector"
    >
      <header
        className="flex h-9 shrink-0 cursor-move items-center gap-2 border-b border-line bg-pane-2 px-2 select-none"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          drag.current = { dx: e.clientX - box.x, dy: e.clientY - box.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => drag.current && setBox((b) => b && clamp({ ...b, x: e.clientX - drag.current!.dx, y: e.clientY - drag.current!.dy }))}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => setBox((b) => b && (b.w > window.innerWidth - 80 ? initial() : { x: 8, y: 56, w: window.innerWidth - 16, h: window.innerHeight - 64 }))}
        data-testid="window-titlebar"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {icon && <img src={icon} alt="" className="h-5 w-7 object-contain" />}
        <h2 className="min-w-0 truncate text-[13px] font-semibold">{title}</h2>
        {sub && <span className="truncate text-[11.5px] text-muted">{sub}</span>}
        <span className="flex-1" />
        <button type="button" onClick={() => setInspectorMode('dock')} className="grid size-7 place-items-center rounded text-muted hover:bg-pane hover:text-text" title="Dock to the side" aria-label="Dock to the side" data-testid="window-dock">
          <PanelRight className="size-4" />
        </button>
        <button type="button" onClick={onClose} className="grid size-7 place-items-center rounded text-muted hover:bg-down/20 hover:text-down" title="Close" aria-label="Close inspector" data-testid="window-close">
          <X className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
