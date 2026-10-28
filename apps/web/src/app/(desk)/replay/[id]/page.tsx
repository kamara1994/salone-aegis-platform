'use client';

import { Download } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useReplay, useTicket, useTopology } from '@/api/hooks';
import type { AegisEvent } from '@/api/types';
import { ReplayPlayer, sanitize, type ReplayData } from '@/components/replay/ReplayPlayer';
import { Button, ErrorState, Loading } from '@/components/ui';

export default function ReplayPage() {
  const { id } = useParams<{ id: string }>();
  const r = useReplay(id);
  const t = useTicket(id);
  const topo = useTopology('all');
  if (r.isLoading || t.isLoading || topo.isLoading) return <Loading rows={8} />;
  const err = r.error ?? t.error ?? topo.error;
  if (err) return <ErrorState error={err} retry={() => { r.refetch(); t.refetch(); topo.refetch(); }} />;
  const data: ReplayData = { ticket: { id, number: t.data!.number, title: t.data!.title, affected_node_ids: t.data!.affected_node_ids }, frames: r.data!.frames as unknown as AegisEvent[], topology: topo.data! };
  const download = () => {
    const blob = new Blob([JSON.stringify(sanitize(data), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'showcase.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <h1 className="text-[16px] font-semibold">
          Replay {data.ticket.number} <span className="font-normal text-muted">{data.ticket.title}</span>
        </h1>
        <Button size="sm" className="ml-auto" onClick={download} title="Sanitized file for recruiter mode: put it in apps/web/public/recruiter/showcase.json">
          <Download className="size-3.5" /> Export for recruiter mode
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <ReplayPlayer data={data} />
      </div>
    </div>
  );
}
