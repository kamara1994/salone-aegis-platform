'use client';

import { useReactFlow, ViewportPortal } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import { DEVICE_H, DEVICE_W } from '@/lab/inventory';
import { usePlayer } from '@/lab/player';
import type { Hop, PacketTrace } from '@/lab/simulate';
import { useLab } from '@/lab/store';
import { cx } from '@/components/ui';

export const DECISION_COLOR: Record<Hop['decision'], string> = {
  send: 'var(--action)',
  switch: 'var(--action)',
  route: 'var(--action)',
  deliver: 'var(--healthy)',
  block: 'var(--down)',
  drop: 'var(--faint)',
  malformed: '#a855f7',
  delay: 'var(--degraded)',
};

export const DECISION_LABEL: Record<Hop['decision'], string> = {
  send: 'Sent',
  switch: 'Switched',
  route: 'Routed',
  deliver: 'Delivered',
  block: 'Blocked',
  drop: 'Dropped',
  malformed: 'Malformed',
  delay: 'Delayed',
};

const STEP_MS = 900;

/** Drives the animation clock: advances progress, then moves to the next hop. */
export function usePlaybackClock(trace: PacketTrace | undefined) {
  const playing = usePlayer((s) => s.playing);
  const speed = usePlayer((s) => s.speed);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || !trace) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) * speed;
      last = now;
      const s = usePlayer.getState();
      let p = s.progress + dt / STEP_MS;
      if (p >= 1) {
        if (s.step >= trace.hops.length - 1) {
          usePlayer.setState({ progress: 1, playing: false });
          return;
        }
        usePlayer.setState({ step: s.step + 1, progress: 0 });
        p = 0;
      } else usePlayer.setState({ progress: p });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, speed, trace]);
}

function Envelope({ color, label }: { color: string; label: string }) {
  return (
    <svg width="26" height="20" viewBox="0 0 26 20" aria-hidden className="drop-shadow">
      <rect x="1" y="2" width="24" height="16" rx="2.5" fill={color} stroke="white" strokeWidth="1.4" />
      <path d="M2 3.5 L13 11.5 L24 3.5" fill="none" stroke="white" strokeWidth="1.4" />
      <title>{label}</title>
    </svg>
  );
}

/** Packet envelope travelling across the canvas, in flow coordinates. */
export function PacketLayer() {
  const traces = useLab((s) => s.traces);
  const traceId = usePlayer((s) => s.traceId);
  const step = usePlayer((s) => s.step);
  const progress = usePlayer((s) => s.progress);
  const rf = useReactFlow();
  const trace = traces.find((t) => t.id === traceId);
  usePlaybackClock(trace);
  if (!trace || !trace.hops.length) return null;
  const centerOf = (id: string) => {
    const n = rf.getInternalNode(id);
    const p = n?.internals.positionAbsolute ?? { x: 0, y: 0 };
    return { x: p.x + (n?.measured.width ?? DEVICE_W) / 2, y: p.y + (n?.measured.height ?? DEVICE_H) / 2 };
  };
  const hop = trace.hops[Math.min(step, trace.hops.length - 1)];
  const prev = trace.hops[Math.max(0, step - 1)];
  const from = centerOf(prev.device);
  const to = centerOf(hop.device);
  const t = step === 0 ? 1 : progress;
  const x = from.x + (to.x - from.x) * t;
  const y = from.y + (to.y - from.y) * t - 36;
  const arrived = t >= 1;
  const color = arrived ? DECISION_COLOR[hop.decision] : 'var(--action)';
  const final = arrived && step === trace.hops.length - 1;
  return (
    <ViewportPortal>
      <div className="pointer-events-none absolute z-[1000]" style={{ transform: `translate(${x - 13}px, ${y - 10}px)` }} data-testid="packet-envelope" data-decision={arrived ? hop.decision : 'moving'}>
        <Envelope color={color} label={`${trace.request.proto.toUpperCase()} ${hop.pdu.srcIp} → ${hop.pdu.dstIp}`} />
        {arrived && (
          <div className={cx('absolute top-[-6px] left-7 w-max max-w-[260px] rounded border bg-pane px-2 py-1 text-[11px] leading-snug shadow-md', final ? 'border-2' : 'border-line')} style={final ? { borderColor: color } : undefined}>
            <span className="font-semibold" style={{ color }}>
              {DECISION_LABEL[hop.decision]}
            </span>{' '}
            <span className="text-muted">at {hop.deviceName}</span>
            <div className="text-text/90">{final ? trace.reason : hop.info}</div>
          </div>
        )}
      </div>
    </ViewportPortal>
  );
}
