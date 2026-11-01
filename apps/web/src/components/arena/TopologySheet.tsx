'use client';

import { useMemo } from 'react';
import { MODEL_BY_KEY } from '@/lab/catalog';
import { DEVICE_H, DEVICE_W } from '@/lab/inventory';
import type { LabDoc } from '@/lab/types';

const short = (port: string) => port.replace(/^GigabitEthernet/, 'Gi').replace(/^FastEthernet/, 'Fa');

/** The lab sheet for a blank-canvas lab: what to place, what to name it, and which ports to cable. */
export function TopologySheet({ reference }: { reference: LabDoc }) {
  const { devices, cables } = reference;
  const box = useMemo(() => {
    const xs = devices.map((d) => d.x);
    const ys = devices.map((d) => d.y);
    const minX = Math.min(...xs) - 30;
    const minY = Math.min(...ys) - 20;
    return { minX, minY, w: Math.max(...xs) + DEVICE_W + 30 - minX, h: Math.max(...ys) + DEVICE_H + 30 - minY };
  }, [devices]);
  // Text scales with the drawing so a 9-device floor is as readable as a 3-device lab.
  const f = Math.max(1, box.w / 700);
  const at = (id: string) => devices.find((d) => d.id === id)!;
  const centre = (id: string) => ({ x: at(id).x + DEVICE_W / 2, y: at(id).y + DEVICE_H / 2 });
  const name = (id: string) => at(id)?.name ?? id;
  return (
    <div className="space-y-3" data-testid="arena-topology">
      <p className="rounded border border-action/30 bg-action/5 p-2 text-[12px] leading-relaxed">
        Build this network yourself: drag each device in from the device library, give it the <b>exact hostname</b> shown, connect the <b>exact ports</b> with the right cable, then configure it. Grading finds your devices by hostname.
      </p>
      <svg viewBox={`${box.minX} ${box.minY} ${box.w} ${box.h}`} className="w-full rounded border border-line bg-ink" role="img" aria-label="Reference topology">
        {cables.map((c) => {
          const a = centre(c.a.device);
          const b = centre(c.b.device);
          const t = (f: number) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
          const pa = t(0.3);
          const pb = t(0.7);
          return (
            <g key={c.id}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--muted)" strokeWidth={2} />
              <text x={pa.x} y={pa.y - 4} fontSize={13 * f} textAnchor="middle" fill="var(--text)" className="font-mono" paintOrder="stroke" stroke="var(--ink)" strokeWidth={4 * f}>
                {short(c.a.port)}
              </text>
              <text x={pb.x} y={pb.y - 4} fontSize={13 * f} textAnchor="middle" fill="var(--text)" className="font-mono" paintOrder="stroke" stroke="var(--ink)" strokeWidth={4 * f}>
                {short(c.b.port)}
              </text>
            </g>
          );
        })}
        {devices.map((d) => (
          <g key={d.id}>
            <rect x={d.x} y={d.y + 20} width={DEVICE_W} height={DEVICE_H - 40} rx={8} fill="var(--pane)" stroke="var(--line-strong)" />
            <text x={d.x + DEVICE_W / 2} y={d.y + DEVICE_H / 2 - 2} fontSize={17 * f} fontWeight={600} textAnchor="middle" fill="var(--text)">
              {d.name}
            </text>
            <text x={d.x + DEVICE_W / 2} y={d.y + DEVICE_H / 2 + 15} fontSize={11 * f} textAnchor="middle" fill="var(--muted)">
              {MODEL_BY_KEY[d.model]?.name ?? d.model}
            </text>
          </g>
        ))}
      </svg>
      <div>
        <h3 className="mb-1 text-[11.5px] font-semibold tracking-wide text-muted uppercase">Devices to place ({devices.length})</h3>
        <ul className="grid grid-cols-2 gap-1 text-[12px]">
          {devices.map((d) => (
            <li key={d.id} className="rounded border border-line px-2 py-1">
              <span className="font-mono font-medium">{d.name}</span>
              <span className="block truncate text-[11px] text-muted">{MODEL_BY_KEY[d.model]?.name ?? d.model}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-1 text-[11.5px] font-semibold tracking-wide text-muted uppercase">Cabling plan ({cables.length})</h3>
        <table className="w-full text-left font-mono text-[11.5px]">
          <tbody>
            {cables.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="py-1 pr-2">
                  {name(c.a.device)} {short(c.a.port)}
                </td>
                <td className="pr-2 text-faint">to</td>
                <td className="pr-2">
                  {name(c.b.device)} {short(c.b.port)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-muted">The cable type is your call. Pick the wrong one and the link stays down, like real hardware.</p>
      </div>
    </div>
  );
}

