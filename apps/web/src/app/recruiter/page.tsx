'use client';

import { useEffect, useState } from 'react';
import { getRuntime } from '@/api/runtime';
import type { AegisEvent, Scorecards } from '@/api/types';
import { ReplayPlayer, sanitize, type ReplayData } from '@/components/replay/ReplayPlayer';
import { Badge, Loading } from '@/components/ui';

/**
 * Recruiter mode: a read-only, sanitized replay with no connection to the live platform.
 * Production: export a replay (Replay > Export for recruiter mode) to public/recruiter/showcase.json
 * and build with AEGIS_RECRUITER_EXPORT=1. In the simulated lab it falls back to the latest closed ticket.
 */
export default function RecruiterPage() {
  const [data, setData] = useState<ReplayData | null>(null);
  const [cards, setCards] = useState<Scorecards | null>(null);
  const [source, setSource] = useState<'file' | 'demo' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const r = await fetch('/recruiter/showcase.json').catch(() => null);
      if (r?.ok) {
        setData((await r.json()) as ReplayData);
        setSource('file');
        return;
      }
      const rt = await getRuntime();
      if (!rt.mock) {
        setErr('No showcase has been exported yet.');
        return;
      }
      const page = await rt.api.listTickets({ status: ['closed'], limit: 20 });
      const t = page.items.find((x) => x.number.startsWith('SM-')) ?? page.items[0];
      if (!t) {
        setErr('No closed tickets yet.');
        return;
      }
      const [rep, topo, sc] = await Promise.all([rt.api.getReplay(t.id), rt.api.getTopology(), rt.api.getScorecards()]);
      setData(sanitize({ ticket: { id: t.id, number: t.number, title: t.title, affected_node_ids: t.affected_node_ids }, frames: rep.frames as unknown as AegisEvent[], topology: topo }));
      setCards(sc);
      setSource('demo');
    })().catch((e) => setErr(String(e)));
  }, []);
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-8">
      <header className="max-w-3xl space-y-3">
        <p className="text-[13px] text-muted">SALONE AEGIS · read-only showcase</p>
        <h1 className="text-[30px] leading-tight font-semibold text-balance">A simulated bank, run like a real one: tickets, outages and attacks, fixed and then defended in a debrief.</h1>
        <p className="text-[15px] text-muted">Below is a sanitized replay of one incident from the lab. Step through it to see the map, the client conversation, the commands and the automatic checks as they happened. No live systems are reachable from this page.</p>
        {source === 'demo' && <Badge tone="warn">Simulated-lab data</Badge>}
      </header>
      {cards && (
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Measured results">
          {[
            ['Tickets closed and verified', String(cards.operator.tickets_closed)],
            ['SLA met', `${cards.operator.sla_met_pct}%`],
            ['Mean time to resolve', `${cards.operator.mttr_minutes} min`],
            ['Controls passing', `${cards.control.pass_pct}%`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-[6px] border border-line bg-pane p-3">
              <p className="text-[12.5px] text-muted">{k}</p>
              <p className="mt-1 text-[24px] font-semibold tabular-nums">{v}</p>
            </div>
          ))}
        </section>
      )}
      <section className="h-[720px]">{err ? <p className="text-muted">{err}</p> : data ? <ReplayPlayer data={data} /> : <Loading rows={6} />}</section>
    </main>
  );
}
