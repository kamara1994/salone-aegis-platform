'use client';

import { useReactFlow } from '@xyflow/react';
import { CATALOG, KIND_LABEL } from '@/lab/catalog';
import { useLab } from '@/lab/store';
import type { DeviceKind } from '@/lab/types';

const ORDER: DeviceKind[] = ['router', 'switch', 'firewall', 'server', 'vm', 'pc', 'laptop', 'ap', 'cloud', 'iot'];

/** Device library. Drag a device onto the canvas, or focus it and press Enter to place it in the middle of the view. */
export function Palette() {
  const add = useLab((s) => s.addDevice);
  const rf = useReactFlow();
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
                  title={`${m.vendor} ${m.name}: ${m.description}`}
                  aria-label={`Add ${m.vendor} ${m.name} (${KIND_LABEL[m.kind]})`}
                  data-testid={`palette-${m.key}`}
                  className="flex w-full cursor-grab flex-col items-center rounded-[6px] border border-line bg-pane-2/40 px-1 py-1.5 text-center hover:border-action focus-visible:border-action active:cursor-grabbing"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.image} alt="" className="pointer-events-none h-8 w-12 object-contain" draggable={false} />
                  <span className="mt-0.5 line-clamp-2 text-[10.5px] leading-tight">{m.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
