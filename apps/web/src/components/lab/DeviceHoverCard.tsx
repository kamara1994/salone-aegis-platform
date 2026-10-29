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
const LAB_ASSET: Record<string, string> = {
  isr4331: '/lab/generated/labeled/cisco-isr-4331-annotated.png',
  isr1941: '/lab/generated/labeled/cisco-1941-annotated.png',
  c2960x24: '/lab/generated/labeled/cisco-catalyst-2960x-annotated.png',
  c2960x24ps: '/lab/generated/labeled/cisco-catalyst-2960x-annotated.png',
  'c9300-24t': '/lab/generated/labeled/cisco-catalyst-9300-annotated.png',
  dec2750: '/lab/generated/labeled/opnsense-dec2750-annotated.png',
  r650: '/lab/generated/labeled/dell-poweredge-r650-annotated.png',
  'proxmox-vm': '/lab/generated/labeled/proxmox-vm-annotated.png',
  optiplex: '/lab/generated/labeled/dell-optiplex-7010-annotated.png',
  'legacy-pc': '/lab/generated/labeled/legacy-pc-annotated.png',
  thinkpad: '/lab/generated/labeled/thinkpad-t14-annotated.png',
  c9120: '/lab/generated/labeled/catalyst-9120axi-annotated.png',
  'aws-vpc': '/lab/generated/labeled/aws-vpc-annotated.png',
  internet: '/lab/generated/labeled/internet-wan-annotated.png',
  'axis-cam': '/lab/generated/labeled/axis-m3106-annotated.png',
  'iot-sensor': '/lab/generated/labeled/environmental-sensor-annotated.png',
};

export function DevicePicture({ model, className }: { model: DeviceModel; className?: string }) {
  const [failed, setFailed] = useState(false);
  const asset = LAB_ASSET[model.key] ?? model.image;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={failed ? model.image : asset} onError={() => setFailed(true)} alt={`${model.vendor} ${model.name}`} className={className} data-photo={failed ? 'illustration' : 'generated-asset'} />
  );
}

export function DeviceHoverCard({ device: d, anchor }: { device: Device; anchor: DOMRect }) {
  const m = modelOf(d);
  const w = 300;
  const right = anchor.right + 10 + w < window.innerWidth;
  const left = right ? anchor.right + 10 : Math.max(8, anchor.left - w - 10);
  const top = Math.min(Math.max(8, anchor.top - 10), window.innerHeight - 330);
  return createPortal(
    <div role="tooltip" className="pointer-events-none fixed z-[2000] rounded-[8px] border border-line-strong bg-pane p-2.5 text-[12px] shadow-xl" style={{ left, top, width: w }} data-testid="device-hover-card">
      <div className="mb-2 flex h-[130px] items-center justify-center overflow-hidden rounded bg-white/95">
        <DevicePicture model={m} className="max-h-[120px] max-w-[270px] object-contain" />
      </div>
      <p className="text-[13px] font-semibold">
        {m.vendor} {m.name}
      </p>
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
