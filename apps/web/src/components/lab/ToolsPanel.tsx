'use client';

import { labToSvg } from '@/lab/svgExport';
import { Download, Play, Plus, Trash, Upload, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Badge, Button, cx, IconButton, Input, Tabs } from '@/components/ui';
import { auditDoc, auditScore, type Finding } from '@/lab/audit';
import { billOfMaterials, CHALLENGES, checkGoals, download, inventoryCsv, prepareChallenge, reachMatrix, type GoalResult } from '@/lab/challenges';
import { runningConfig } from '@/lab/config';
import { modelOf } from '@/lab/catalog';
import { dissect, framesFor, hexDump, spanCables, toPcap } from '@/lab/pcap';
import { usePlayer } from '@/lab/player';
import { primaryIp } from '@/lab/simulate';
import { useLab } from '@/lab/store';
import type { Goal, LabDoc } from '@/lab/types';
import { deviceById } from '@/lab/validate';
import { DECISION_COLOR } from './PacketLayer';
import { WorkbooksTab } from './WorkbooksTab';

export type ToolKey = 'labs' | 'audit' | 'goals' | 'challenge' | 'matrix' | 'capture' | 'export';

const sel = 'h-8 rounded-[5px] border border-line-strong bg-ink px-2 text-[12.5px]';
const SEV_TONE = { critical: 'bad', warning: 'warn', info: 'neutral' } as const;

function selectDevices(ids: string[]) {
  const st = useLab.getState();
  const present = ids.filter((id) => st.doc && deviceById(st.doc, id));
  if (present.length) st.select({ devices: present, cables: [] });
}

function AuditTab({ doc }: { doc: LabDoc }) {
  const findings = useMemo(() => auditDoc(doc), [doc]);
  const [area, setArea] = useState<'all' | Finding['area']>('all');
  const shown = findings.filter((f) => area === 'all' || f.area === area);
  const score = auditScore(findings);
  const counts = { critical: findings.filter((f) => f.severity === 'critical').length, warning: findings.filter((f) => f.severity === 'warning').length, info: findings.filter((f) => f.severity === 'info').length };
  return (
    <div className="flex h-full min-h-0 gap-3">
      <div className="w-[170px] shrink-0 space-y-2 text-[12.5px]">
        <div className="rounded border border-line p-2" data-testid="audit-score">
          <div className={cx('text-[28px] font-semibold leading-none', score >= 85 ? 'text-healthy' : score >= 60 ? 'text-degraded' : 'text-down')}>{score}</div>
          <div className="text-muted">design score / 100</div>
          <div className="mt-1 text-[11.5px]">
            {counts.critical} critical, {counts.warning} warnings, {counts.info} notes
          </div>
        </div>
        <label className="block">
          <span className="text-muted">Area</span>
          <select className={cx(sel, 'w-full')} value={area} onChange={(e) => setArea(e.target.value as typeof area)} aria-label="Audit area">
            {['all', 'physical', 'switching', 'routing', 'addressing', 'services', 'security', 'resilience'].map((a) => (
              <option key={a} value={a}>
                {a === 'all' ? 'Everything' : a[0].toUpperCase() + a.slice(1)} ({a === 'all' ? findings.length : findings.filter((f) => f.area === a).length})
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-auto pr-1" data-testid="audit-list">
        {shown.length === 0 && <li className="text-[12.5px] text-muted">Nothing to flag here.</li>}
        {shown.map((f) => (
          <li key={f.id} className="rounded border border-line px-2 py-1.5 text-[12.5px]">
            <button className="flex w-full items-start gap-2 text-left" onClick={() => selectDevices(f.devices)}>
              <Badge tone={SEV_TONE[f.severity]}>{f.severity}</Badge>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{f.title}</span> <span className="text-faint">({f.area})</span>
                <span className="block text-muted">{f.detail}</span>
                {f.fix && <span className="block text-[11.5px]">Fix: {f.fix}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GoalsTab({ doc }: { doc: LabDoc }) {
  const st = useLab();
  const devices = [...doc.devices].sort((a, b) => a.name.localeCompare(b.name));
  const [draft, setDraft] = useState<Omit<Goal, 'id'>>({ src: '', dst: '', proto: 'icmp', expect: 'reach' });
  const [results, setResults] = useState<GoalResult[] | null>(null);
  const goals = doc.goals ?? [];
  const name = (id: string) => deviceById(doc, id)?.name ?? id;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 text-[12.5px]">
      <p className="text-muted">Write down what the network must allow and deny, then check the design against it (Packet Tracer activity grading).</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <select className={sel} aria-label="Goal source" value={draft.src} onChange={(e) => setDraft({ ...draft, src: e.target.value })}>
          <option value="">From…</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select className={cx(sel, 'w-[130px]')} aria-label="Goal expectation" value={draft.expect} onChange={(e) => setDraft({ ...draft, expect: e.target.value as Goal['expect'] })}>
          <option value="reach">must reach</option>
          <option value="blocked">must be blocked from</option>
        </select>
        <select className={sel} aria-label="Goal destination" value={draft.dst} onChange={(e) => setDraft({ ...draft, dst: e.target.value })}>
          <option value="">To…</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select className={sel} aria-label="Goal protocol" value={draft.proto === 'icmp' ? 'icmp' : `${draft.proto}:${draft.port}`} onChange={(e) => {
          const [p, port] = e.target.value.split(':');
          setDraft({ ...draft, proto: p as Goal['proto'], port: port ? Number(port) : undefined });
        }}>
          <option value="icmp">ping</option>
          {[['tcp', 443], ['tcp', 445], ['tcp', 22], ['tcp', 3389], ['tcp', 5432], ['udp', 53], ['tcp', 80], ['tcp', 389]].map(([p, n]) => (
            <option key={`${p}:${n}`} value={`${p}:${n}`}>
              {String(p).toUpperCase()} {n}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={!draft.src || !draft.dst} onClick={() => (st.addGoal(draft), setResults(null))} data-testid="goal-add">
          <Plus className="size-3.5" /> Add goal
        </Button>
        <Button size="sm" variant="primary" disabled={!goals.length} onClick={() => {
          const r = checkGoals(useLab.getState().doc!);
          setResults(r);
          st.addTrace(r.flatMap((x) => (x.trace ? [x.trace] : [])));
        }} data-testid="goal-check">
          <Play className="size-3.5" /> Check results
        </Button>
        {results && (
          <span className={cx('font-medium', results.every((r) => r.pass) ? 'text-healthy' : 'text-down')} data-testid="goal-score">
            {results.filter((r) => r.pass).length}/{results.length} goals met
          </span>
        )}
      </div>
      <ul className="min-h-0 flex-1 space-y-1 overflow-auto" data-testid="goal-list">
        {!goals.length && <li className="text-muted">No goals yet.</li>}
        {goals.map((g) => {
          const r = results?.find((x) => x.goal.id === g.id);
          return (
            <li key={g.id} className={cx('flex items-start gap-2 rounded border px-2 py-1', r ? (r.pass ? 'border-healthy/40 bg-healthy/5' : 'border-down/40 bg-down/5') : 'border-line')}>
              <span className="min-w-0 flex-1">
                <span className="font-medium">
                  {name(g.src)} {g.expect === 'reach' ? 'reaches' : 'is blocked from'} {name(g.dst)} {g.proto === 'icmp' ? '(ping)' : `(${g.proto.toUpperCase()} ${g.port})`}
                </span>
                {r && (
                  <span className="block text-muted">
                    {r.pass ? 'Pass' : 'Fail'}: {r.reason}
                  </span>
                )}
              </span>
              <IconButton label="Remove goal" onClick={() => st.removeGoal(g.id)}>
                <Trash className="size-3.5" />
              </IconButton>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChallengeTab({ doc }: { doc: LabDoc }) {
  const st = useLab();
  const [pick, setPick] = useState('random');
  const [msg, setMsg] = useState('');
  const ch = doc.challenge;
  return (
    <div className="space-y-2 text-[12.5px]">
      <p className="text-muted">Troubleshooting practice: one realistic fault is hidden in the design. Find it with the Design CLI, simulation, capture and the audit, fix it, then reveal what was changed.</p>
      {!ch ? (
        <div className="flex flex-wrap items-center gap-2">
          <select className={sel} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Challenge">
            <option value="random">Surprise me</option>
            {CHALLENGES.map((c) => (
              <option key={c.id} value={c.id}>
                [{c.level}] {c.title}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="primary"
            data-testid="challenge-start"
            onClick={() => {
              const p = prepareChallenge(useLab.getState().doc!, pick === 'random' ? undefined : pick);
              if (!p) return setMsg('This design has nothing that fault can break. Try another, or add hosts behind a switch.');
              setMsg('');
              st.startChallenge({ title: p.def.title, brief: p.brief, fault: p.fault }, p.apply);
            }}
          >
            Start challenge
          </Button>
          {msg && <span className="text-down">{msg}</span>}
        </div>
      ) : (
        <div className="space-y-2 rounded border border-line p-2" data-testid="challenge-active">
          <p className="font-semibold">Ticket: {ch.title}</p>
          <p>{ch.brief}</p>
          {ch.revealed ? <p className="rounded bg-degraded/10 p-2" data-testid="challenge-fault">What was changed: {ch.fault}</p> : <p className="text-muted">Started {new Date(ch.startedAt).toLocaleTimeString()}. Undo is still available, but try to find it first.</p>}
          <div className="flex gap-2">
            {!ch.revealed && (
              <Button size="sm" onClick={st.revealChallenge} data-testid="challenge-reveal">
                Reveal the fault
              </Button>
            )}
            <Button size="sm" onClick={st.endChallenge}>
              End challenge
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MatrixTab({ doc }: { doc: LabDoc }) {
  const hosts = doc.devices.filter((d) => modelOf(d).forwarding === 'host' && primaryIp(d)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 14);
  const [m, setM] = useState<ReturnType<typeof reachMatrix> | null>(null);
  const [tip, setTip] = useState('');
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 text-[12.5px]">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="primary" onClick={() => setM(reachMatrix(useLab.getState().doc!, hosts.map((h) => h.id)))} data-testid="matrix-run">
          <Play className="size-3.5" /> Ping every pair ({hosts.length} hosts)
        </Button>
        <span className="truncate text-muted">{tip || 'Rows ping columns. Hover a cell for the reason.'}</span>
      </div>
      {m && (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="border-collapse text-[11px]" data-testid="matrix">
            <thead>
              <tr>
                <th />
                {hosts.map((h) => (
                  <th key={h.id} className="h-20 align-bottom">
                    <span className="inline-block origin-bottom-left -rotate-45 whitespace-nowrap pl-2 font-normal text-muted">{h.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hosts.map((a) => (
                <tr key={a.id}>
                  <th className="pr-2 text-right font-normal text-muted">{a.name}</th>
                  {hosts.map((b) => {
                    const c = m[a.id]?.[b.id];
                    return (
                      <td key={b.id} className="p-0.5">
                        {a.id === b.id ? (
                          <span className="block size-5 rounded bg-pane-2" />
                        ) : (
                          <button aria-label={`${a.name} to ${b.name}: ${c?.status}`} onMouseEnter={() => setTip(`${a.name} → ${b.name}: ${c?.reason}`)} onFocus={() => setTip(`${a.name} → ${b.name}: ${c?.reason}`)} className={cx('block size-5 rounded', c?.ok ? 'bg-healthy/70' : c?.status === 'blocked' ? 'bg-down/70' : 'bg-faint/40')} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-muted">Green: reply. Red: blocked by a rule. Grey: dropped (no route, ARP failure, link down).</p>
        </div>
      )}
    </div>
  );
}

function CaptureTab({ doc }: { doc: LabDoc }) {
  const st = useLab();
  const player = usePlayer();
  const selCable = st.selection.cables.length === 1 ? st.selection.cables[0] : '';
  const [cable, setCable] = useState<string>('all');
  const [filter, setFilter] = useState('');
  const [pick, setPick] = useState<number | null>(null);
  const spans = doc.devices.flatMap((d) => (d.span ?? []).filter((x) => x.sources.length).map((x) => ({ key: `span:${d.id}:${x.session}`, label: `SPAN ${d.name} session ${x.session}: ${x.sources.join(', ')} → ${x.dest || 'no destination'}`, cables: spanCables(doc, d.id, x.session) })));
  const target = cable === 'selected' ? selCable : cable === 'all' ? undefined : cable.startsWith('span:') ? spans.find((x) => x.key === cable)?.cables ?? [] : cable;
  const frames = useMemo(() => framesFor(doc, st.traces, target), [doc, st.traces, target]);
  const shown = frames.filter((f) => !filter || `${f.protocol} ${f.src} ${f.dst} ${f.info}`.toLowerCase().includes(filter.toLowerCase()));
  const f = shown.find((x) => x.no === pick);
  const label = (id: string) => {
    const c = doc.cables.find((x) => x.id === id);
    return c ? `${deviceById(doc, c.a.device)?.name} ${c.a.port} ↔ ${deviceById(doc, c.b.device)?.name} ${c.b.port}` : id;
  };
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-2">
        <select className={cx(sel, 'max-w-[300px]')} value={cable} onChange={(e) => setCable(e.target.value)} aria-label="Capture point">
          <option value="all">Every link</option>
          {spans.map((x) => (
            <option key={x.key} value={x.key}>
              {x.label}
            </option>
          ))}
          {selCable && <option value="selected">Selected cable: {label(selCable)}</option>}
          {doc.cables.map((c) => (
            <option key={c.id} value={c.id}>
              {label(c.id)}
            </option>
          ))}
        </select>
        <Input placeholder="Filter: icmp, arp, 10.10.20.52…" value={filter} onChange={(e) => setFilter(e.target.value)} className="!h-8 !w-56" aria-label="Display filter" />
        <Button size="sm" disabled={!shown.length} onClick={() => download(`aegis-lab-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pcap`, toPcap(shown), 'application/vnd.tcpdump.pcap')} data-testid="pcap-download">
          <Download className="size-3.5" /> Download .pcap
        </Button>
        <span className="text-muted">{shown.length} frames from {st.traces.length} simulated packets. Send traffic with Simulation, ping or the CLI.</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[1.4fr_1fr] gap-2 max-lg:grid-cols-1">
        <div className="min-h-0 overflow-auto rounded border border-line">
          <table className="w-full font-mono text-[11px]" data-testid="capture-table">
            <thead className="sticky top-0 bg-pane-2 text-left text-muted">
              <tr>
                {['No.', 'Time', 'Source', 'Destination', 'Proto', 'Len', 'Info'].map((h) => (
                  <th key={h} className="px-1.5 py-1 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((x) => (
                <tr key={x.no} onClick={() => (setPick(x.no), player.load(x.traceId), usePlayer.setState({ step: x.hop, progress: 1, playing: false }))} className={cx('cursor-pointer border-t border-line/60', pick === x.no ? 'bg-action/15' : 'hover:bg-pane-2')} style={{ boxShadow: `inset 3px 0 0 ${DECISION_COLOR[x.decision]}` }}>
                  <td className="px-1.5">{x.no}</td>
                  <td className="px-1.5">{x.time.toFixed(4)}</td>
                  <td className="px-1.5">{x.src}</td>
                  <td className="px-1.5">{x.dst}</td>
                  <td className="px-1.5">{x.protocol}</td>
                  <td className="px-1.5">{x.length}</td>
                  <td className="truncate px-1.5">{x.info}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="min-h-0 overflow-auto rounded border border-line p-2 text-[11.5px]" data-testid="capture-detail">
          {f ? (
            <>
              {dissect(f).map((l) => (
                <details key={l.layer} open className="mb-1">
                  <summary className="cursor-pointer font-medium">{l.layer}</summary>
                  <dl className="ml-3">
                    {l.fields.map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="w-32 shrink-0 text-muted">{k}</dt>
                        <dd className="font-mono">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ))}
              <pre className="mt-2 whitespace-pre font-mono text-[10.5px] text-muted">{hexDump(f.bytes)}</pre>
            </>
          ) : (
            <p className="text-muted">Pick a frame to decode it layer by layer.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ExportTab({ doc }: { doc: LabDoc }) {
  const st = useLab();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const bom = billOfMaterials(doc);
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid h-full min-h-0 grid-cols-[260px_1fr] gap-3 text-[12.5px] max-md:grid-cols-1">
      <div className="space-y-2">
        <Button size="sm" className="w-full" onClick={() => download(`aegis-lab-${stamp}.json`, JSON.stringify(doc, null, 2), 'application/json')} data-testid="export-json">
          <Download className="size-3.5" /> Lab file (.json)
        </Button>
        <Button size="sm" className="w-full" onClick={() => download(`aegis-inventory-${stamp}.csv`, inventoryCsv(doc), 'text/csv')} data-testid="export-csv">
          <Download className="size-3.5" /> Port inventory (.csv)
        </Button>
        <Button size="sm" className="w-full" onClick={() => download(`aegis-configs-${stamp}.txt`, doc.devices.filter((d) => ['router', 'switch', 'firewall'].includes(d.kind)).map((d) => `! ===== ${d.name} =====\n${runningConfig(d)}`).join('\n\n'), 'text/plain')}>
          <Download className="size-3.5" /> All running configs (.txt)
        </Button>
        <Button size="sm" className="w-full" onClick={() => download(`aegis-diagram-${stamp}.svg`, labToSvg(doc, st.layoutName ?? 'Lab diagram'), 'image/svg+xml')} data-testid="export-svg">
          <Download className="size-3.5" /> Diagram (.svg)
        </Button>
        <Button size="sm" className="w-full" onClick={() => file.current?.click()} data-testid="import-json">
          <Upload className="size-3.5" /> Import lab file
        </Button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Lab file to import"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const parsed = JSON.parse(await f.text()) as LabDoc;
              if (parsed.version !== 1 || !Array.isArray(parsed.devices) || !Array.isArray(parsed.cables)) throw new Error('not an AEGIS lab file (version 1)');
              st.importDoc(parsed);
              setMsg(`Imported ${parsed.devices.length} devices and ${parsed.cables.length} cables. Undo with Ctrl+Z.`);
            } catch (err) {
              setMsg(`Could not import: ${(err as Error).message}`);
            }
            e.target.value = '';
          }}
        />
        {msg && <p className={msg.startsWith('Could') ? 'text-down' : 'text-healthy'}>{msg}</p>}
      </div>
      <div className="min-h-0 overflow-auto">
        <h4 className="mb-1 font-semibold">Bill of materials (devices and cables added in this design)</h4>
        {bom.length ? (
          <table className="w-full text-[12px]" data-testid="bom">
            <tbody>
              {bom.map((b) => (
                <tr key={b.item} className="border-b border-line">
                  <td className="w-10 py-1 font-mono">{b.qty}×</td>
                  <td className="py-1">{b.item}</td>
                  <td className="py-1 text-muted">{b.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-muted">Add devices from the library to build a bill of materials.</p>
        )}
      </div>
    </div>
  );
}

export function ToolsPanel({ tab, setTab, onClose }: { tab: ToolKey; setTab: (t: ToolKey) => void; onClose: () => void }) {
  const doc = useLab((s) => s.doc)!;
  return (
    <section className="flex h-full min-h-0 flex-col border-t border-line bg-pane" aria-label="Engineering tools" data-testid="tools-panel">
      <header className="flex items-center gap-2 border-b border-line px-3 py-1">
        <h2 className="mr-2 text-[13px] font-semibold">Tools</h2>
        <Tabs<ToolKey>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'labs', label: doc.workbook ? 'Lab •' : 'Labs' },
            { key: 'audit', label: 'Audit' },
            { key: 'goals', label: 'Goals' },
            { key: 'challenge', label: doc.challenge && !doc.challenge.revealed ? 'Challenge •' : 'Challenge' },
            { key: 'matrix', label: 'Reachability' },
            { key: 'capture', label: 'Capture' },
            { key: 'export', label: 'Export' },
          ]}
        />
        <span className="flex-1" />
        <IconButton label="Close tools" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {tab === 'labs' && <WorkbooksTab doc={doc} />}
        {tab === 'audit' && <AuditTab doc={doc} />}
        {tab === 'goals' && <GoalsTab doc={doc} />}
        {tab === 'challenge' && <ChallengeTab doc={doc} />}
        {tab === 'matrix' && <MatrixTab doc={doc} />}
        {tab === 'capture' && <CaptureTab doc={doc} />}
        {tab === 'export' && <ExportTab doc={doc} />}
      </div>
    </section>
  );
}
