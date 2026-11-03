'use client';

// Draws a model's panel from lab/panels.ts with live LEDs. Used by the inspector's Physical tab and
// by the canvas-wide Physical and Rack views, so a port picked in one is picked in the others.
import { useMemo } from 'react';
import { learningOf, phaseOf, useBoot, useBootClock } from '@/lab/boot';
import { portFacts, portLamp, PORT_SIZE, semanticLed, sysLamp, type Lamp, type LedColor, type Panel, type PanelItem, type PanelPort } from '@/lab/panels';
import { controlPlane, poeUsage } from '@/lab/protocols';
import { useLab } from '@/lab/store';
import type { Device, LabDoc } from '@/lab/types';

const COLOR: Record<LedColor, string> = { off: '#33404d', green: '#35d07f', amber: '#f2a93b', greenamber: '#35d07f' };
const FONT = 'ui-sans-serif, system-ui';

function LedDot({ x, y, lamp, w = 7, h = 3.4, round }: { x: number; y: number; lamp: Lamp; w?: number; h?: number; round?: boolean }) {
  const cls = lamp.c === 'greenamber' ? 'led-alt' : lamp.blink === 1 ? 'led-blink' : lamp.blink === 2 ? 'led-flicker' : undefined;
  const glow = lamp.c !== 'off';
  return round ? (
    <circle cx={x} cy={y} r={3} fill={COLOR[lamp.c]} className={cls} style={glow ? { filter: `drop-shadow(0 0 2.5px ${COLOR[lamp.c]})` } : undefined} />
  ) : (
    <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={1} fill={COLOR[lamp.c]} className={cls} style={glow ? { filter: `drop-shadow(0 0 2px ${COLOR[lamp.c]})` } : undefined} />
  );
}

function Jack({ p, sel, peer, cabled, onClick, onDropCable, lamp, led, holding }: { p: PanelPort; sel: boolean; peer: boolean; cabled: boolean; onClick?: () => void; onDropCable?: (type: string) => void; lamp?: Lamp; led: string; holding?: boolean }) {
  const { w, h } = PORT_SIZE[p.shape];
  const { x, y } = p;
  const body =
    p.shape === 'rj45' || p.shape === 'console' ? (
      <>
        <rect x={x} y={y} width={w} height={h} rx={1.5} fill={p.shape === 'console' ? '#2f6fb0' : '#0b0f14'} stroke="#8996a4" strokeWidth={0.8} />
        {/* the latch notch: on top for bottom-row ports, which are mounted upside down */}
        <rect x={x + w / 2 - 5} y={p.flip ? y + 1.5 : y + h - 5.5} width={10} height={4} fill="#8996a4" opacity={0.55} />
        {cabled && <rect x={x + 3} y={p.flip ? y + 6 : y + 3} width={w - 6} height={h - 9} rx={1} fill={p.shape === 'console' ? '#7fb2e5' : '#d7dde4'} opacity={0.85} />}
      </>
    ) : p.shape === 'sfp' ? (
      <>
        <rect x={x} y={y} width={w} height={h} rx={1} fill="#0b0f14" stroke="#8996a4" strokeWidth={0.8} />
        {cabled && <rect x={x + 4} y={y + 2.5} width={w - 8} height={h - 5} rx={1} fill="#e6d36a" opacity={0.9} />}
      </>
    ) : (
      <>
        <path d={`M${x} ${y} h${w} l-3 ${h} h-${w - 6} z`} fill="#0b0f14" stroke="#8996a4" strokeWidth={0.8} />
        {cabled && <path d={`M${x + 4} ${y + 2.5} h${w - 8} l-2 ${h - 5} h-${w - 12} z`} fill="#c8a24a" opacity={0.9} />}
      </>
    );
  return (
    <g
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${p.iface}${lamp ? `, LED ${lamp.c === 'off' ? 'off' : lamp.c === 'greenamber' ? 'alternating green and amber' : lamp.c}: ${lamp.meaning}` : ''}`}
      aria-pressed={onClick ? sel : undefined}
      onClick={onClick}
      onKeyDown={(e) => onClick && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
      onDragOver={(e) => {
        if (onDropCable && !cabled && e.dataTransfer.types.includes('application/aegis-cable')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        const t = e.dataTransfer.getData('application/aegis-cable');
        if (t && onDropCable) {
          e.preventDefault();
          e.stopPropagation();
          onDropCable(t);
        }
      }}
      className={onClick ? 'phys-jack cursor-pointer outline-none' : undefined}
      data-testid={`phys-port-${p.iface}`}
      data-led={led}
      data-lamp={lamp?.c}
    >
      <title>{`${p.iface}${lamp ? ` · ${lamp.meaning}` : ''}`}</title>
      {holding && <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={3} fill="none" stroke="#4aa3ff" strokeWidth={1.6} strokeDasharray="3 2" className="led-blink" />}
      {(sel || peer) && <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx={3} fill="none" stroke={sel ? '#4aa3ff' : '#f2c94c'} strokeWidth={1.6} className={peer && !sel ? 'led-blink' : undefined} />}
      {body}
    </g>
  );
}

function Deco({ it, d, lampOf, onMode }: { it: PanelItem; d: Device; lampOf: (name: string) => Lamp; onMode?: () => void }) {
  switch (it.t) {
    case 'text':
      return (
        <text x={it.x} y={it.y} fill={it.dim ? '#8592a0' : '#d4dce4'} fontSize={it.size ?? 8} fontWeight={it.weight} textAnchor={it.anchor} fontFamily={FONT}>
          {it.text}
        </text>
      );
    case 'sysled': {
      const lamp = lampOf(it.name);
      return (
        <g data-testid={`phys-led-${it.name}`} data-on={lamp.c !== 'off'} data-lamp={lamp.c}>
          <title>{`${it.name}: ${lamp.c === 'off' ? 'off' : lamp.blink === 1 ? `blinking ${lamp.c}` : lamp.c} · ${lamp.meaning}`}</title>
          <LedDot x={it.x} y={it.y} lamp={lamp} round />
          <text x={it.x + 6} y={it.y + 2.3} fill="#a9b5c2" fontSize={6.3} fontFamily={FONT}>
            {it.name}
          </text>
        </g>
      );
    }
    case 'mode':
      return (
        <g role="button" tabIndex={0} aria-label="MODE button: change what the port LEDs show" onClick={onMode} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onMode?.())} className="phys-jack cursor-pointer outline-none" data-testid="phys-mode">
          <title>MODE: press to cycle the port LEDs between status, duplex, speed{d.model.includes('3650') ? ' and PoE' : ''}</title>
          <circle cx={it.x} cy={it.y} r={5} fill="#c7ced6" stroke="#5f6b78" />
          <circle cx={it.x} cy={it.y} r={3} fill="#e3e8ed" />
          <text x={it.x + 8} y={it.y + 2.3} fill="#a9b5c2" fontSize={6.3} fontFamily={FONT}>
            MODE
          </text>
        </g>
      );
    case 'box':
      return (
        <g>
          <rect x={it.x} y={it.y} width={it.w} height={it.h} rx={2} fill={it.tone === 'module' ? '#2b333d' : it.tone === 'psu' ? '#252c35' : '#1d232a'} stroke="#5f6b78" strokeDasharray={it.tone === 'blank' ? '3 3' : undefined} />
          {it.label && (
            <text x={it.x + 6} y={it.y + 10} fill="#8fa4ba" fontSize={6.3} fontFamily={FONT}>
              {it.label}
            </text>
          )}
        </g>
      );
    case 'vent':
      return (
        <g opacity={0.6}>
          {Array.from({ length: Math.floor(it.h / 7) }, (_, k) => (
            <rect key={k} x={it.x} y={it.y + k * 7} width={it.w} height={3} rx={1.5} fill="#11161c" />
          ))}
        </g>
      );
    case 'usb':
      return it.mini ? (
        <g>
          <title>USB mini-B console</title>
          <path d={`M${it.x} ${it.y} h12 l-2 6 h-8 z`} fill="#0b0f14" stroke="#8996a4" strokeWidth={0.7} />
        </g>
      ) : (
        <g>
          <title>USB-A (file transfer)</title>
          <rect x={it.x} y={it.y} width={14} height={6} rx={0.8} fill="#0b0f14" stroke="#8996a4" strokeWidth={0.7} />
          <rect x={it.x + 2} y={it.y + 1.5} width={10} height={2} fill="#4a8bd6" />
        </g>
      );
  }
}

/** One 19-inch panel. Width fills the container; the art keeps its proportions. */
export function FrontPanel({ d, doc, panel, selected, onPort, onDropCable, title, maxWidth = 960 }: { d: Device; doc: LabDoc; panel: Panel; selected?: string | null; onPort?: (port: string) => void; onDropCable?: (port: string, type: string) => void; title?: string; maxWidth?: number }) {
  const pending = useLab((s) => s.pendingEnd);
  useBootClock();
  const boot = useBoot();
  const cp = useMemo(() => controlPlane(doc), [doc]);
  const poe = useMemo(() => (panel.modes.includes('PoE') ? poeUsage(doc, d.id) : null), [doc, d.id, panel.modes]);
  const { phase } = phaseOf(d, boot.boots, boot.now);
  const post = phase === 'post';
  const mode = boot.modes[d.id] ?? panel.modes[0] ?? 'STAT';
  const focus = boot.focus;
  // The far end of the focused port, when it sits on this device's panel.
  const peerPorts = useMemo(() => {
    if (!focus) return new Set<string>();
    const s = new Set<string>();
    for (const c of doc.cables) {
      if (c.a.device === focus.device && c.a.port === focus.port && c.b.device === d.id) s.add(c.b.port);
      if (c.b.device === focus.device && c.b.port === focus.port && c.a.device === d.id) s.add(c.a.port);
    }
    return s;
  }, [focus, doc.cables, d.id]);
  const poeOn = new Map((poe?.ports ?? []).map((p) => [p.port, p.watts]));
  const lamps = panel.ports.map((p) => {
    const i = d.interfaces.find((x) => x.name === p.iface);
    if (!i) return null;
    const blocking = !!cp.stp[d.id]?.enabled && cp.stp[d.id]?.ports[p.iface]?.state === 'blocking';
    const f = portFacts(doc, d, i, { blocking, learning: learningOf(doc, d, p.iface, boot), poeW: poeOn.get(p.iface), post });
    return { f, lamp: portLamp(panel.modes.length ? mode : 'STAT', f) };
  });
  const anyLink = lamps.some((l) => l && l.f.cabled && l.f.state === 'up');
  const lampOf = (name: string) => sysLamp(name, d, { post, mode, poeOver: !!poe && poe.used > poe.budget, anyLink });
  const ears = panel.face === 'front' || panel.u === 1;
  return (
    <svg viewBox={`0 0 ${panel.w} ${panel.h}`} width="100%" style={{ maxWidth }} role="group" aria-label={title ?? `${d.name} ${panel.face} panel`} data-testid="phys-art" data-phase={phase} data-mode={mode} className="block">
      <rect x={0.5} y={0.5} width={panel.w - 1} height={panel.h - 1} rx={4} fill="#2a313a" stroke="#56616e" />
      {ears && (
        <>
          <rect x={0.5} y={0.5} width={18} height={panel.h - 1} rx={3} fill="#232a32" stroke="#56616e" />
          <rect x={panel.w - 18.5} y={0.5} width={18} height={panel.h - 1} rx={3} fill="#232a32" stroke="#56616e" />
          {[0.25, 0.75].map((f) => (
            <g key={f}>
              <ellipse cx={9.5} cy={panel.h * f} rx={3.5} ry={5} fill="#151a20" />
              <ellipse cx={panel.w - 9.5} cy={panel.h * f} rx={3.5} ry={5} fill="#151a20" />
            </g>
          ))}
        </>
      )}
      {panel.items.map((it, k) => (
        <Deco key={k} it={it} d={d} lampOf={lampOf} onMode={() => useBoot.getState().cycleMode(d.id, panel.modes)} />
      ))}
      {panel.ports.map((p, k) => {
        const l = lamps[k];
        if (!l) return null;
        return (
          <g key={p.iface}>
            {p.label && (
              <text x={p.label.x} y={p.label.y} fill="#8592a0" fontSize={5.6} textAnchor="middle" fontFamily={FONT}>
                {p.label.text}
              </text>
            )}
            {p.led && <LedDot x={p.led.x} y={p.led.y} lamp={l.lamp} />}
            <Jack p={p} sel={selected === p.iface} peer={peerPorts.has(p.iface)} cabled={l.f.cabled} lamp={l.lamp} led={semanticLed(l.f)} onClick={onPort ? () => onPort(p.iface) : undefined} onDropCable={onDropCable ? (t) => onDropCable(p.iface, t) : undefined} holding={pending?.device === d.id && pending.port === p.iface} />
          </g>
        );
      })}
    </svg>
  );
}
