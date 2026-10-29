'use client';

import { CheckCircle2, Gamepad2, RotateCcw, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, Button, cx } from '@/components/ui';
import { forTopic, scenarioQuestions, STAGE_LABEL } from '@/content/scenarioQuestions';
import type { Topic } from '@/content/topics';

export function ScenarioQuestions({ gameIds, topic }: { gameIds: string[]; topic?: Topic }) {
  const [seed, setSeed] = useState(0);
  const all = useMemo(() => scenarioQuestions(gameIds), [gameIds, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const matched = useMemo(() => forTopic(all, topic), [all, topic]);
  const list = matched.length ? matched : all;
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const q = list[i];
  const answered = Object.keys(picked).filter((k) => list.some((x) => x.id === k));
  const right = answered.filter((k) => list.find((x) => x.id === k)!.answer === picked[k]).length;
  if (!all.length) return <p className="text-[13px] text-muted">No scenario cases are linked to this dashboard yet.</p>;
  const done = i >= list.length;
  return (
    <div className="max-w-[760px] space-y-3" data-testid="scenario-questions">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <Badge tone="info">{list.length} questions</Badge>
        <span className="text-muted">
          {right} of {answered.length} right
        </span>
        {topic && !matched.length && <span className="text-faint" data-testid="scenario-q-nomatch">No case mentions {topic.title} yet, so these cover the whole dashboard.</span>}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => {
            setSeed(seed + 1);
            setI(0);
            setPicked({});
          }}
        >
          <RotateCcw className="size-3.5" /> Shuffle and restart
        </Button>
      </div>
      {done ? (
        <div className="rounded-[6px] border border-line p-4" data-testid="scenario-q-done">
          <p className="text-[16px] font-semibold">
            {right} of {list.length} right
          </p>
          <p className="text-[13px] text-muted">Play the full tickets in Games to practise asking questions, gathering evidence and writing the note.</p>
        </div>
      ) : (
        <article className="space-y-3 rounded-[6px] border border-line bg-pane p-4">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <span>
              Question {i + 1} of {list.length}
            </span>
            <Badge>{STAGE_LABEL[q.stage]}</Badge>
            <span className="truncate">{q.game.title}</span>
          </div>
          <p className="text-[14px] leading-relaxed whitespace-pre-line" data-testid="scenario-q-stem">
            {q.stem}
          </p>
          <ul className="space-y-1.5">
            {q.options.map((o, k) => {
              const chosen = picked[q.id];
              const show = chosen !== undefined;
              return (
                <li key={k}>
                  <button
                    disabled={show}
                    onClick={() => setPicked({ ...picked, [q.id]: k })}
                    className={cx('flex w-full items-start gap-2 rounded-[5px] border px-3 py-2 text-left text-[13px]', !show && 'border-line hover:border-action', show && k === q.answer && 'border-healthy bg-healthy/10', show && k === chosen && k !== q.answer && 'border-down bg-down/10', show && k !== q.answer && k !== chosen && 'border-line opacity-60')}
                    data-testid={`scenario-q-option-${k}`}
                  >
                    {show && k === q.answer ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-healthy" /> : show && k === chosen ? <XCircle className="mt-0.5 size-4 shrink-0 text-down" /> : <span className="mt-0.5 size-4 shrink-0" />}
                    {o}
                  </button>
                </li>
              );
            })}
          </ul>
          {picked[q.id] !== undefined && (
            <div className="space-y-2">
              <p className="text-[13px] text-muted" data-testid="scenario-q-explain">
                {q.explain}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={() => setI(i + 1)} data-testid="scenario-q-next">
                  Next
                </Button>
                <Link href={`/games?template=${q.game.id}`} className="inline-flex h-8 items-center gap-1 rounded-[5px] border border-line px-2.5 text-[12.5px] hover:border-action">
                  <Gamepad2 className="size-3.5" /> Play this ticket
                </Link>
              </div>
            </div>
          )}
        </article>
      )}
    </div>
  );
}
