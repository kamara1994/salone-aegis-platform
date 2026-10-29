'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { KIND_LABEL, modelOf, type DeviceModel } from '@/lab/catalog';
import { primaryIp } from '@/lab/simulate';
import type { Device, DeviceKind } from '@/lab/types';

/** Where this kind of device lives in a real building, so the operator learns to recognise it. */
const WHERE: Record<DeviceKind, string> = {
  router: 'Edge of the network, in the main rack or MDF, facing the ISP or the WAN.',
  switch: 'Wiring closet (IDF) rack; access switches feed desks, distribution switches feed closets.',
  firewall: 'Between the internet and the inside network, in the main rack.',
  server: 'Server room or data-centre rack (usually 1U or 2U).',
  vm: 'Runs on a hypervisor host (Proxmox, ESXi, Hyper-V) in the server room or cloud.',
  pc: 'Under or on a desk, cabled to a wall jack that runs back to an access switch.',
  laptop: 'Desk or meeting room; on Wi-Fi or a dock.',
  ap: 'Ceiling or high on a wall, powered by PoE from the closet switch.',
  cloud: 'Off-site: the provider’s network or a cloud region.',
  iot: 'On walls or ceilings (cameras, sensors), usually powered by PoE.',
};

export function portSummary(m: DeviceModel): string {
  const groups = new Map<string, number>();
  for (const p of m.ports()) {
    const max = Math.max(...p.speeds);
    const sp = max >= 10000 ? '10G' : max >= 1000 ? '1G' : max >= 100 ? '100M' : '';
    const label = p.type === 'copper' ? `${sp} copper` : p.type === 'sfp' ? `${sp} SFP` : p.type === 'serial' ? 'serial' : p.type === 'console' ? 'console' : p.type === 'terminal' ? 'RS-232' : p.type === 'wireless' ? 'Wi-Fi radio' : 'virtual NIC';
    groups.set(label, (groups.get(label) ?? 0) + 1);
  }
  return [...groups.entries()].map(([k, n]) => `${n}× ${k}`).join(', ');
}

/** Model-specific visual assets generated for the lab. Falls back to the original SVG if an asset is unavailable. */
const LAB_ASSET_ROOT = '/lab/generated/labeled/trimmed';
const asset = (name: string) => `${LAB_ASSET_ROOT}/${name}`;
const LAB_ASSET: Record<string, string> = {
  isr4331: asset('cisco-isr-4331-annotated.png'),
  isr1941: asset('cisco-1941-annotated.png'),
  c2960x24: asset('cisco-catalyst-2960x-annotated.png'),
  c2960x24ps: asset('cisco-catalyst-2960x-annotated.png'),
  'c9300-24t': asset('cisco-catalyst-9300-annotated.png'),
  dec2750: asset('opnsense-dec2750-annotated.png'),
  r650: asset('dell-poweredge-r650-annotated.png'),
  'proxmox-vm': asset('proxmox-vm-annotated.png'),
  optiplex: asset('dell-optiplex-7010-annotated.png'),
  'legacy-pc': asset('legacy-pc-annotated.png'),
  thinkpad: asset('thinkpad-t14-annotated.png'),
  c9120: asset('catalyst-9120axi-annotated.png'),
  'aws-vpc': asset('aws-vpc-annotated.png'),
  internet: asset('internet-wan-annotated.png'),
  'axis-cam': asset('axis-m3106-annotated.png'),
  'iot-sensor': asset('environmental-sensor-annotated.png'),
  c9800l: asset('cisco-catalyst-9800l-annotated.png'),
  'services-server': asset('ubuntu-services-server-annotated.png'),
  'kali-workstation': asset('kali-workstation-annotated.png'),
  'ip-phone-8845': asset('ip-phone-8845-annotated.png'),
  'network-printer': asset('network-printer-annotated.png'),
};

export function DevicePicture({ model, className }: { model: DeviceModel; className?: string }) {
  // 0 = generated photo-style asset, 1 = catalog illustration, 2 = neither loaded: show a labelled placeholder
  const [stage, setStage] = useState(0);
  const asset = LAB_ASSET[model.key] ?? model.image;
  if (stage === 2)
    return (
      <div role="img" aria-label={`${model.vendor} ${model.name} (picture unavailable)`} className={`${className ?? ''} grid place-items-center bg-pane-2 text-center text-[11px] text-muted`} data-photo="placeholder" style={{ minHeight: 96 }}>
        Picture unavailable
        <br />
        {model.vendor} {model.name}
      </div>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={stage === 0 ? asset : model.image} onError={() => setStage((x) => (x === 0 && asset !== model.image ? 1 : 2))} alt={`${model.vendor} ${model.name}`} className={className} data-photo={stage === 0 ? 'generated-asset' : 'illustration'} />
  );
}

export function DeviceHoverCard({ device: d, anchor, onEnter, onLeave }: { device: Device; anchor: DOMRect; onEnter?: () => void; onLeave?: () => void }) {
  const m = modelOf(d);
  const [zoom, setZoom] = useState(false);
  const w = zoom ? Math.min(720, window.innerWidth - 16) : Math.min(380, window.innerWidth - 16);
  const right = anchor.right + 10 + w < window.innerWidth;
  const left = right ? anchor.right + 10 : Math.max(8, anchor.left - w - 10);
  const top = Math.min(Math.max(8, anchor.top - 10), window.innerHeight - (zoom ? 620 : 430));
  return createPortal(
    <div role="tooltip" onMouseEnter={onEnter} onMouseLeave={onLeave} className="pointer-events-auto fixed z-[2000] rounded-[8px] border border-line-strong bg-pane p-2.5 text-[12px] shadow-xl" style={{ left, top, width: w }} data-testid="device-hover-card">
      <div className={`mb-2 flex items-center justify-center overflow-hidden rounded bg-pane-2 ${zoom ? 'h-[430px]' : 'h-[250px]'}`}>
        <DevicePicture model={m} className="max-h-full max-w-full object-contain" />
      </div>
      <div className="flex items-center gap-2"><p className="text-[13px] font-semibold">{m.vendor} {m.name}</p><button type="button" className="ml-auto rounded border border-line px-1.5 py-0.5 text-[10px] text-muted hover:text-text" onClick={() => setZoom((v) => !v)}>{zoom ? 'Fit image' : 'Zoom image'}</button></div>
      <p className="text-muted">
        {KIND_LABEL[d.kind]} · {d.name}
        {primaryIp(d) ? ` · ${primaryIp(d)}` : ''}
      </p>
      <p className="mt-1">{m.description}</p>
      <p className="mt-1">
        <span className="text-muted">Ports: </span>
        {portSummary(m)}
      </p>
      {(m.poeBudgetW || m.poeDrawW) && (
        <p>
          <span className="text-muted">Power: </span>
          {m.poeBudgetW ? `supplies ${m.poeBudgetW} W PoE` : `needs ${m.poeDrawW} W PoE`}
        </p>
      )}
      <p className="mt-1 text-muted">{WHERE[d.kind]}</p>
      {d.powerReason && <p className="mt-1 text-down">{d.powerReason}</p>}
    </div>,
    document.body,
  );
}
