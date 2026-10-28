'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useClients, useTickets } from '@/api/hooks';
import type { Priority, TicketStatus } from '@/api/types';
import { Badge, cx, Pane, PriorityBadge, QueryView, relTime, SlaClock, STATUS_LABEL, StatusBadge, useNow } from '@/components/ui';
import { OPEN } from '@/components/tickets/TicketQueue';

const VIEWS: { key: string; label: string; status: TicketStatus[] }[] = [
  { key: 'open', label: 'Open', status: OPEN },
  { key: 'mine', label: 'Unclaimed', status: ['new'] },
  { key: 'closed', label: 'Closed', status: ['closed'] },
  { key: 'all', label: 'All', status: [] },
];

export default function TicketsPage() {
  const [view, setView] = useState('open');
  const [prio, setPrio] = useState<Priority[]>([]);
  const [breached, setBreached] = useState(false);
  const [text, setText] = useState('');
  const v = VIEWS.find((x) => x.key === view)!;
  const q = useTickets({ status: v.status, priority: prio, sla_breached: breached ? true : undefined, limit: 200 });
  const clients = useClients();
  const now = useNow(30_000);
  const router = useRouter();
  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-3 text-[18px] font-semibold">Tickets</h1>
        <div role="tablist" className="flex rounded-[5px] border border-line-strong p-0.5">
          {VIEWS.map((x) => (
            <button key={x.key} role="tab" aria-selected={view === x.key} onClick={() => setView(x.key)} className={cx('rounded-[4px] px-2.5 py-1 text-[12.5px]', view === x.key ? 'bg-pane-2 text-text' : 'text-muted hover:text-text')}>
              {x.label}
            </button>
          ))}
        </div>
        {(['P1', 'P2', 'P3', 'P4'] as Priority[]).map((p) => (
          <button key={p} aria-pressed={prio.includes(p)} onClick={() => setPrio(prio.includes(p) ? prio.filter((x) => x !== p) : [...prio, p])} className={cx('rounded-[4px] border px-2 py-0.5 text-[12px]', prio.includes(p) ? 'border-action text-text' : 'border-line text-muted')}>
            {p}
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
          <input type="checkbox" checked={breached} onChange={(e) => setBreached(e.target.checked)} /> Past SLA only
        </label>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter by number or title" aria-label="Filter tickets" className="ml-auto h-8 w-64 rounded-[5px] border border-line-strong bg-ink px-2.5 text-[13px]" />
      </div>
      <Pane>
        <QueryView q={q} empty={(d) => (d.items.length ? false : <p className="p-6 text-center text-muted">No tickets match these filters.</p>)}>
          {(d) => (
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-pane text-left text-[12px] text-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-2 font-medium">Ticket</th>
                  <th className="px-3 py-2 font-medium">Title</th>
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">SLA</th>
                  <th className="px-3 py-2 font-medium">Opened</th>
                  <th className="px-3 py-2 font-medium">Tags</th>
                </tr>
              </thead>
              <tbody>
                {d.items
                  .filter((t) => !text || `${t.number} ${t.title}`.toLowerCase().includes(text.toLowerCase()))
                  .map((t) => (
                    <tr key={t.id} className="cursor-pointer border-b border-line hover:bg-pane-2" onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) router.push(`/tickets/${t.id}`); }}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link href={`/tickets/${t.id}`} className="flex items-center gap-2 font-semibold hover:underline">
                          <PriorityBadge p={t.priority} /> {t.number}
                        </Link>
                      </td>
                      <td className="max-w-md truncate px-3 py-2">{t.title}</td>
                      <td className="px-3 py-2 text-muted">{clients.data?.find((c) => c.id === t.client_id)?.name}</td>
                      <td className="px-3 py-2" title={STATUS_LABEL[t.status]}>
                        <StatusBadge s={t.status} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{t.status === 'closed' ? (t.sla_breached ? <Badge tone="bad">missed</Badge> : <Badge tone="good">met</Badge>) : <SlaClock due={t.sla_due_at} />}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted">{relTime(t.created_at, now)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">{t.tags?.slice(0, 3).map((g) => <Badge key={g}>{g}</Badge>)}</div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </QueryView>
      </Pane>
    </div>
  );
}
