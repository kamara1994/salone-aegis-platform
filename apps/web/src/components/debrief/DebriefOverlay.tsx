'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDebrief, useScenarios, useTicket } from '@/api/hooks';
import type { AnswerScore, DebriefQuestion } from '@/api/types';
import { errorText, useApi } from '@/components/providers';
import { Badge, Button, cx, ErrorState, fmtDuration, Loading, Textarea, useNow } from '@/components/ui';
import { useUi } from '@/state/ui';

const INTERVIEWER: Record<string, { name: string; role: string }> = {
  senior_network_engineer: { name: 'Ngozi Adeyemi', role: 'Senior network engineer' },
  soc_lead: { name: 'Daniel Mensah', role: 'SOC lead' },
  hiring_manager: { name: 'Sarah Whitfield', role: 'Hiring manager' },
  ciso: { name: 'Kwame Boateng', role: 'CISO' },
  recruiter_screen: { name: 'Priya Raman', role: 'Recruiter' },
};
const DEPTH = ['', 'Your story', 'Protocol depth', 'What if', 'At scale'];

type SpeechRec = { start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; continuous: boolean; interimResults: boolean; lang: string };

function ScoreBars({ s }: { s: AnswerScore }) {
  const rows: [string, number | undefined][] = [
    ['Accuracy', s.accuracy],
    ['Depth', s.depth],
    ['Structure', s.structure],
    ['Numbers', s.numbers],
    ['Honesty', s.honesty],
    ['Conciseness', s.conciseness],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k} className="text-[12px]">
          <div className="flex justify-between text-muted">
            <span>{k}</span>
            <span className="tabular-nums text-text">{v ?? '-'}</span>
          </div>
          <div className="mt-0.5 h-1 rounded bg-pane-2">
            <div className={cx('h-1 rounded', (v ?? 0) >= 75 ? 'bg-healthy' : (v ?? 0) >= 55 ? 'bg-degraded' : 'bg-down')} style={{ width: `${v ?? 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DebriefOverlay() {
  const { debriefTicketId, openDebrief } = useUi();
  const api = useApi();
  const qc = useQueryClient();
  const deb = useDebrief(debriefTicketId);
  const ticket = useTicket(debriefTicketId);
  const scenarios = useScenarios();
  const [answer, setAnswer] = useState('');
  const [last, setLast] = useState<DebriefQuestion | null>(null);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [speak, setSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const now = useNow(1000);
  const d = deb.data;
  const current = d?.questions.find((q) => q.id === d.current_question_id) ?? null;
  const exam = ticket.data?.mode === 'exam';

  useEffect(() => {
    setAnswer('');
    setStartedAt(Date.now());
    if (current && speak && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(current.text));
    }
  }, [current?.id, speak]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = useMutation({
    mutationFn: () => api.answerDebrief(d!.id, current!.id, answer),
    onSuccess: (res) => {
      setLast(res.questions.find((q) => q.id === current!.id) ?? null);
      qc.setQueryData(['debrief', debriefTicketId], res);
    },
  });
  const defer = useMutation({
    mutationFn: () => api.deferDebrief(d!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debrief'] });
      openDebrief(null);
    },
  });

  const recognitionSupported = useMemo(() => typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window), []);
  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';
    const base = answer;
    rec.onresult = (e) => setAnswer(`${base} ${Array.from(e.results).map((r) => r[0].transcript).join(' ')}`.trim());
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  if (!debriefTicketId) return null;
  const who = INTERVIEWER[d?.interviewer ?? 'hiring_manager'];
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const elapsed = now - startedAt;
  const qi = d && current ? d.questions.indexOf(current) : -1;

  return (
    <div role="dialog" aria-modal="true" aria-label="Debrief interview" className="fixed inset-0 z-50 flex flex-col bg-ink">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5">
        <div className="grid size-9 place-items-center rounded-full bg-pane-2 text-[13px] font-semibold">{who.name.split(' ').map((w) => w[0]).join('')}</div>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold">
            Debrief with {who.name} <span className="font-normal text-muted">· {who.role}</span>
          </p>
          <p className="truncate text-[12.5px] text-muted">
            {ticket.data ? `${ticket.data.number}: ${ticket.data.title}` : 'Loading ticket…'}
            {exam && ' · Exam mode: no model answers until the end'}
          </p>
        </div>
        <div className="flex-1" />
        {d && d.state === 'running' && (
          <Button variant="ghost" size="sm" busy={defer.isPending} onClick={() => defer.mutate()} title="The ticket stays in Debrief and this opens at the start of your next session">
            Debrief later
          </Button>
        )}
        {d?.state === 'scored' && (
          <Button variant="primary" size="sm" onClick={() => openDebrief(null)}>
            Close
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-5 py-8">
          {deb.isLoading && <Loading rows={5} />}
          {deb.error && <ErrorState error={deb.error} retry={() => deb.refetch()} />}

          {d && (
            <ol className="flex gap-1.5" aria-label="Questions">
              {d.questions.map((q, i) => (
                <li key={q.id} className={cx('h-1.5 flex-1 rounded', q.score ? (q.score.total >= 75 ? 'bg-healthy' : q.score.total >= 55 ? 'bg-degraded' : 'bg-down') : i === qi ? 'bg-action' : 'bg-pane-2')} title={`Question ${i + 1}${q.score ? `: ${q.score.total}` : ''}`} />
              ))}
            </ol>
          )}

          {last?.score && (!exam || d?.state === 'scored') && (
            <section className="space-y-3 rounded-[6px] border border-line bg-pane p-4" aria-label="Feedback on your last answer">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-[13px] font-semibold">Your last answer scored {last.score.total}</h3>
                <span className="text-[12px] text-muted">{last.kind?.replace('_', ' ')}</span>
              </div>
              <ScoreBars s={last.score} />
              <p className="text-[13px]">{last.score.feedback}</p>
              {last.score.model_answer && (
                <details className="text-[13px]">
                  <summary className="cursor-pointer text-action">Show a model answer</summary>
                  <p className="mt-2 text-muted">{last.score.model_answer}</p>
                </details>
              )}
            </section>
          )}

          {current && d?.state === 'running' && (
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-[12.5px] text-muted">
                <Badge tone="info">
                  Question {qi + 1} of {d.questions.length}
                </Badge>
                <span>{DEPTH[current.depth] ?? ''}</span>
                <span className="ml-auto tabular-nums">{fmtDuration(elapsed)}</span>
              </div>
              <p className="text-[21px] leading-snug font-medium text-pretty">{current.text}</p>
              <Textarea
                autoFocus
                rows={8}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && answer.trim()) submit.mutate();
                }}
                placeholder="Answer as you would out loud. Situation, what you did, the result, with numbers."
                aria-label="Your answer"
              />
              <div className="flex flex-wrap items-center gap-3">
                <span className={cx('text-[12.5px] tabular-nums', words > 260 ? 'text-degraded' : 'text-muted')}>
                  {words} words · aim for 60 to 220
                </span>
                {recognitionSupported && (
                  <Button size="sm" variant="ghost" onClick={toggleMic} aria-pressed={listening}>
                    {listening ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />} {listening ? 'Stop dictation' : 'Answer by voice'}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSpeak(!speak)} aria-pressed={speak}>
                  {speak ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />} {speak ? 'Stop reading questions' : 'Read questions aloud'}
                </Button>
                <div className="flex-1" />
                {submit.error && <span className="text-[12.5px] text-down">{errorText(submit.error)}</span>}
                <Button variant="primary" busy={submit.isPending} disabled={!answer.trim()} onClick={() => submit.mutate()}>
                  Submit answer
                </Button>
              </div>
            </section>
          )}

          {d && !current && d.state === 'running' && <p className="text-muted">The interviewer is reading your answer…</p>}

          {d?.state === 'scored' && (
            <section className="space-y-5" aria-label="Debrief result">
              <div className="flex items-end gap-4">
                <p className="text-[56px] leading-none font-semibold tabular-nums">{d.overall_score}</p>
                <p className="pb-2 text-muted">
                  overall debrief score for {ticket.data?.number}. The ticket is closed and the score is in your evidence.
                </p>
              </div>
              <div className="space-y-3">
                {d.questions.map((q, i) => (
                  <details key={q.id} className="rounded-[6px] border border-line bg-pane p-3 text-[13px]">
                    <summary className="flex cursor-pointer items-center gap-3">
                      <span className="tabular-nums font-semibold">{q.score?.total ?? '-'}</span>
                      <span className="truncate">
                        Q{i + 1}. {q.text}
                      </span>
                    </summary>
                    <div className="mt-3 space-y-3">
                      <p className="whitespace-pre-wrap text-muted">{q.answer}</p>
                      {q.score && <ScoreBars s={q.score} />}
                      <p>{q.score?.feedback}</p>
                      {q.score?.model_answer && <p className="text-muted">Model answer: {q.score.model_answer}</p>}
                    </div>
                  </details>
                ))}
              </div>
              {!!d.study_list?.length && (
                <div>
                  <h3 className="mb-2 text-[13px] font-semibold">Study list: the edge of what you know</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {d.study_list.map((s) => (
                      <Badge key={s} tone="warn">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {!!d.assigned_scenarios?.length && (
                <div>
                  <h3 className="mb-2 text-[13px] font-semibold">Assigned next: the scheduler sends these first</h3>
                  <ul className="list-disc space-y-1 pl-5 text-[13px]">
                    {d.assigned_scenarios.map((id) => (
                      <li key={id}>
                        <Link className="text-action hover:underline" href={`/scenarios?launch=${id}`} onClick={() => openDebrief(null)}>
                          {scenarios.data?.find((s) => s.id === id)?.title ?? id}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
