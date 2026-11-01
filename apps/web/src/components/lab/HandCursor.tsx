'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useLab } from '@/lab/store';
import type { CableType } from '@/lab/types';

/**
 * A human hand in place of the mouse pointer on the lab canvas.
 * open: moving around. reach: fingers spread when over a device, cable or port.
 * fist: closes on a device (or the canvas) while you drag it. pinch: holds a cable plug in the cable tool.
 * Only on fine pointers (mouse, trackpad); off for touch and when the user turns it off.
 */
type Pose = 'open' | 'reach' | 'fist' | 'pinch';
export const HAND_PREF_KEY = 'aegis.lab.handCursor';

const SIZE = 52; // rendered px for the 64-unit drawing
const HOTSPOT: Record<Pose, [number, number]> = { open: [23, 9], reach: [22, 8], fist: [33, 28], pinch: [32, 5] };
const CABLE_COLOR: Partial<Record<CableType | 'auto', string>> = { straight: '#3b82f6', crossover: '#f97316', access: '#3b82f6', trunk: '#a78bfa', fiber: '#f59e0b', serial: '#ef4444', console: '#67e8f9', wan: '#f472b6', virtual: '#94a3b8', auto: '#3b82f6' };

const GRABBABLE = '.react-flow__node, .react-flow__edge, .react-flow__handle, .react-flow__edge-interaction';
/** Real controls keep the normal pointer. */
const NATIVE = '.react-flow__controls, .react-flow__minimap, .react-flow__panel, button, a, input, textarea, select, [role="menu"], [role="dialog"], [contenteditable="true"]';

function Skin({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-skin`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f7d6bb" />
        <stop offset="0.55" stopColor="#e7b08c" />
        <stop offset="1" stopColor="#cf9370" />
      </linearGradient>
      <linearGradient id={`${id}-side`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#000" stopOpacity="0.16" />
        <stop offset="0.3" stopColor="#000" stopOpacity="0" />
        <stop offset="0.8" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.14" />
      </linearGradient>
    </defs>
  );
}

const S = '#8b5a3c'; // outline
const NAIL = '#fbe6d6';
const CREASE = '#b0714f';

function Sleeve() {
  return (
    <g>
      <rect x="16" y="56" width="32" height="10" rx="3" fill="#1d3557" stroke="#0f1f33" strokeWidth="0.8" />
      <rect x="16" y="56" width="32" height="2.4" rx="1.2" fill="#2f5d8a" />
    </g>
  );
}

/** Palm facing you, fingers up. `spread` fans the fingers out (reaching). */
function OpenHand({ id, spread }: { id: string; spread: boolean }) {
  const fill = `url(#${id}-skin)`;
  const finger = (x: number, y: number, w: number, h: number, rot: number, ox: number) => (
    <g transform={`rotate(${spread ? rot : rot / 3} ${ox} 34)`}>
      <rect x={x} y={y} width={w} height={h} rx={w / 2} fill={fill} stroke={S} strokeWidth="0.9" />
      <rect x={x + 1.3} y={y + 1.4} width={w - 2.6} height={w - 2.4} rx={1.6} fill={NAIL} opacity="0.85" />
      <path d={`M${x + 1.2} ${y + h * 0.42} q${w / 2 - 1.2} 1.4 ${w - 2.4} 0`} stroke={CREASE} strokeWidth="0.6" fill="none" opacity="0.6" />
      <path d={`M${x + 1.2} ${y + h * 0.68} q${w / 2 - 1.2} 1.2 ${w - 2.4} 0`} stroke={CREASE} strokeWidth="0.6" fill="none" opacity="0.5" />
    </g>
  );
  return (
    <g>
      <Sleeve />
      {finger(19.5, 9, 7, 27, -13, 23)}
      {finger(27.4, 5, 7.3, 30, -3, 31)}
      {finger(35.4, 8, 7, 27, 9, 39)}
      {finger(42.8, 15, 6.2, 21, 19, 46)}
      <path d="M18.5 35 Q18.5 30 23 30 L45 30 Q49.5 30 49.5 35 L48.5 50 Q47.5 58 38.5 58.5 L27.5 58.5 Q19.5 58 18.8 50 Z" fill={fill} stroke={S} strokeWidth="0.9" />
      <path d="M18.5 35 Q18.5 30 23 30 L45 30 Q49.5 30 49.5 35 L48.5 50 Q47.5 58 38.5 58.5 L27.5 58.5 Q19.5 58 18.8 50 Z" fill={`url(#${id}-side)`} />
      <path d="M23 41 Q33 45 45 39" stroke={CREASE} strokeWidth="0.7" fill="none" opacity="0.5" />
      <path d="M24 48 Q30 46 38 50" stroke={CREASE} strokeWidth="0.6" fill="none" opacity="0.4" />
      <g transform={`rotate(${spread ? -66 : -44} 20 46)`}>
        <rect x="16.5" y="27" width="7.4" height="20" rx="3.7" fill={fill} stroke={S} strokeWidth="0.9" />
        <rect x="17.8" y="28.4" width="4.8" height="4.6" rx="1.7" fill={NAIL} opacity="0.85" />
        <path d="M17.6 37 q2.6 1.3 5.2 0" stroke={CREASE} strokeWidth="0.6" fill="none" opacity="0.55" />
      </g>
    </g>
  );
}

/** Back of the hand, fingers curled over: a fist closing on something. */
function Fist({ id }: { id: string }) {
  const fill = `url(#${id}-skin)`;
  const knuckle = (x: number, y: number, w: number, h: number) => (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={w / 2} fill={fill} stroke={S} strokeWidth="0.9" />
      <path d={`M${x + 1.2} ${y + h * 0.55} q${w / 2 - 1.2} 1.3 ${w - 2.4} 0`} stroke={CREASE} strokeWidth="0.6" fill="none" opacity="0.6" />
      <ellipse cx={x + w / 2} cy={y + 2.6} rx={w / 3.4} ry={1.3} fill="#fff" opacity="0.18" />
    </g>
  );
  return (
    <g>
      <Sleeve />
      <path d="M17 31 Q17 26 22 26 L46 26 Q50.5 26 50.5 31 L49.5 50 Q48.5 58 39 58.5 L27 58.5 Q18 58 17.4 50 Z" fill={fill} stroke={S} strokeWidth="0.9" />
      <path d="M17 31 Q17 26 22 26 L46 26 Q50.5 26 50.5 31 L49.5 50 Q48.5 58 39 58.5 L27 58.5 Q18 58 17.4 50 Z" fill={`url(#${id}-side)`} />
      {knuckle(18, 23.5, 8.2, 13)}
      {knuckle(26, 21.5, 8.6, 14)}
      {knuckle(34.4, 22.5, 8.2, 13.5)}
      {knuckle(42.4, 25.5, 7.2, 11.5)}
      <g transform="rotate(-10 27 41)">
        <rect x="15.5" y="37" width="23" height="7.6" rx="3.8" fill={fill} stroke={S} strokeWidth="0.9" />
        <rect x="32.6" y="38.4" width="4.6" height="4.8" rx="1.7" fill={NAIL} opacity="0.85" />
      </g>
      <path d="M24 51 Q33 49 44 51" stroke={CREASE} strokeWidth="0.6" fill="none" opacity="0.45" />
    </g>
  );
}

/** An RJ-45 (or LC/serial) plug held between the fingers, cable trailing behind the hand. */
function Plug({ color }: { color: string }) {
  return (
    <g>
      <path d="M32 22 C33 40 44 52 62 64" stroke={color} strokeWidth="3.4" fill="none" strokeLinecap="round" />
      <path d="M32 22 C33 40 44 52 62 64" stroke="#fff" strokeWidth="1" fill="none" opacity="0.25" strokeLinecap="round" />
      <rect x="28.5" y="13" width="7" height="10" rx="1.6" fill={color} stroke="#0b1726" strokeWidth="0.6" />
      <rect x="27.5" y="3" width="9" height="11" rx="1.2" fill="#dfeaf3" fillOpacity="0.75" stroke="#7b8c9c" strokeWidth="0.6" />
      {[29.2, 30.6, 32, 33.4, 34.8].map((x) => (
        <rect key={x} x={x} y="3.6" width="0.7" height="3.6" fill="#d4a017" />
      ))}
      <rect x="30.2" y="9" width="3.6" height="4" rx="0.6" fill="#9fb2c3" opacity="0.8" />
    </g>
  );
}

export function HandCursor({ target }: { target: RefObject<HTMLElement | null> }) {
  const tool = useLab((s) => s.tool);
  const cableType = useLab((s) => s.cableType);
  const [enabled, setEnabled] = useState(false);
  const [pose, setPose] = useState<Pose>('open');
  const [visible, setVisible] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  const st = useRef({ x: 0, y: 0, down: false, near: false, tilt: 0, lastX: 0, raf: 0, reduced: false });
  const poseRef = useRef<Pose>('open');
  const toolRef = useRef(tool);
  toolRef.current = tool;

  useEffect(() => {
    const fine = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;
    let off = false;
    try {
      off = window.localStorage.getItem(HAND_PREF_KEY) === 'off';
    } catch {
      /* storage blocked */
    }
    st.current.reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setEnabled(!!fine && !off);
    const onPref = () => {
      try {
        setEnabled(!!fine && window.localStorage.getItem(HAND_PREF_KEY) !== 'off');
      } catch {
        setEnabled(!!fine);
      }
    };
    window.addEventListener('aegis:hand-cursor', onPref);
    return () => window.removeEventListener('aegis:hand-cursor', onPref);
  }, []);

  useEffect(() => {
    const host = target.current;
    if (!enabled || !host) return;
    host.classList.add('hand-cursor-on');
    const s = st.current;
    const pick = (): Pose => (toolRef.current === 'cable' ? 'pinch' : s.down ? 'fist' : s.near ? 'reach' : 'open');
    const paint = () => {
      s.raf = 0;
      const p = poseRef.current;
      const [hx, hy] = HOTSPOT[p];
      const k = SIZE / 64;
      // A slight tilt in the direction of travel, like a wrist following the hand.
      const vx = s.x - s.lastX;
      s.lastX = s.x;
      s.tilt = s.reduced ? 0 : s.tilt * 0.8 + Math.max(-9, Math.min(9, vx * 0.6)) * 0.2;
      if (el.current) {
        el.current.style.transform = `translate3d(${s.x - hx * k}px, ${s.y - hy * k}px, 0)`;
        const inner = el.current.firstElementChild as HTMLElement | null;
        if (inner) {
          inner.style.transformOrigin = `${hx * k}px ${hy * k}px`;
          inner.style.transform = `rotate(${s.tilt}deg) scale(${p === 'fist' ? 0.94 : p === 'reach' ? 1.06 : 1})`;
        }
      }
      if (Math.abs(s.tilt) > 0.05 && !s.reduced) s.raf = requestAnimationFrame(paint);
    };
    const update = () => {
      const next = pick();
      if (next !== poseRef.current) {
        poseRef.current = next;
        setPose(next);
      }
      if (!s.raf) s.raf = requestAnimationFrame(paint);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      s.x = e.clientX;
      s.y = e.clientY;
      const t = e.target as Element | null;
      const native = !!t?.closest(NATIVE);
      setVisible(!native);
      s.near = !!t?.closest(GRABBABLE);
      update();
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      s.down = true;
      update();
    };
    const up = () => {
      s.down = false;
      update();
    };
    const leave = () => setVisible(false);
    host.addEventListener('pointermove', move, { passive: true });
    host.addEventListener('pointerdown', down, { passive: true });
    host.addEventListener('pointerleave', leave);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('blur', up);
    return () => {
      host.classList.remove('hand-cursor-on');
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerdown', down);
      host.removeEventListener('pointerleave', leave);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('blur', up);
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
  }, [enabled, target]);

  // The cable tool switches pose without the mouse moving.
  useEffect(() => {
    const next: Pose = tool === 'cable' ? 'pinch' : st.current.down ? 'fist' : st.current.near ? 'reach' : 'open';
    poseRef.current = next;
    setPose(next);
  }, [tool]);

  if (!enabled || typeof document === 'undefined') return null;
  const color = CABLE_COLOR[cableType] ?? '#3b82f6';
  const fade = (p: Pose | Pose[]) => ({ opacity: ([] as Pose[]).concat(p).includes(pose) ? 1 : 0, transition: st.current.reduced ? 'none' : 'opacity 110ms ease-out' });
  return createPortal(
    <>
      <style>{`.hand-cursor-on .react-flow__pane, .hand-cursor-on .react-flow__renderer, .hand-cursor-on .react-flow__node, .hand-cursor-on .react-flow__edge, .hand-cursor-on .react-flow__handle, .hand-cursor-on .react-flow__edge-interaction { cursor: none !important; }`}</style>
      <div ref={el} aria-hidden data-testid="hand-cursor" data-pose={pose} className="pointer-events-none fixed top-0 left-0 z-[2000]" style={{ width: SIZE, height: SIZE, opacity: visible ? 1 : 0, willChange: 'transform' }}>
        <div style={{ width: SIZE, height: SIZE, transition: st.current.reduced ? 'none' : 'transform 120ms cubic-bezier(.2,.8,.2,1)', filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.45))' }}>
          <svg viewBox="0 0 64 64" width={SIZE} height={SIZE} className="absolute inset-0" style={fade(['open', 'reach'])}>
            <Skin id="hc-o" />
            <OpenHand id="hc-o" spread={pose === 'reach'} />
          </svg>
          <svg viewBox="0 0 64 64" width={SIZE} height={SIZE} className="absolute inset-0" style={fade('fist')}>
            <Skin id="hc-f" />
            <Fist id="hc-f" />
          </svg>
          <svg viewBox="0 0 64 64" width={SIZE} height={SIZE} className="absolute inset-0" style={fade('pinch')}>
            <Skin id="hc-p" />
            <Plug color={color} />
            <Fist id="hc-p" />
          </svg>
        </div>
      </div>
    </>,
    document.body,
  );
}
