'use client';

import { ArrowLeft, CheckCircle2, FlaskConical, Lightbulb, Mail, MessageSquare, Phone, RotateCcw, Siren, User, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, cx, Pane, Textarea } from '@/components/ui';
import { allGames } from '@/content';
import { loadProgress, updateProgress, type GameResult } from '@/content/progress';
import { IMPACT, MAX, scoreCase, URGENCY, type Category, type PlayState } from '@/content/scoring';
import type { GameCase, GameTemplate } from '@/content/types';

const CHANNEL = { phone: Phone, 'walk-up': User, chat: MessageSquare, email: Mail, alert: Siren } as const;
const LABEL: Record<Category, string> = { urgency: 'Urgency', impact: 'Impact', questions: 'Questions asked', evidence: 'Evidence gathered', diagnosis: 'Diagnosis', fix: 'Fix', escalation: 'Escalation', documentation: 'Documentation', communication: 'Communication', time: 'Time' };
const TOOL_LABEL: Record<GameCase['evidence'][number]['tool'], string> = { terminal: 'Terminal', logs: 'Logs', 'ticket-history': 'Ticket history', 'device-panel': 'Device panel', packet: 'Packet capture', siem: 'SIEM', email: 'Mail gateway', console: 'Console' };

/** Types text out, unless the viewer prefers reduced motion. Click to finish instantly. */
function Typed({ text, onDone }: { text: string; onDone?: () => void }) {
  const [n, setN] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || navigator.webdriver) {
      setN(text.length);
      done.current?.();
      return;
    }
    setN(0);
    const id = setInterval(() => {
      setN((x) => {
        if (x + 2 >= text.length) {
          clearInterval(id);
          done.current?.();
          return text.length;
        }
        return x + 2;
      });
    }, 18);
    return () => clearInterval(id);
  }, [text]);
  return (
    <span onClick={() => setN(text.length)} aria-label={text}>
      <span aria-hidden>{text.slice(0, n)}</span>
      {n < text.length && <span aria-hidden className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-muted align-middle" />}
    </span>
  );
}

const fresh = (): PlayState => ({ asked: [], opened: [], note: '', hintsUsed: 0, elapsedMs: 0 });

function Pick<T extends string>({ label, options, value, onPick, testid }: { label: string; options: readonly T[]; value?: T; onPick: (v: T) => void; testid: string }) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-[12px] text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o} role="radio" aria-checked={value === o} className={cx('rounded-[5px] border px-2.5 py-1 text-[13px] capitalize', value === o ? 'border-action bg-action/15 text-text' : 'border-line hover:border-line-strong')} onClick={() => onPick(o)} data-testid={`${testid}-${o.replace(/\W+/g, '-').toLowerCase()}`}>
            {o}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function CasePlay({ tpl, c, onExit }: { tpl: GameTemplate; c: GameCase; onExit: () => void }) {
  const [s, setS] = useState<PlayState>(fresh);
  const [started] = useState(() => Date.now());
  const [typed, setTyped] = useState(false);
  const [tool, setTool] = useState<string | null>(null);
  const [result, setResult] = useState<ReturnType<typeof scoreCase> | null>(null);
  const set = (p: Partial<PlayState>) => setS((x) => ({ ...x, ...p }));
  const Icon = CHANNEL[c.channel];
  const triaged = !!s.urgency && !!s.impact;
  const ready = triaged && !!s.diagnosis && !!s.fix && !!s.escalation && s.note.trim().length > 10;
  const openEv = c.evidence.find((e) => e.id === tool);

  const submit = () => {
    const r = scoreCase(c, { ...s, elapsedMs: Date.now() - started });
    setResult(r);
    updateProgress((p) => {
      const g: GameResult = { template: tpl.id, caseId: c.id, score: r.score, max: r.max, at: new Date().toISOString(), breakdown: { ...r.breakdown, hintPenalty: -r.hintPenalty } };
      p.games = [...p.games, g].slice(-200);
    });
  };

  if (result) {
    const right = (ok: boolean | undefined) => (ok ? <CheckCircle2 className="size-4 shrink-0 text-healthy" /> : <XCircle className="size-4 shrink-0 text-down" />);
    const dx = c.diagnoses.find((d) => d.id === s.diagnosis);
    const fx = c.fixes.find((f) => f.id === s.fix);
    return (
      <div className="space-y-3" data-testid="game-result">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-[20px] font-semibold">
            Score <span data-testid="game-score">{result.score}</span>/100
          </h2>
          {result.hintPenalty > 0 && <span className="text-[12.5px] text-muted">({result.hintPenalty} points for hints)</span>}
        </div>
        <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {(Object.keys(MAX) as Category[]).map((k) => (
            <div key={k} className="flex items-center gap-2 text-[13px]" data-testid={`score-${k}`}>
              <span className="w-36">{LABEL[k]}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded bg-pane-2">
                <span className={cx('block h-full', result.breakdown[k] === MAX[k] ? 'bg-healthy' : result.breakdown[k] ? 'bg-degraded' : 'bg-down')} style={{ width: `${(result.breakdown[k] / MAX[k]) * 100}%` }} />
              </span>
              <span className="w-12 text-right tabular-nums">
                {result.breakdown[k]}/{MAX[k]}
              </span>
            </div>
          ))}
        </div>
        <ul className="space-y-2 text-[13.5px]">
          <li className="flex gap-2">
            {right(s.urgency === c.urgency && s.impact === c.impact)}
            <span>
              <b>Triage:</b> expected {c.urgency} urgency, {c.impact} impact. {c.triageWhy}
            </span>
          </li>
          <li className="flex gap-2">
            {right(dx?.correct)}
            <span>
              <b>Diagnosis:</b> {dx?.text}. {dx?.why} {!dx?.correct && <>The answer: {c.diagnoses.find((d) => d.correct)?.text}.</>}
            </span>
          </li>
          <li className="flex gap-2">
            {right(fx?.correct)}
            <span>
              <b>Fix:</b> {fx?.text}. {fx?.why} {!fx?.correct && <>Better: {c.fixes.find((f) => f.correct)?.text}.</>}
            </span>
          </li>
          <li className="flex gap-2">
            {right(s.escalation === c.escalation.correct)}
            <span>
              <b>Escalation:</b> you chose {s.escalation === 'none' ? 'not to escalate' : s.escalation}; expected {c.escalation.correct === 'none' ? 'no escalation' : c.escalation.correct}. {c.escalation.why}
            </span>
          </li>
          <li className="flex gap-2">
            {right(result.missedKeywords.length === 0)}
            <span>
              <b>Resolution note:</b> {result.missedKeywords.length ? <>a strong note would also mention: {result.missedKeywords.join(', ')}.</> : 'covers the key facts.'}
            </span>
          </li>
          {c.questions.some((q) => q.useful && !s.asked.includes(q.id)) && (
            <li className="text-muted">
              Questions you skipped that would have helped:{' '}
              {c.questions
                .filter((q) => q.useful && !s.asked.includes(q.id))
                .map((q) => `“${q.ask}”`)
                .join(' ')}
            </li>
          )}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onExit}>
            <ArrowLeft className="size-4" /> Back to queue
          </Button>
          <Button
            onClick={() => {
              setResult(null);
              setS(fresh());
            }}
          >
            <RotateCcw className="size-4" /> Try again
          </Button>
          {c.lab && (
            <Link href={c.lab.workbook ? `/lab?workbook=${c.lab.workbook}` : `/lab?challenge=${c.lab.challenge}`} className="inline-flex h-9 items-center gap-1.5 rounded-[5px] border border-action px-3 text-[13px] text-action" data-testid="game-open-lab">
              <FlaskConical className="size-4" /> Practise this in the Lab
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid={`case-${c.id}`}>
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-pane-2 text-[14px] font-semibold" aria-hidden>
          {c.caller.avatar}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <b>{c.caller.name}</b>
            <span className="text-muted">{c.caller.role}</span>
            <Badge>
              <Icon className="size-3" /> {c.channel}
            </Badge>
            <Badge tone={c.caller.mood === 'calm' ? 'neutral' : 'warn'}>{c.caller.mood}</Badge>
          </div>
          <p className="mt-1 rounded-[6px] border border-line bg-pane-2 px-3 py-2 text-[14.5px]" data-testid="case-opening">
            <Typed text={c.opening} onDone={() => setTyped(true)} />
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onExit}>
          <ArrowLeft className="size-4" /> Queue
        </Button>
      </div>

      <section className={cx('space-y-2 rounded-[6px] border border-line p-3', !typed && 'opacity-60')}>
        <h3 className="font-semibold">1. Triage the ticket</h3>
        <Pick label="Urgency: how soon must it be fixed?" options={URGENCY} value={s.urgency} onPick={(urgency) => set({ urgency })} testid="urgency" />
        <Pick label="Impact: how many people are affected?" options={IMPACT} value={s.impact} onPick={(impact) => set({ impact })} testid="impact" />
      </section>

      {triaged && (
        <div className="grid gap-3 lg:grid-cols-2">
          <section className="space-y-2 rounded-[6px] border border-line p-3">
            <h3 className="font-semibold">2. Ask questions</h3>
            <p className="text-[12px] text-muted">Good questions earn points. Questions that waste the caller’s time cost points.</p>
            <ul className="space-y-1.5">
              {c.questions.map((q) => {
                const asked = s.asked.includes(q.id);
                return (
                  <li key={q.id}>
                    {asked ? (
                      <div className="text-[13px]">
                        <div className="text-muted">You: {q.ask}</div>
                        <div data-testid={`answer-${q.id}`}>
                          {c.caller.name.split(' ')[0]}: {q.answer}
                        </div>
                      </div>
                    ) : (
                      <button className="w-full rounded-[5px] border border-line px-2 py-1 text-left text-[13px] hover:border-action" onClick={() => set({ asked: [...s.asked, q.id] })} data-testid={`ask-${q.id}`}>
                        {q.ask}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="space-y-2 rounded-[6px] border border-line p-3">
            <h3 className="font-semibold">3. Gather evidence</h3>
            <p className="text-[12px] text-muted">Training data for this scenario, not output from a live system.</p>
            <div className="flex flex-wrap gap-1.5">
              {c.evidence.map((e) => (
                <button
                  key={e.id}
                  className={cx('rounded-[5px] border px-2 py-1 text-[12.5px]', tool === e.id ? 'border-action bg-action/15' : s.opened.includes(e.id) ? 'border-line-strong' : 'border-line hover:border-line-strong')}
                  onClick={() => {
                    setTool(e.id);
                    if (!s.opened.includes(e.id)) set({ opened: [...s.opened, e.id] });
                  }}
                  data-testid={`evidence-${e.id}`}
                >
                  {TOOL_LABEL[e.tool]}: {e.title}
                </button>
              ))}
            </div>
            {openEv && (
              <pre className="max-h-56 overflow-auto rounded-[5px] bg-ink p-2 font-mono text-[12px] whitespace-pre-wrap" data-testid="evidence-view">
                {openEv.content}
              </pre>
            )}
          </section>
        </div>
      )}

      {triaged && (
        <section className="space-y-3 rounded-[6px] border border-line p-3">
          <h3 className="font-semibold">4. Diagnose, fix and document</h3>
          <Choice label="What is the root cause?" items={c.diagnoses} value={s.diagnosis} onPick={(diagnosis) => set({ diagnosis })} testid="diagnosis" />
          <Choice label="What will you do?" items={c.fixes} value={s.fix} onPick={(fix) => set({ fix })} testid="fix" />
          <Pick label="Escalate to" options={c.escalation.options} value={s.escalation} onPick={(escalation) => set({ escalation })} testid="escalate" />
          <label className="block space-y-1">
            <span className="text-[12px] text-muted">Resolution note: what you found, what you changed, how you confirmed it works</span>
            <Textarea rows={3} value={s.note} onChange={(e) => set({ note: e.target.value })} data-testid="resolution-note" placeholder="Example: Found …  Changed …  Confirmed by …" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" disabled={!ready} onClick={submit} data-testid="submit-case">
              Close ticket and score
            </Button>
            {!ready && <span className="text-[12px] text-muted">Pick a diagnosis, fix and escalation, and write a note first.</span>}
          </div>
        </section>
      )}

      <Hints tpl={tpl} c={c} used={s.hintsUsed} onUse={() => set({ hintsUsed: s.hintsUsed + 1 })} />
    </div>
  );
}

function Choice({ label, items, value, onPick, testid }: { label: string; items: { id: string; text: string }[]; value?: string; onPick: (id: string) => void; testid: string }) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-[12px] text-muted">{label}</legend>
      <div className="grid gap-1.5" role="radiogroup" aria-label={label}>
        {items.map((d) => (
          <button key={d.id} role="radio" aria-checked={value === d.id} className={cx('rounded-[5px] border px-2.5 py-1.5 text-left text-[13px]', value === d.id ? 'border-action bg-action/15' : 'border-line hover:border-line-strong')} onClick={() => onPick(d.id)} data-testid={`${testid}-${d.id}`}>
            {d.text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Hints appear only when the player asks. Each one costs 3 points. */
function Hints({ tpl, c, used, onUse }: { tpl: GameTemplate; c: GameCase; used: number; onUse: () => void }) {
  return (
    <section className="space-y-1.5 rounded-[6px] border border-dashed border-line p-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <Lightbulb className="size-4 text-degraded" />
        <span className="flex-1">Stuck? Ask {tpl.mentor} for a hint (costs 3 points each).</span>
        <Button size="sm" disabled={used >= c.hints.length} onClick={onUse} data-testid="hint">
          {used >= c.hints.length ? 'No more hints' : 'Ask for a hint'}
        </Button>
      </div>
      {c.hints.slice(0, used).map((h, i) => (
        <p key={i} className="rounded bg-pane-2 px-2 py-1" data-testid={`hint-${i}`}>
          {h}
        </p>
      ))}
    </section>
  );
}

export default function GamesPage() {
  const games = useMemo(() => allGames(), []);
  const [tplId, setTplId] = useState(games[0]?.id);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [history, setHistory] = useState<GameResult[]>([]);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('template');
    if (t && games.some((g) => g.id === t)) setTplId(t);
    setHistory(loadProgress().games);
  }, [games]);
  const tpl = games.find((g) => g.id === tplId) ?? games[0];
  const c = tpl?.cases.find((x) => x.id === caseId);
  const best = (id: string) => {
    const s = history.filter((h) => h.caseId === id);
    return s.length ? Math.max(...s.map((h) => h.score)) : null;
  };
  if (!tpl) return null;
  return (
    <div className="mx-auto max-w-[1200px] space-y-3 p-4">
      <header>
        <h1 className="text-[22px] font-semibold">Games</h1>
        <p className="max-w-3xl text-[13px] text-muted">Work a ticket queue like a real shift: triage, ask the right questions, gather evidence, fix it, decide whether to escalate, and write it up. Scenarios are fictional training cases; nothing here touches a live system.</p>
      </header>
      <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-2">
          <label className="block text-[12px] text-muted" htmlFor="game-role">
            Role
          </label>
          <select
            id="game-role"
            className="h-9 w-full rounded-[5px] border border-line-strong bg-ink px-2 text-[13px]"
            value={tpl.id}
            onChange={(e) => {
              setTplId(e.target.value);
              setCaseId(null);
              window.history.replaceState(null, '', `/games?template=${e.target.value}`);
            }}
            data-testid="game-template"
          >
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
                {g.imported ? ' (imported)' : ''}
              </option>
            ))}
          </select>
          <p className="text-[12.5px] text-muted">{tpl.summary}</p>
          <h2 className="pt-1 text-[13px] font-semibold">Queue</h2>
          <ul className="space-y-1.5" data-testid="game-queue">
            {tpl.cases.map((x) => {
              const b = best(x.id);
              const I = CHANNEL[x.channel];
              return (
                <li key={x.id}>
                  <button className={cx('w-full rounded-[6px] border px-2.5 py-2 text-left', caseId === x.id ? 'border-action bg-action/10' : 'border-line hover:border-line-strong')} onClick={() => setCaseId(x.id)} data-testid={`queue-${x.id}`}>
                    <div className="flex items-center gap-1.5 text-[13px]">
                      <I className="size-3.5 text-muted" />
                      <b className="truncate">{x.caller.name}</b>
                      {b !== null && <Badge tone={b >= 80 ? 'good' : 'warn'} className="ml-auto">{b}</Badge>}
                    </div>
                    <div className="line-clamp-2 text-[12px] text-muted">{x.opening}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        <Pane>
          {c ? (
            <CasePlay
              key={c.id}
              tpl={tpl}
              c={c}
              onExit={() => {
                setCaseId(null);
                setHistory(loadProgress().games);
              }}
            />
          ) : (
            <div className="space-y-2 p-2 text-[13.5px]">
              <h2 className="text-[16px] font-semibold">{tpl.role}</h2>
              <p>Pick a ticket from the queue. You will be scored on:</p>
              <ul className="grid list-disc gap-x-6 pl-5 sm:grid-cols-2">
                {(Object.keys(MAX) as Category[]).map((k) => (
                  <li key={k}>
                    {LABEL[k]} ({MAX[k]} pts)
                  </li>
                ))}
              </ul>
              <p className="text-muted">Hints are available when you ask for them, and never appear on their own.</p>
            </div>
          )}
        </Pane>
      </div>
    </div>
  );
}
