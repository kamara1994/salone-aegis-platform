'use client';

// Canvas-wide views of the same lab: Logical (the topology canvas), Physical (every device's real
// panel with live LEDs) and Rack (devices mounted in their racks). Picking a port in any view
// picks it everywhere, and its far end lights up wherever it is drawn.
import { Cable as CableIcon, Network, Power, Server } from 'lucide-react';
import { useMemo } from 'react';
import { Button, cx } from '@/components/ui';
import { bootSpec, phaseOf, useBoot, useBootClock, type LabView, type Phase } from '@/lab/boot';
import { KIND_LABEL, modelOf } from '@/lab/catalog';
import { hardwareOf } from '@/lab/hardware';
import { panelFor, panelOf } from '@/lab/panels';
import { useLab } from '@/lab/store';
import type { Device, LabDoc } from '@/lab/types';
import { CABLE_LABEL, cableOnPort, cableStatus, deviceById, otherEnd } from '@/lab/validate';
import { FrontPanel } from './FrontPanel';
import { plugPort, unplugPort } from '@/lab/plug';
import type { CableType } from '@/lab/types';

const dropCable = (device: string) => (port: string, type: string) => plugPort({ device, port }, type as CableType);

export function ViewSwitch() {
  const view = useBoot((s) => s.view);
  const opts: [LabView, string, typeof Network][] = [
    ['logical', 'Logical', Network],
    ['physical', 'Physical', CableIcon],
    ['rack', 'Rack', Server],
  ];
  return (
    <div role="tablist" aria-label="Lab view" className="absolute top-2 left-1/2 z-20 flex -translate-x-1/2 gap-0.5 rounded-full border border-line bg-pane/95 p-0.5 shadow-sm" data-testid="lab-view-switch">
      {opts.map(([k, label, Icon]) => (
        <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => useBoot.getState().setView(k)} className={cx('flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium', view === k ? 'bg-action text-white' : 'text-muted hover:text-text')} data-testid={`lab-view-${k}`}>
          <Icon className="size-3.5" /> {label}
        </button>
      ))}
    </div>
  );
}

const PHASE_TEXT: Record<Phase, string> = { off: 'Off', post: 'Booting', stp: 'Converging', ready: 'Ready', fault: 'Fault' };

/** Off / Booting n% / Ready / Fault, with a power button. */
export function DeviceStatus({ d, compact }: { d: Device; compact?: boolean }) {
  useBootClock();
  const boots = useBoot((s) => s.boots);
  const now = useBoot((s) => s.now);
  const { phase, pct } = phaseOf(d, boots, now);
  const st = useLab();
  const toggle = () => (d.origin === 'design' ? st.setPower(d.id, d.power === 'stopped' ? 'running' : 'stopped') : st.openInspector('actions'));
  return (
    <span className="inline-flex items-center gap-1.5" data-testid={`status-${d.name}`} data-phase={phase}>
      <span className={cx('inline-flex h-5 items-center gap-1 rounded-full px-2 text-[10.5px] font-semibold', phase === 'ready' ? 'bg-healthy/15 text-healthy' : phase === 'post' ? 'bg-action/15 text-action' : phase === 'fault' ? 'bg-down/15 text-down' : 'bg-pane-2 text-muted')} title={phase === 'post' ? `Power-on self-test. Real hardware: ${bootSpec(d).real}.` : undefined}>
        <span className={cx('size-1.5 rounded-full', phase === 'ready' ? 'bg-healthy' : phase === 'post' ? 'animate-pulse bg-action' : phase === 'fault' ? 'bg-down' : 'bg-faint')} />
        {PHASE_TEXT[phase]}
        {phase === 'post' && ` ${pct}%`}
      </span>
      {!compact && (
        <button type="button" onClick={toggle} className={cx('grid size-6 place-items-center rounded-full border', d.power === 'stopped' ? 'border-line text-muted hover:text-healthy' : 'border-healthy/50 text-healthy hover:text-down')} title={d.power === 'stopped' ? 'Power on' : 'Power off'} aria-label={`${d.power === 'stopped' ? 'Power on' : 'Power off'} ${d.name}`} data-testid={`power-${d.name}`}>
          <Power className="size-3" />
        </button>
      )}
    </span>
  );
}

const ORDER: Device['kind'][] = ['router', 'firewall', 'switch', 'server', 'ap', 'pc', 'laptop', 'iot', 'vm', 'cloud'];
const hasHardware = (d: Device) => hardwareOf(modelOf(d)).psus.length > 0 || !!panelFor(d.model);

/** Click a port: while holding a cable it plugs in; otherwise it shows where the port goes. */
function openPort(device: string, port: string) {
  const st = useLab.getState();
  if (st.tool === 'cable' || st.pendingEnd) {
    const r = plugPort({ device, port });
    if (r.state === 'connected') useBoot.getState().setFocus({ device, port });
    return;
  }
  const b = useBoot.getState();
  const same = b.focus?.device === device && b.focus.port === port;
  b.setFocus(same ? null : { device, port });
}

/** The strip under the views that says what the picked port is plugged into. */
function FocusBar({ doc }: { doc: LabDoc }) {
  const focus = useBoot((s) => s.focus);
  const st = useLab();
  const err = useLab((s) => s.lastError);
  if (st.pendingEnd) {
    const hd = deviceById(doc, st.pendingEnd.device);
    return (
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]" data-testid="phys-holding">
        <span className="size-2 animate-pulse rounded-full bg-action" />
        <span>
          Holding a cable from <span className="font-mono font-semibold">{hd?.name} {st.pendingEnd.port}</span>. Click the port at the other end.
        </span>
        <span className="flex-1" />
        <Button size="sm" onClick={() => (st.setPendingEnd(null), st.setTool('select'))}>
          Drop the cable
        </Button>
      </div>
    );
  }
  if (err && err.tone !== 'ok' && err.issues.length) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-down" role="alert">
        <span className="font-semibold">{err.title}:</span> <span className="text-text">{err.issues[0].message}</span>
        <span className="flex-1" />
        <Button size="sm" onClick={() => st.setError(null)}>
          OK
        </Button>
      </div>
    );
  }
  if (!focus) return <p className="text-[12px] text-muted">Drag a cable from the Cables library onto a port to plug it in, then click the port at the other end. Click a plugged port to see where it goes.</p>;
  const d = deviceById(doc, focus.device);
  const c = cableOnPort(doc, focus.device, focus.port);
  const far = c ? otherEnd(c, focus.device, focus.port) : null;
  const fd = far ? deviceById(doc, far.device) : undefined;
  const cs = c ? cableStatus(doc, c) : null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px]" data-testid="phys-focus">
      <span className="font-mono font-semibold">
        {d?.name} {focus.port}
      </span>
      {c && fd ? (
        <>
          <span className="text-muted">→ {CABLE_LABEL[c.type]} →</span>
          <span className="font-mono font-semibold">
            {fd.name} {far!.port}
          </span>
          <span className={cx('rounded px-1.5 text-[11px]', cs?.state === 'up' ? 'bg-healthy/15 text-healthy' : cs?.state === 'degraded' ? 'bg-degraded/15 text-degraded' : 'bg-down/15 text-down')}>{cs?.state === 'up' ? (cs.negotiated ?? 'up') : cs?.issues[0]?.message ?? cs?.state}</span>
        </>
      ) : (
        <span className="text-muted">nothing plugged in</span>
      )}
      <span className="flex-1" />
      {c && (
        <Button
          size="sm"
          onClick={() => {
            useBoot.getState().setView('logical');
            st.select({ devices: [], cables: [c.id] });
          }}
          data-testid="phys-show-logical"
        >
          Show on the topology
        </Button>
      )}
      {c && (
        <Button size="sm" variant="danger" onClick={() => unplugPort(focus)} data-testid="phys-unplug">
          Unplug
        </Button>
      )}
      {!c && (
        <Button size="sm" variant="primary" onClick={() => plugPort(focus)} data-testid="phys-plug">
          Plug a cable in here
        </Button>
      )}
      <Button
        size="sm"
        onClick={() => {
          st.select({ devices: [focus.device], cables: [] });
          st.openInspector('physical');
        }}
      >
        Open in inspector
      </Button>
    </div>
  );
}

function Unit({ d, doc, maxWidth }: { d: Device; doc: LabDoc; maxWidth?: number }) {
  const focus = useBoot((s) => s.focus);
  const p = panelOf(d);
  const m = modelOf(d);
  const st = useLab();
  return (
    <section className="space-y-1.5" data-testid={`phys-unit-${d.name}`}>
      <header className="flex flex-wrap items-center gap-2">
        <button type="button" className="text-[13px] font-semibold hover:text-action" onClick={() => st.select({ devices: [d.id], cables: [] })}>
          {d.name}
        </button>
        <span className="text-[11.5px] text-muted">
          {m.vendor} {m.name}
        </span>
        <DeviceStatus d={d} />
      </header>
      {p ? (
        <>
          <div className="w-full max-w-[968px] rounded-[6px] bg-[#161b21] p-1">
            <FrontPanel d={d} doc={doc} panel={p} maxWidth={maxWidth} selected={focus?.device === d.id ? focus.port : null} onPort={(port) => openPort(d.id, port)} onDropCable={dropCable(d.id)} />
          </div>
          {p.rear.length > 0 && <GenericStrip d={d} doc={doc} only={p.rear} label="On the back:" />}
        </>
      ) : (
        <GenericStrip d={d} doc={doc} />
      )}
    </section>
  );
}

/** Devices without drawn art: one chip per physical port. */
function GenericStrip({ d, doc, only, label }: { d: Device; doc: LabDoc; only?: string[]; label?: string }) {
  const focus = useBoot((s) => s.focus);
  const ports = d.interfaces.filter((i) => (only ? only.includes(i.name) : !i.parent && !i.bridge && i.type !== 'virtual' && !/^(vlan|loopback|tunnel|port-channel)/i.test(i.name)));
  return (
    <div className="flex flex-wrap items-center gap-1">
      {label && <span className="text-[11px] text-muted">{label}</span>}
      {ports.map((i) => {
        const c = cableOnPort(doc, d.id, i.name);
        const s = c ? cableStatus(doc, c).state : null;
        const on = d.power !== 'stopped' && (s === 'up' || s === 'degraded');
        const sel = focus?.device === d.id && focus.port === i.name;
        const peer = !!focus && !!c && (() => { const f = otherEnd(c, d.id, i.name); return f.device === focus.device && f.port === focus.port; })();
        return (
          <button
            key={i.name}
            type="button"
            onClick={() => openPort(d.id, i.name)}
            onDragOver={(e) => {
              if (!c && e.dataTransfer.types.includes('application/aegis-cable')) e.preventDefault();
            }}
            onDrop={(e) => {
              const t = e.dataTransfer.getData('application/aegis-cable');
              if (t) {
                e.preventDefault();
                plugPort({ device: d.id, port: i.name }, t as CableType);
              }
            }} className={cx('flex h-6 items-center gap-1.5 rounded border px-2 font-mono text-[11px]', sel ? 'border-action bg-action/15' : peer ? 'led-blink border-[#f2c94c]' : 'border-line hover:border-line-strong')} data-testid={`phys-port-${d.name}-${i.name}`}>
            <span className={cx('size-1.5 rounded-full', on ? (s === 'degraded' ? 'bg-degraded' : 'bg-healthy') : c ? 'bg-down' : 'bg-faint')} />
            {i.name}
          </button>
        );
      })}
    </div>
  );
}

function PhysicalList({ doc }: { doc: LabDoc }) {
  const devices = [...doc.devices].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.name.localeCompare(b.name));
  const racked = devices.filter((d) => hasHardware(d) && d.kind !== 'pc' && d.kind !== 'laptop');
  const desk = devices.filter((d) => !racked.includes(d) && d.kind !== 'cloud' && d.kind !== 'vm');
  return (
    <div className="space-y-5">
      {racked.map((d) => (
        <Unit key={d.id} d={d} doc={doc} />
      ))}
      {desk.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[12px] font-semibold tracking-wide text-muted uppercase">Desk and wall devices</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {desk.map((d) => (
              <div key={d.id} className="space-y-1.5 rounded-[6px] border border-line p-2">
                <div className="flex items-center gap-2">
                  <span className="text-[12.5px] font-semibold">{d.name}</span>
                  <span className="truncate text-[11px] text-muted">{KIND_LABEL[d.kind]}</span>
                  <span className="flex-1" />
                  <DeviceStatus d={d} compact />
                </div>
                <GenericStrip d={d} doc={doc} />
              </div>
            ))}
          </div>
        </section>
      )}
      {!racked.length && !desk.length && <p className="text-[13px] text-muted">No devices yet. Add some from the device library on the Logical view.</p>}
    </div>
  );
}

/** Rack elevation: each rack drawn with its U numbers, devices at their U. Unracked gear goes in a lab rack. */
function RackView({ doc }: { doc: LabDoc }) {
  const racks = useMemo(() => {
    const out = doc.racks.map((r) => ({ id: r.id, name: r.name, units: r.units, members: doc.devices.filter((d) => d.rack?.rackId === r.id).map((d) => ({ d, u: d.rack!.u })) }));
    const loose = doc.devices.filter((d) => !d.rack && hasHardware(d) && !['pc', 'laptop', 'iot', 'ap', 'cloud', 'vm'].includes(d.kind));
    if (loose.length) {
      const sorted = [...loose].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.name.localeCompare(b.name));
      const units = Math.max(12, sorted.reduce((n, d) => n + (panelFor(d.model)?.u ?? 1) + 1, 2));
      let u = units - 1;
      const members = sorted.map((d) => {
        const h = panelFor(d.model)?.u ?? 1;
        const at = u - h + 1;
        u -= h + 1;
        return { d, u: at };
      });
      out.push({ id: 'lab', name: doc.racks.length ? 'Not assigned to a rack' : 'Lab rack', units, members });
    }
    return out;
  }, [doc]);
  const focus = useBoot((s) => s.focus);
  const RW = 440; // rack inner width in px
  const UH = (RW * 88) / 960; // one rack unit at the same scale as the panel art
  return (
    <div className="flex flex-wrap items-start gap-6">
      {racks.map((r) => (
        <figure key={r.id} className="space-y-1.5" data-testid={`rack-${r.name}`}>
          <figcaption className="text-[12.5px] font-semibold">
            {r.name} <span className="font-normal text-muted">· {r.units}U</span>
          </figcaption>
          <div className="relative flex rounded-[4px] border-x-[14px] border-y-[10px] border-[#2a2f36] bg-[#0f1318]" style={{ width: RW + 28 }}>
            <div className="relative" style={{ width: RW, height: r.units * UH }}>
              {Array.from({ length: r.units }, (_, k) => (
                <div key={k} className="absolute inset-x-0 border-t border-white/5" style={{ top: k * UH, height: UH }}>
                  <span className="absolute -left-[12px] top-1/2 -translate-y-1/2 font-mono text-[8px] text-faint">{r.units - k}</span>
                </div>
              ))}
              {r.members.map(({ d, u }) => {
                const p = panelOf(d);
                const h = (p?.u ?? 1) * UH;
                const top = (r.units - (u + (p?.u ?? 1) - 1)) * UH;
                return (
                  <div key={d.id} className="absolute inset-x-0" style={{ top, height: h }} title={`${d.name} at U${u}`} data-testid={`rack-unit-${d.name}`}>
                    {p ? (
                      <FrontPanel d={d} doc={doc} panel={p} selected={focus?.device === d.id ? focus.port : null} onPort={(port) => openPort(d.id, port)} onDropCable={dropCable(d.id)} />
                    ) : (
                      <button type="button" onClick={() => useLab.getState().select({ devices: [d.id], cables: [] })} className="flex h-full w-full items-center gap-2 rounded-[3px] border border-[#56616e] bg-[#2a313a] px-2 text-left text-[10.5px] text-[#d4dce4]">
                        <span className={cx('size-1.5 rounded-full', d.power === 'stopped' ? 'bg-faint' : 'bg-healthy')} />
                        <span className="truncate font-semibold">{d.name}</span>
                        <span className="truncate text-[#8592a0]">{modelOf(d).name}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </figure>
      ))}
      {!racks.length && <p className="text-[13px] text-muted">No rack-mounted devices yet.</p>}
      <p className="basis-full text-[11.5px] text-muted">Racks and rack units come from Sites, racks, VLANs in the menu. Devices you have not placed go in the lab rack, top down.</p>
    </div>
  );
}

/** Covers the canvas when Physical or Rack is picked. */
export function PhysicalBoard() {
  const view = useBoot((s) => s.view);
  const doc = useLab((s) => s.doc);
  if (view === 'logical' || !doc) return null;
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-ink" data-testid={`board-${view}`}>
      <div className="min-h-0 flex-1 overflow-auto px-4 pt-12 pb-4">{view === 'physical' ? <PhysicalList doc={doc} /> : <RackView doc={doc} />}</div>
      <div className="shrink-0 border-t border-line bg-pane px-4 py-2">
        <FocusBar doc={doc} />
      </div>
    </div>
  );
}
