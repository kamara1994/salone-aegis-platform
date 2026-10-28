'use client';

import Link from 'next/link';
import { useTickets } from '@/api/hooks';
import { Badge, Pane, PriorityBadge, QueryView, relTime, StatusBadge, useNow } from '@/components/ui';

export default function ReplayIndex() {
  const q = useTickets({ limit: 200 });
  const now = useNow(60_000);
  return (
    <div className="space-y-3 p-4">
      <div>
        <h1 className="text-[18px] font-semibold">Replay</h1>
        <p className="text-[13px] text-muted">Step through any incident: the map, status, chat, commands and checks as they were at each moment. Use it to review your own mistakes, or to show someone how you solved it.</p>
      </div>
      <Pane>
        <QueryView q={q}>
          {(d) => (
            <ul className="divide-y divide-line">
              {d.items.map((t) => (
                <li key={t.id}>
                  <Link href={`/replay/${t.id}`} className="flex items-center gap-3 px-3 py-2 text-[13px] hover:bg-pane-2">
                    <PriorityBadge p={t.priority} />
                    <span className="w-20 font-semibold">{t.number}</span>
                    <span className="min-w-0 flex-1 truncate">{t.title}</span>
                    <StatusBadge s={t.status} />
                    {t.tags?.slice(0, 2).map((g) => <Badge key={g}>{g}</Badge>)}
                    <span className="w-24 text-right text-muted">{relTime(t.created_at, now)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Pane>
    </div>
  );
}
