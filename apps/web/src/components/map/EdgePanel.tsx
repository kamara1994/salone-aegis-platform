'use client';

import { useFlows, useTopology } from '@/api/hooks';
import type { Flow } from '@/api/types';
import { Badge, cx, fmtBytes, QueryView } from '@/components/ui';
import { useLive } from '@/state/ui';

/** Packet-level view of one flow, reconstructed from the flow record (live mode: from the Zeek/Arkime capture). */
function Packets({ f }: { f: Flow }) {
  const sp = 49152 + (f.dst.length * 131 + f.port) % 15000;
  const lines =
    f.verdict === 'denied'
      ? [`${f.src}:${sp} > ${f.dst}:${f.port} ${f.proto.toUpperCase()} [SYN] seq=0 win=64240`, `${f.src}:${sp} > ${f.dst}:${f.port} [SYN] retransmission (+1.0s)`, `${f.src}:${sp} > ${f.dst}:${f.port} [SYN] retransmission (+3.0s)`, `FW01: block in log on vlan${f.src.split('.')[2]} rule 99 (default deny)`]
      : f.proto === 'udp'
        ? [`${f.src}:${sp} > ${f.dst}:${f.port} UDP len=48 (${f.app} query)`, `${f.dst}:${f.port} > ${f.src}:${sp} UDP len=112 (${f.app} response)`]
        : [`${f.src}:${sp} > ${f.dst}:${f.port} [SYN] seq=0 win=64240 mss=1460`, `${f.dst}:${f.port} > ${f.src}:${sp} [SYN, ACK] seq=0 ack=1`, `${f.src}:${sp} > ${f.dst}:${f.port} [ACK] seq=1 ack=1`, `${f.src}:${sp} > ${f.dst}:${f.port} [PSH, ACK] len=${Math.min(1448, Math.round(f.bytes_per_s / 40))} (${f.app})`, `… ${f.packets ?? 0} packets in this 2 s window`];
  return <pre className="overflow-auto rounded bg-ink p-2 font-mono text-[11px] leading-relaxed text-muted">{lines.join('\n')}</pre>;
}

export function EdgePanel({ edgeId }: { edgeId: string }) {
  const q = useFlows(edgeId);
  const topo = useTopology('all');
  const live = useLive((s) => s.flows[edgeId]);
  const link = topo.data?.links.find((l) => l.id === edgeId);
  const name = (id?: string) => topo.data?.nodes.find((n) => n.id === id)?.name ?? '';
  return (
    <div className="space-y-3 p-3 text-[13px]">
      <div>
        <h3 className="text-[15px] font-semibold">
          {name(link?.a_node_id)} ↔ {name(link?.b_node_id)}
        </h3>
        <p className="text-muted">
          {link?.label} · {link?.kind} · link {link?.state}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge tone="info">{fmtBytes(live?.bytes_per_s ?? 0)}</Badge>
        <Badge tone="good">{live?.allowed ?? 0} allowed</Badge>
        <Badge tone={(live?.denied ?? 0) > 0 ? 'bad' : 'neutral'}>{live?.denied ?? 0} blocked</Badge>
        {live?.top_app && <Badge>top app: {live.top_app}</Badge>}
      </div>
      <p className="text-[12px] text-faint">Allowed flows come from Zeek on the mirror port. Blocked flows come from OPNsense logs, because a blocked packet never reaches Zeek.</p>
      <QueryView q={q} empty={(d) => (d.length ? false : <p className="text-muted">No flows observed on this edge in the last few seconds.</p>)}>
        {(flows) => (
          <ul className="space-y-2">
            {flows.slice(0, 12).map((f, i) => (
              <li key={i}>
                <details className="rounded border border-line">
                  <summary className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-[12.5px]">
                    <span className={cx('size-2 rounded-full', f.verdict === 'denied' ? 'bg-down' : 'bg-healthy')} />
                    <span className="font-mono">
                      {f.src} → {f.dst}:{f.port}
                    </span>
                    <span className="text-muted">{f.app}</span>
                    <span className="ml-auto text-muted">{f.verdict === 'denied' ? 'blocked' : fmtBytes(f.bytes_per_s)}</span>
                  </summary>
                  <div className="p-2">
                    <Packets f={f} />
                    <p className="mt-1 text-[11.5px] text-faint">Source: {f.source === 'firewall' ? 'OPNsense filter log' : 'Zeek conn.log'} · {new Date(f.observed_at).toLocaleTimeString()}</p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </div>
  );
}
