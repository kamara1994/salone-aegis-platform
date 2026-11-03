'use client';

// Cables lying on the canvas. Grab a plug and drop it on a device to plug it in; grab the middle
// to move the whole cable. They sag a little, like a real patch lead on a desk.
import { useReactFlow, ViewportPortal } from '@xyflow/react';
import { X } from 'lucide-react';
import { useState } from 'react';
import { isPlugged, moveLoose, removeLoose } from '@/lab/loose';
import { useLab } from '@/lab/store';
import type { LooseCable, LooseEnd } from '@/lab/types';
import { CABLE_STYLE } from './CanvasParts';

type P = { x: number; y: number };
const NONE: LooseCable[] = [];

export function LooseCables({ onPlugAt }: { onPlugAt: (cableId: string, end: 'a' | 'b', deviceId: string) => void }) {
  const loose = useLab((s) => s.doc?.loose) ?? NONE;
  const rf = useReactFlow();
  const [draft, setDraft] = useState<{ id: string; a?: P; b?: P } | null>(null);
  if (!loose.length) return null;
  const devicePoint = (id: string): P | null => {
    const n = rf.getInternalNode(id);
    if (!n) return null;
    return { x: n.internals.positionAbsolute.x + (n.measured.width ?? 0) / 2, y: n.internals.positionAbsolute.y + (n.measured.height ?? 0) / 2 };
  };
  const pos = (c: LooseCable, end: 'a' | 'b'): P | null => {
    const d = draft?.id === c.id ? draft[end] : undefined;
    if (d) return d;
    const e: LooseEnd = c[end];
    return isPlugged(e) ? devicePoint(e.device) : e;
  };
  const deviceAt = (ev: PointerEvent) => (document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => (x as HTMLElement).closest?.('[data-device-id]')).find(Boolean) as HTMLElement | undefined)?.dataset.deviceId;

  const dragEnd = (c: LooseCable, end: 'a' | 'b', e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    let last: P | null = null;
    const move = (ev: PointerEvent) => {
      last = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      setDraft({ id: c.id, [end]: last });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const dev = deviceAt(ev);
      if (dev && !dev.startsWith('ghost:')) {
        // Leave the plug where it was dropped while the port list is open.
        if (last) moveLoose(c.id, { [end]: last });
        onPlugAt(c.id, end, dev);
      } else if (last) moveLoose(c.id, { [end]: last });
      setDraft(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const dragWhole = (c: LooseCable, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const start = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    let delta: P = { x: 0, y: 0 };
    const shift = (x: LooseEnd): P | undefined => (isPlugged(x) ? undefined : { x: x.x + delta.x, y: x.y + delta.y });
    const move = (ev: PointerEvent) => {
      const p = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      delta = { x: p.x - start.x, y: p.y - start.y };
      setDraft({ id: c.id, a: shift(c.a), b: shift(c.b) });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (delta.x || delta.y) moveLoose(c.id, { ...(isPlugged(c.a) ? {} : { a: shift(c.a) }), ...(isPlugged(c.b) ? {} : { b: shift(c.b) }) });
      setDraft(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <ViewportPortal>
      <svg className="pointer-events-none absolute overflow-visible" style={{ left: 0, top: 0 }} data-testid="loose-cables">
        {loose.map((c) => {
          const A = pos(c, 'a');
          const B = pos(c, 'b');
          if (!A || !B) return null;
          const st = CABLE_STYLE[c.type === 'auto' ? 'straight' : c.type] ?? CABLE_STYLE.straight;
          const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 + Math.min(50, Math.hypot(B.x - A.x, B.y - A.y) / 5) };
          const path = `M${A.x} ${A.y} Q${2 * mid.x - (A.x + B.x) / 2} ${2 * mid.y - (A.y + B.y) / 2} ${B.x} ${B.y}`;
          const plug = (end: 'a' | 'b', p: P, toward: P) => {
            const ang = (Math.atan2(p.y - toward.y, p.x - toward.x) * 180) / Math.PI;
            const plugged = isPlugged(c[end]);
            return (
              <g
                key={end}
                transform={`translate(${p.x} ${p.y}) rotate(${ang}) scale(1.5)`}
                className="nodrag nopan pointer-events-auto cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => dragEnd(c, end, e)}
                data-testid={`loose-end-${end}`}
                data-plugged={plugged}
                role="button"
                aria-label={plugged ? `Cable end plugged into ${(c[end] as { port: string }).port}. Drag to move it` : 'Free cable end. Drag it onto a device to plug it in'}
              >
                <title>{plugged ? 'Drag to unplug and move this end' : 'Drag onto a device to plug in'}</title>
                {!plugged && <circle r={14} fill="transparent" />}
                {plugged ? (
                  <circle r={4} fill={st.color} stroke="var(--pane)" />
                ) : (
                  <>
                    <rect x={-14} y={-4} width={8} height={8} rx={1.5} fill="#5b6672" />
                    <rect x={-6} y={-5} width={12} height={10} rx={1.5} fill="#dfe5ea" stroke="#56616e" strokeWidth={0.8} />
                    <path d="M6 -3 h3 v6 h-3" fill="#c9a227" />
                  </>
                )}
              </g>
            );
          };
          return (
            <g key={c.id} data-testid="loose-cable" data-id={c.id}>
              <path d={path} fill="none" stroke="transparent" strokeWidth={14} className="nodrag nopan pointer-events-auto cursor-move" onPointerDown={(e) => dragWhole(c, e)} />
              <path d={path} fill="none" stroke={st.color} strokeWidth={st.width + 0.6} strokeDasharray={st.dash} strokeLinecap="round" />
              {plug('a', A, B)}
              {plug('b', B, A)}
              <g transform={`translate(${mid.x} ${mid.y})`} className="nodrag nopan pointer-events-auto cursor-pointer" onClick={() => removeLoose(c.id)} role="button" aria-label="Put this cable away" data-testid="loose-remove">
                <title>Put this cable away</title>
                <circle r={7} fill="var(--pane)" stroke="var(--line-strong)" />
                <foreignObject x={-5} y={-5} width={10} height={10}>
                  <X className="size-2.5 text-muted" />
                </foreignObject>
              </g>
            </g>
          );
        })}
      </svg>
    </ViewportPortal>
  );
}
