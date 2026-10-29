'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTopology } from '@/api/hooks';
import { EdgePanel } from '@/components/map/EdgePanel';
import { NodePanel } from '@/components/map/NodePanel';
import { MapLegend, TopologyMap } from '@/components/map/TopologyMap';
import { cx, EmptyState, HealthDot, Pane, QueryView } from '@/components/ui';

export default function TopologyPage() {
  const topo = useTopology();
  const [sel, setSel] = useState<{ node?: string; edge?: string }>({});
  const [view, setView] = useState<'map' | 'list'>('map');
  return (
    <div className="flex h-full gap-2 p-2">
      <Pane
        className="min-w-0 flex-1"
        title="Topology"
        actions={
          <div className="flex items-center gap-2">
          <Link href="/lab" className="rounded-[5px] border border-line-strong px-2 py-0.5 text-[12px] text-muted hover:border-action hover:text-text">
            Open in lab designer
          </Link>
          <div role="tablist" className="flex rounded-[5px] border border-line-strong p-0.5 text-[12px]">
            {(['map', 'list'] as const).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cx('rounded-[4px] px-2 py-0.5', view === v ? 'bg-pane-2 text-text' : 'text-muted')}>
                {v === 'map' ? 'Map' : 'List'}
              </button>
            ))}
          </div>
          </div>
        }
        bodyClassName="flex flex-col"
      >
        <div className="border-b border-line px-3 py-1.5">
          <MapLegend />
        </div>
        <div className="min-h-0 flex-1">
          <QueryView q={topo} rows={8}>
            {(t) =>
              view === 'map' ? (
                <TopologyMap topo={t} selectedEdge={sel.edge} onNodeClick={(n) => setSel({ node: n.id })} onEdgeClick={(e) => setSel({ edge: e })} />
              ) : (
                <table className="w-full text-[13px]">
                  <thead className="text-left text-[12px] text-muted">
                    <tr className="border-b border-line">
                      <th className="px-3 py-2 font-medium">Node</th>
                      <th className="px-3 py-2 font-medium">Role</th>
                      <th className="px-3 py-2 font-medium">Site</th>
                      <th className="px-3 py-2 font-medium">Address</th>
                      <th className="px-3 py-2 font-medium">Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.nodes.map((n) => (
                      <tr key={n.id} className={cx('cursor-pointer border-b border-line hover:bg-pane-2', sel.node === n.id && 'bg-pane-2')} onClick={() => setSel({ node: n.id })}>
                        <td className="px-3 py-1.5 font-medium">
                          <button className="hover:underline">{n.name}</button>
                        </td>
                        <td className="px-3 py-1.5 text-muted">{n.role}</td>
                        <td className="px-3 py-1.5 text-muted">{t.sites.find((s) => s.id === n.site_id)?.name}</td>
                        <td className="px-3 py-1.5 font-mono text-[12px]">{n.mgmt_ip}</td>
                        <td className="px-3 py-1.5">
                          <span className="flex items-center gap-1.5">
                            <HealthDot h={n.health} power={n.power} /> {n.power === 'stopped' ? 'off' : n.health}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </QueryView>
        </div>
      </Pane>
      <Pane className="w-[380px] shrink-0" title={sel.node ? 'Node' : sel.edge ? 'Link' : 'Inspector'}>
        {sel.node ? <NodePanel nodeId={sel.node} /> : sel.edge ? <EdgePanel edgeId={sel.edge} /> : <EmptyState title="Select a node or link" body="Every node shows live health, consoles, snapshots and the tickets touching it. Every link shows the flows crossing it, down to packets." />}
      </Pane>
    </div>
  );
}
