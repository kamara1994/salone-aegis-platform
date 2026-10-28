'use client';

import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { AegisEvent, ChatMessage, Topology } from '@/api/types';
import { TopologyMap } from '@/components/map/TopologyMap';
import { Badge, Button, cx, EmptyState, Pane, STATUS_LABEL } from '@/components/ui';

export interface ReplayData {
  ticket: { id: string; number: string; title: string; affected_node_ids?: string[] };
  frames: AegisEvent[];
  topology: Topology;
}

function describe(e: AegisEvent): string {
  const d = e.data as Record<string, unknown>;
  switch (e.type) {
    case 'ticket.status_changed':
      return `Status: ${STATUS_LABEL[d.from as keyof typeof STATUS_LABEL] ?? d.from ?? 'created'} → ${STATUS_LABEL[d.to as keyof typeof STATUS_LABEL] ?? d.to}`;
    case 'chat.message':
      return `${d.author === 'operator' ? 'You' : d.author === 'system' ? 'System' : 'Client'}: ${String(d.body).slice(0, 90)}`;
    case 'check.result':
      return d.passed === null ? `Check running: ${String(d.label ?? d.check_id)}` : `Check ${d.passed ? 'passed' : 'failed'}: ${String(d.label ?? d.check_id)}`;
    case 'node.health_changed':
      return `Node health → ${String(d.health)}`;
    case 'debrief.started':
      return 'Debrief started';
    case 'debrief.question':
      return `Interviewer: ${String(d.text).slice(0, 90)}`;
    case 'debrief.scored':
      return d.final ? `Debrief scored ${String(d.overall_score)}` : `Answer scored ${String(d.score)}`;
    case 'ticket.updated':
      return d.command ? `${String(d.node)}> ${String(d.command)}` : 'Ticket updated';
    case 'scenario.state_changed':
      return `Scenario ${String(d.state)}`;
    case 'alert.fired':
    case 'alert.updated':
      return `Alert: ${String(d.rule)} (${String(d.state)})`;
    default:
      return e.type;
  }
}

/** Rebuilds map, status, chat and commands as they were at any moment of an incident. */
export function ReplayPlayer({ data }: { data: ReplayData }) {
  const frames = useMemo(() => data.frames.filter((f) => f.type !== 'flow.batch' && f.type !== 'chat.typing'), [data.frames]);
  const flowFrames = useMemo(() => data.frames.filter((f) => f.type === 'flow.batch'), [data.frames]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setI((x) => (x >= frames.length - 1 ? (setPlaying(false), x) : x + 1)), 900 / speed);
    return () => clearInterval(t);
  }, [playing, speed, frames.length]);
  if (!frames.length) return <EmptyState title="Nothing recorded for this ticket" />;
  const cur = frames[Math.min(i, frames.length - 1)];
  const t = Date.parse(cur.occurred_at);
  const upto = frames.slice(0, i + 1);
  const status = [...upto].reverse().find((f) => f.type === 'ticket.status_changed')?.data.to as keyof typeof STATUS_LABEL | undefined;
  const chat = upto.filter((f) => f.type === 'chat.message').map((f) => f.data as unknown as ChatMessage);
  const commands = upto.filter((f) => f.type === 'ticket.updated' && (f.data as Record<string, unknown>).command);
  const affected = new Set(data.ticket.affected_node_ids ?? []);
  const healthAt: Record<string, string> = {};
  for (const f of upto) if (f.type === 'node.health_changed') healthAt[f.subject.id] = String((f.data as Record<string, unknown>).health);
  const topo: Topology = {
    ...data.topology,
    nodes: data.topology.nodes.map((n) => ({ ...n, health: (healthAt[n.id] ?? (affected.has(n.id) && status && status !== 'closed' && status !== 'verified' ? 'degraded' : 'healthy')) as Topology['nodes'][number]['health'], power: 'running' })),
  };
  const fb = [...flowFrames].reverse().find((f) => Date.parse(f.occurred_at) <= t);
  const flows: Record<string, { bytes_per_s: number; allowed: number; denied: number; top_app?: string }> = {};
  for (const e of ((fb?.data as { edges?: { edge_id: string; bytes_per_s: number; allowed: number; denied: number; top_app?: string }[] })?.edges ?? [])) flows[e.edge_id] = e;
  const start = Date.parse(frames[0].occurred_at);
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 rounded-[6px] border border-line bg-pane px-3 py-2">
        <Button size="sm" variant="ghost" aria-label="Previous event" onClick={() => setI(Math.max(0, i - 1))}>
          <SkipBack className="size-4" />
        </Button>
        <Button size="sm" variant="primary" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { if (i >= frames.length - 1) setI(0); setPlaying(!playing); }}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Button size="sm" variant="ghost" aria-label="Next event" onClick={() => setI(Math.min(frames.length - 1, i + 1))}>
          <SkipForward className="size-4" />
        </Button>
        <select aria-label="Playback speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="h-7 rounded border border-line-strong bg-ink px-1 text-[12px]">
          {[1, 4, 16].map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
        <input type="range" min={0} max={frames.length - 1} value={i} onChange={(e) => setI(Number(e.target.value))} className="mx-2 min-w-40 flex-1 accent-[var(--action)]" aria-label="Timeline" />
        <span className="font-mono text-[12px] text-muted tabular-nums">
          +{Math.round((t - start) / 60000)} min · {new Date(t).toLocaleString()}
        </span>
        {status && <Badge tone="info">{STATUS_LABEL[status]}</Badge>}
      </div>
      <div className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[1fr_380px]">
        <Pane title="Map at this moment" bodyClassName="h-full">
          <div className="h-full min-h-72">
            <TopologyMap topo={topo} compact highlight={[...affected]} flowsOverride={flows} />
          </div>
        </Pane>
        <div className="flex min-h-0 flex-col gap-2">
          <Pane title="Events" className="min-h-0 flex-1">
            <ol className="text-[12.5px]">
              {frames.map((f, k) => (
                <li key={k}>
                  <button onClick={() => setI(k)} className={cx('block w-full px-3 py-1 text-left', k === i ? 'bg-action/15 text-text' : k < i ? 'text-text' : 'text-faint')}>
                    <span className="font-mono text-[11px] text-muted">{new Date(f.occurred_at).toLocaleTimeString()}</span> {describe(f)}
                  </button>
                </li>
              ))}
            </ol>
          </Pane>
          <Pane title={`Chat (${chat.length})`} className="h-56 shrink-0">
            <ul className="space-y-1.5 p-3 text-[12.5px]">
              {chat.map((m, k) => (
                <li key={k}>
                  <span className="text-muted">{m.author === 'operator' ? 'You' : m.author === 'system' ? 'System' : 'Client'}:</span> {m.body}
                </li>
              ))}
            </ul>
          </Pane>
          {commands.length > 0 && (
            <Pane title={`Commands (${commands.length})`} className="h-40 shrink-0">
              <pre className="p-3 font-mono text-[11.5px] text-muted">{commands.map((c) => `${String((c.data as Record<string, unknown>).node)}> ${String((c.data as Record<string, unknown>).command)}`).join('\n')}</pre>
            </Pane>
          )}
        </div>
      </div>
    </div>
  );
}

/** Strip anything that should not leave the lab before sharing a replay publicly. */
export function sanitize(data: ReplayData): ReplayData {
  const scrub = (s: string) => s.replace(/password\s*[=:]\s*\S+/gi, 'password=[removed]').replace(/token=\S+/gi, 'token=[removed]');
  return {
    ...data,
    frames: data.frames.map((f) => ({ ...f, data: JSON.parse(scrub(JSON.stringify(f.data))) })),
  };
}
