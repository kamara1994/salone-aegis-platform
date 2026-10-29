'use client';

import { useReactFlow } from '@xyflow/react';
import { createPortal } from 'react-dom';
import { useState } from 'react';
import { cx } from '@/components/ui';
import { CABLE_INFO } from '@/lab/cables';
import { CATALOG, KIND_LABEL, type DeviceModel } from '@/lab/catalog';
import { useLab } from '@/lab/store';
import type { CableType, DeviceKind } from '@/lab/types';
import { CABLE_ASSET, CABLE_STYLE } from './CanvasParts';
import { DevicePicture, portSummary } from './DeviceHoverCard';

const ORDER: DeviceKind[] = ['router', 'switch', 'firewall', 'server', 'vm', 'pc', 'laptop', 'ap', 'cloud', 'iot'];

function CableIcon({ type }: { type: CableType | 'auto' }) {
  if (type === 'auto')
    return (
      <svg viewBox="0 0 48 24" className="h-6 w-12" aria-hidden>
        <path d="M27 2 L17 13 h7 l-3 9 l10 -12 h-7 z" fill="#f5c542" stroke="#8a6a00" strokeWidth="0.8" />
      </svg>
    );
  const st = CABLE_STYLE[type];
  return (
    <svg viewBox="0 0 48 24" className="h-6 w-12" aria-hidden>
      <path d="M8 16 C 18 2, 30 22, 40 8" fill="none" stroke={st.color} strokeWidth={st.width + 0.6} strokeDasharray={st.dash} strokeLinecap="round" />
      <rect x="2" y="13" width="7" height="6" rx="1" fill="var(--pane-2, #1d3550)" stroke={st.color} strokeWidth="1" />
      <rect x="39" y="5" width="7" height="6" rx="1" fill="var(--pane-2, #1d3550)" stroke={st.color} strokeWidth="1" />
    </svg>
  );
}

/** Packet Tracer's "Connections": pick a cable, then click two devices and choose their ports. */
function CableLibrary() {
  const tool = useLab((s) => s.tool);
  const cableType = useLab((s) => s.cableType);
  const pending = useLab((s) => s.pendingEnd);
  const doc = useLab((s) => s.doc);
  const pick = (t: CableType | 'auto') => {
    const st = useLab.getState();
    st.setCableType(t);
    st.setTool('cable');
  };
  const active = tool === 'cable' ? CABLE_INFO.find((c) => c.type === cableType) : undefined;
  const pendingName = pending ? doc?.devices.find((d) => d.id === pending.device)?.name : undefined;
  const [hover, setHover] = useState<{ info: (typeof CABLE_INFO)[number]; rect: DOMRect } | null>(null);
  return (
    <div data-testid="cable-library">
      <p className="mb-2 px-1 text-[11.5px] text-muted">Pick a cable, then click the first device and the second device and choose their ports.</p>
      <ul className="grid grid-cols-2 gap-1.5">
        {CABLE_INFO.map((c) => {
          const on = tool === 'cable' && cableType === c.type;
          return (
            <li key={c.type}>
              <button
                type="button"
                draggable
                aria-pressed={on}
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/aegis-cable', c.type);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onMouseEnter={(e) => setHover({ info: c, rect: e.currentTarget.getBoundingClientRect() })}
                onMouseLeave={() => setHover(null)}
                onClick={() => (on ? useLab.getState().setTool('select') : pick(c.type))}
                title={`${c.name}: ${c.use} Connector: ${c.connector}. Max: ${c.limit}.`}
                data-testid={`cable-card-${c.type}`}
                className={cx('group relative flex w-full cursor-grab flex-col items-center rounded-[6px] border px-1 py-1.5 text-center active:cursor-grabbing', on ? 'border-action bg-action/15' : 'border-line bg-pane-2/40 hover:border-action')}
              >
                <CableIcon type={c.type} />
                <span className="mt-0.5 line-clamp-2 text-[10.5px] leading-tight">{c.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {hover && typeof document !== 'undefined' && createPortal(
        <div className="pointer-events-none fixed z-[2100] w-56 rounded border border-line-strong bg-pane p-2 text-left text-[10px] shadow-xl" style={{ left: Math.min(hover.rect.right + 8, window.innerWidth - 240), top: Math.min(hover.rect.top, window.innerHeight - 190) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={CABLE_ASSET[hover.info.type] ?? '/lab/generated/cables/cat6-ethernet-blue.png'} alt="" className="mb-1 h-20 w-full rounded bg-white/95 object-contain" />
          <b className="block text-[11px]">{hover.info.name}</b>
          <span className="mt-1 block text-muted">{hover.info.use}</span>
          <span className="mt-1 block font-mono text-faint">{hover.info.connector} · {hover.info.limit}</span>
        </div>,
        document.body,
      )}
      {active ? (
        <div className="mt-2 space-y-1 rounded border border-action/50 bg-action/5 p-2 text-[11.5px]" data-testid="cable-active">
          <p className="font-semibold">{active.name}</p>
          <p>{active.use}</p>
          <p className="text-muted">
            {active.connector}. Max {active.limit}.
          </p>
          <p className="font-medium text-action">{pendingName ? `First end on ${pendingName} ${pending!.port}. Now click the second device.` : 'Click the first device on the canvas.'}</p>
          <button type="button" className="text-muted underline" onClick={() => useLab.getState().setTool('select')}>
            Stop cabling (Esc)
          </button>
        </div>
      ) : (
        <p className="mt-2 px-1 text-[11px] text-muted">Wrong cables are refused with the reason, just like real ports would not link.</p>
      )}
    </div>
  );
}

/** Device library. Drag a device onto the canvas, or focus it and press Enter to place it in the middle of the view. */
export function Palette() {
  const [tab, setTab] = useState<'devices' | 'cables'>('devices');
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Library" className="flex border-b border-line px-1">
        {(
          [
            ['devices', 'Devices'],
            ['cables', 'Cables'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`library-${k}`} className={cx('-mb-px flex-1 border-b-2 px-2 py-1.5 text-[12px]', tab === k ? 'border-action text-text' : 'border-transparent text-muted hover:text-text')}>
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">{tab === 'devices' ? <DeviceLibrary /> : <nav aria-label="Cable library" className="h-full overflow-auto p-2"><CableLibrary /></nav>}</div>
    </div>
  );
}

function DeviceLibrary() {
  const add = useLab((s) => s.addDevice);
  const rf = useReactFlow();
  const [hover, setHover] = useState<{ model: DeviceModel; rect: DOMRect } | null>(null);
  const center = () => {
    const r = document.querySelector('[data-testid="lab-canvas"]')?.getBoundingClientRect();
    const k = (useLab.getState().doc?.devices.filter((d) => d.origin === 'design').length ?? 0) % 6;
    return r ? rf.screenToFlowPosition({ x: r.left + r.width / 2 + k * 32, y: r.top + r.height / 2 + k * 32 }) : { x: 200, y: 200 };
  };
  return (
    <nav aria-label="Device library" className="h-full overflow-auto p-2" data-testid="palette">
      <p className="mb-2 px-1 text-[11.5px] text-muted">Drag onto the canvas, or press Enter to add.</p>
      {ORDER.map((kind) => (
        <section key={kind} className="mb-2">
          <h3 className="px-1 pb-1 text-[11.5px] font-semibold text-muted">{KIND_LABEL[kind]}</h3>
          <ul className="grid grid-cols-2 gap-1.5">
            {CATALOG.filter((m) => m.kind === kind).map((m) => (
              <li key={m.key}>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/aegis-model', m.key);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => {
                    const c = center();
                    add(m.key, c.x, c.y);
                  }}
                  aria-label={`Add ${m.vendor} ${m.name} (${KIND_LABEL[m.kind]})`}
                  data-testid={`palette-${m.key}`}
                  onMouseEnter={(e) => setHover({ model: m, rect: e.currentTarget.getBoundingClientRect() })}
                  onMouseLeave={() => setHover(null)}
                  className="relative flex w-full cursor-grab flex-col items-center rounded-[6px] border border-line bg-pane-2/40 px-1 py-1.5 text-center hover:border-action focus-visible:border-action active:cursor-grabbing"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {/* Keep the compact palette icon visible; the generated real-world asset appears only in the hover preview. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.image} alt="" className="pointer-events-none h-8 w-12 object-contain" draggable={false} />
                  <span className="mt-0.5 line-clamp-2 text-[10.5px] leading-tight">{m.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {hover && typeof document !== 'undefined' && createPortal(
        <div className="pointer-events-none fixed z-[2100] w-[min(340px,calc(100vw-16px))] rounded border border-line-strong bg-pane p-2 text-left text-[10px] shadow-xl" style={{ left: window.innerWidth < 700 ? 8 : Math.min(hover.rect.right + 8, window.innerWidth - 356), top: window.innerWidth < 700 ? Math.min(hover.rect.bottom + 8, window.innerHeight - 270) : Math.min(hover.rect.top, window.innerHeight - 270) }} data-testid="palette-device-hover-card">
          <div className="mb-1 h-48 overflow-hidden rounded bg-white/95"><DevicePicture model={hover.model} className="h-full w-full object-contain" /></div>
          <b className="block text-[12px]">{hover.model.vendor} {hover.model.name}</b>
          <span className="mt-1 block text-muted">{hover.model.description}</span>
          <span className="mt-1 block font-mono text-faint">Ports: {portSummary(hover.model)}</span>
        </div>,
        document.body,
      )}
    </nav>
  );
}
