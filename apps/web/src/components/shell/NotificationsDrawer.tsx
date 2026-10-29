'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { useClients, useNotifications } from '@/api/hooks';
import type { Notification } from '@/api/types';
import { useApi } from '@/components/providers';
import { Badge, cx, IconButton, PriorityBadge, QueryView, relTime, useNow } from '@/components/ui';
import { useUi } from '@/state/ui';

const SOURCE: Record<Notification['source'], string> = { scenario: 'Scenario', cisa_kev: 'CISA KEV', patch_tuesday: 'Patch Tuesday', monitor: 'Monitoring', client: 'Client', vendor_advisory: 'Vendor advisory' };

export function NotificationsDrawer() {
  const { notificationsOpen, setNotifications, clientId, setClient } = useUi();
  const q = useNotifications();
  const clients = useClients();
  const api = useApi();
  const qc = useQueryClient();
  const now = useNow(30_000);
  const ack = useMutation({ mutationFn: (id: string) => api.ackNotification(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setNotifications(false);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [setNotifications]);
  if (!notificationsOpen) return null;
  const cname = (id: string) => clients.data?.find((c) => c.id === id)?.name ?? '';
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-label="Notifications">
      <button aria-label="Close notifications" className="absolute inset-0 bg-black/40" onClick={() => setNotifications(false)} />
      <aside className="absolute top-0 right-0 flex h-full w-[420px] max-w-full flex-col border-l border-line-strong bg-pane">
        <header className="flex h-12 items-center justify-between border-b border-line px-4">
          <h2 className="font-semibold">Notifications</h2>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="client-switch">
              Client
            </label>
            <select id="client-switch" value={clientId} onChange={(e) => setClient(e.target.value)} className="h-7 max-w-[150px] rounded-[5px] border border-line-strong bg-ink px-1.5 text-[12px]">
              <option value="all">All clients</option>
              {clients.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.status === 'onboarding' ? ' (onboarding)' : ''}
                </option>
              ))}
            </select>
            <button className="text-[12.5px] text-muted hover:text-text" onClick={() => q.data?.items.filter((n) => !n.read).forEach((n) => ack.mutate(n.id))}>
              Mark all read
            </button>
            <IconButton label="Close" onClick={() => setNotifications(false)}>
              <X className="size-4" />
            </IconButton>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">
          <QueryView q={q} empty={(d) => (d.items.length ? false : <p className="p-6 text-center text-muted">No notifications yet. New tickets, alerts and advisories land here.</p>)}>
            {(d) => (
              <ul>
                {d.items
                  .filter((n) => clientId === 'all' || n.client_id === clientId)
                  .map((n) => (
                    <li key={n.id} className={cx('border-b border-line px-4 py-3', !n.read && 'bg-action/5')}>
                      <div className="flex items-center gap-2 text-[12px] text-muted">
                        <PriorityBadge p={n.severity} />
                        <Badge>{SOURCE[n.source]}</Badge>
                        <span>{cname(n.client_id)}</span>
                        <span className="ml-auto">{relTime(n.created_at, now)}</span>
                      </div>
                      <p className="mt-1.5 font-medium">{n.ticket_id ? <Link href={`/tickets/${n.ticket_id}`} onClick={() => { ack.mutate(n.id); setNotifications(false); }} className="hover:underline">{n.title}</Link> : n.title}</p>
                      <p className="mt-0.5 text-[13px] text-muted">{n.body}</p>
                      {!n.read && (
                        <button className="mt-1.5 text-[12px] text-action hover:underline" onClick={() => ack.mutate(n.id)}>
                          Mark read
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            )}
          </QueryView>
        </div>
      </aside>
    </div>
  );
}
