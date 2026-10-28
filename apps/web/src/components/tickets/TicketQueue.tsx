'use client';

import Link from 'next/link';
import { useClients, useTickets } from '@/api/hooks';
import type { TicketStatus } from '@/api/types';
import { Badge, cx, PriorityBadge, QueryView, relTime, SlaClock, StatusBadge, useNow } from '@/components/ui';

export const OPEN: TicketStatus[] = ['new', 'acknowledged', 'investigating', 'pending_verification', 'verified', 'client_explanation', 'debrief'];

export function TicketQueue({ compact }: { compact?: boolean }) {
  const q = useTickets({ status: OPEN });
  const clients = useClients();
  const now = useNow(30_000);
  return (
    <QueryView q={q} empty={(d) => (d.items.length ? false : <p className="p-6 text-center text-[13px] text-muted">Queue clear. The scheduler will send the next ticket soon.</p>)}>
      {(d) => (
        <ul className="divide-y divide-line" aria-label="Ticket queue">
          {d.items.map((t) => (
            <li key={t.id}>
              <Link href={`/tickets/${t.id}`} className={cx('block px-3 py-2 hover:bg-pane-2', t.sla_breached && 'border-l-2 border-down')} data-testid={`queue-${t.number}`}>
                <div className="flex items-center gap-2">
                  <PriorityBadge p={t.priority} />
                  <span className="text-[13px] font-semibold">{t.number}</span>
                  <StatusBadge s={t.status} />
                  {t.status === 'new' && <span className="size-1.5 rounded-full bg-action" aria-label="unclaimed" />}
                  <span className="ml-auto text-[12px]">
                    <SlaClock due={t.sla_due_at} />
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[13px]">{t.title}</p>
                {!compact && (
                  <p className="mt-0.5 flex gap-2 text-[12px] text-muted">
                    <span>{clients.data?.find((c) => c.id === t.client_id)?.name}</span>
                    <span>{t.category}</span>
                    <span>opened {relTime(t.created_at, now)}</span>
                    {t.assignee && <span>· {t.assignee}</span>}
                    {t.tags?.slice(0, 3).map((g) => <Badge key={g}>{g}</Badge>)}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </QueryView>
  );
}
