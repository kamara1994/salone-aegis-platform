'use client';

import { useMutation } from '@tanstack/react-query';
import { Camera, History, Play, Power, RotateCw, Terminal } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useAlerts, useNode, useTickets } from '@/api/hooks';
import type { NodeActionRequest } from '@/api/types';
import { awaitJob, errorText, useApi } from '@/components/providers';
import { Badge, Button, ConfirmDialog, HealthDot, Input, PriorityBadge, QueryView, relTime } from '@/components/ui';
import { useUi } from '@/state/ui';

function Meter({ label, v }: { label: string; v?: number }) {
  return (
    <div className="text-[12px]">
      <div className="flex justify-between text-muted">
        <span>{label}</span>
        <span className="tabular-nums text-text">{v ?? 0}%</span>
      </div>
      <div className="mt-0.5 h-1 rounded bg-pane-2">
        <div className={(v ?? 0) > 85 ? 'h-1 rounded bg-down' : (v ?? 0) > 65 ? 'h-1 rounded bg-degraded' : 'h-1 rounded bg-healthy'} style={{ width: `${v ?? 0}%` }} />
      </div>
    </div>
  );
}

/** Node detail with every action the operator can take on it. */
export function NodePanel({ nodeId, ticketId }: { nodeId: string; ticketId?: string }) {
  const api = useApi();
  const q = useNode(nodeId);
  const tickets = useTickets({});
  const alerts = useAlerts();
  const openConsole = useUi((s) => s.openConsole);
  const toast = useUi((s) => s.toast);
  const [confirm, setConfirm] = useState<NodeActionRequest['action'] | null>(null);
  const [snapName, setSnapName] = useState('');
  const act = useMutation({
    mutationFn: async (body: NodeActionRequest) => {
      const job = await api.nodeAction(nodeId, body);
      return awaitJob(job.id);
    },
    onSuccess: (_r, body) => {
      toast({ tone: 'success', title: `${q.data?.name}: ${body.action} done` });
      setConfirm(null);
      setSnapName('');
    },
    onError: (e) => toast({ tone: 'danger', title: 'Action failed', body: errorText(e) }),
  });

  return (
    <QueryView q={q} rows={6}>
      {(n) => (
        <div className="space-y-4 p-3 text-[13px]">
          <div>
            <div className="flex items-center gap-2">
              <HealthDot h={n.health} power={n.power} />
              <h3 className="text-[15px] font-semibold">{n.name}</h3>
              <Badge>{n.kind.replace('_', ' ')}</Badge>
              {n.tags?.filter((t) => !t.includes(':')).map((t) => <Badge key={t} tone={t === 'crown-jewel' || t === 'tier0' ? 'warn' : 'neutral'}>{t}</Badge>)}
            </div>
            <p className="mt-0.5 text-muted">{n.role}</p>
          </div>
          <dl className="grid grid-cols-[96px_1fr] gap-y-1 text-[12.5px]">
            <dt className="text-muted">Address</dt>
            <dd className="font-mono">{n.ips?.join(', ') ?? n.mgmt_ip}</dd>
            {n.vlan && (
              <>
                <dt className="text-muted">VLAN</dt>
                <dd>{n.vlan}</dd>
              </>
            )}
            <dt className="text-muted">Power</dt>
            <dd>{n.power}</dd>
            <dt className="text-muted">Platform</dt>
            <dd className="font-mono text-[12px]">{n.platform_ref}</dd>
            {n.specs && n.specs.vcpu ? (
              <>
                <dt className="text-muted">Size</dt>
                <dd>
                  {n.specs.vcpu} vCPU · {n.specs.ram_gb} GB RAM · {n.specs.disk_gb} GB disk
                </dd>
              </>
            ) : null}
          </dl>
          {n.metrics && n.power === 'running' && (
            <div className="grid grid-cols-3 gap-3">
              <Meter label="CPU" v={n.metrics.cpu_pct} />
              <Meter label="RAM" v={n.metrics.ram_pct} />
              <Meter label="Disk" v={n.metrics.disk_pct} />
            </div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {!!n.consoles?.length && (
              <Button size="sm" variant="primary" onClick={() => openConsole(n.id, ticketId)} disabled={n.power === 'stopped'}>
                <Terminal className="size-3.5" /> Open console
              </Button>
            )}
            {n.kind !== 'cloud_resource' || n.os !== 'cloud' ? (
              <>
                {n.power === 'stopped' ? (
                  <Button size="sm" busy={act.isPending} onClick={() => act.mutate({ action: 'start' })}>
                    <Play className="size-3.5" /> Start
                  </Button>
                ) : (
                  <>
                    <Button size="sm" busy={act.isPending && act.variables?.action === 'reboot'} onClick={() => act.mutate({ action: 'reboot' })}>
                      <RotateCw className="size-3.5" /> Reboot
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setConfirm('stop')}>
                      <Power className="size-3.5" /> Stop
                    </Button>
                  </>
                )}
              </>
            ) : null}
          </div>
          {n.kind !== 'cloud_resource' && (
            <div className="space-y-1.5">
              <h4 className="text-[12.5px] font-semibold">Snapshots</h4>
              <div className="flex gap-1.5">
                <Input placeholder="Name, e.g. before-fix" value={snapName} onChange={(e) => setSnapName(e.target.value)} aria-label="Snapshot name" />
                <Button size="sm" busy={act.isPending && act.variables?.action === 'snapshot'} onClick={() => act.mutate({ action: 'snapshot', snapshot_name: snapName || undefined })}>
                  <Camera className="size-3.5" /> Take
                </Button>
              </div>
              {n.snapshots?.length ? (
                <ul className="space-y-1">
                  {n.snapshots.map((s) => (
                    <li key={s.name} className="flex items-center justify-between gap-2 text-[12.5px]">
                      <span className="font-mono">{s.name}</span>
                      <span className="text-muted">{s.taken_at ? relTime(s.taken_at) : ''}</span>
                      <Button size="sm" variant="ghost" onClick={() => { setSnapName(s.name ?? ''); setConfirm('revert'); }}>
                        <History className="size-3.5" /> Revert
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12px] text-faint">No snapshots. Take one before risky changes.</p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <h4 className="text-[12.5px] font-semibold">Open tickets on this node</h4>
            {tickets.data?.items.filter((t) => t.status !== 'closed' && t.affected_node_ids?.includes(n.id)).map((t) => (
              <Link key={t.id} href={`/tickets/${t.id}`} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-pane-2">
                <PriorityBadge p={t.priority} /> <span className="font-medium">{t.number}</span> <span className="truncate text-muted">{t.title}</span>
              </Link>
            ))}
            {!n.open_ticket_ids?.length && <p className="text-[12px] text-faint">None.</p>}
          </div>
          <div className="space-y-1.5">
            <h4 className="text-[12.5px] font-semibold">Recent alerts</h4>
            {alerts.data?.items.filter((a) => a.node_id === n.id).slice(0, 5).map((a) => (
              <Link key={a.id} href={`/soc?alert=${a.id}`} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-pane-2">
                <PriorityBadge p={a.severity} /> <span className="truncate">{a.rule}</span>
              </Link>
            ))}
            {!n.recent_alert_ids?.length && <p className="text-[12px] text-faint">None.</p>}
          </div>
          <ConfirmDialog
            open={!!confirm}
            onClose={() => setConfirm(null)}
            busy={act.isPending}
            title={confirm === 'stop' ? `Stop ${n.name}?` : `Revert ${n.name}?`}
            confirmLabel={confirm === 'stop' ? 'Stop it' : 'Revert'}
            typed={n.tags?.includes('tier0') || n.tags?.includes('crown-jewel') ? n.name : undefined}
            body={
              confirm === 'stop' ? (
                <>Everything that depends on {n.name} loses it: {(n.role ?? 'its role').toLowerCase()}. Open tickets on this node will record the action.</>
              ) : (
                <>Reverting discards every change on {n.name} since snapshot {snapName || 'the latest'}. In a real incident this can destroy evidence. The action is recorded.</>
              )
            }
            onConfirm={() => act.mutate({ action: confirm!, confirm: true, snapshot_name: confirm === 'revert' ? snapName || undefined : undefined })}
          />
        </div>
      )}
    </QueryView>
  );
}
