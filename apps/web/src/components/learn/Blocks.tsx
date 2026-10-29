'use client';

import { Check, ChevronDown, Lightbulb, Play, X } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { Button, cx } from '@/components/ui';
import { DevicePicture } from '@/components/lab/DeviceHoverCard';
import type { Block, Inline } from '@/content/types';
import { MODEL_BY_KEY } from '@/lab/catalog';
import { Diagram } from './Diagrams';

export type Mode = 'watch' | 'guided' | 'independent';

/** **bold**, `code` and [text](lab:workbook) / [text](challenge:id) links */
export function Rich({ text }: { text: Inline }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((?:lab|challenge):[^)]+\))/g);
  return (
    <>
      {parts.map((p, k) => {
        if (p.startsWith('**')) return <strong key={k}>{p.slice(2, -2)}</strong>;
        if (p.startsWith('`')) return <code key={k} className="rounded bg-pane-2 px-1 py-px font-mono text-[0.92em]">{p.slice(1, -1)}</code>;
        const m = /^\[([^\]]+)\]\((lab|challenge):([^)]+)\)$/.exec(p);
        if (m) return <Link key={k} className="text-action underline" href={`/lab?${m[2] === 'lab' ? 'workbook' : 'challenge'}=${m[3]}`}>{m[1]}</Link>;
        return <Fragment key={k}>{p}</Fragment>;
      })}
    </>
  );
}

const TONE = { tip: 'border-healthy/50 bg-healthy/8', info: 'border-action/50 bg-action/8', warn: 'border-degraded/60 bg-degraded/10', danger: 'border-down/60 bg-down/10' };

function Reveal({ prompt, answer, mode }: { prompt: Inline; answer: Inline; mode: Mode }) {
  const [open, setOpen] = useState(mode === 'watch');
  return (
    <div className="rounded-[6px] border border-line">
      <button className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronDown className={cx('size-4 transition-transform', open ? '' : '-rotate-90')} />
        <Rich text={prompt} />
      </button>
      {open && (
        <div className="border-t border-line px-3 py-2 text-[14px]" data-testid="reveal-answer">
          <Rich text={answer} />
        </div>
      )}
    </div>
  );
}

function Choice({ question, options, answer, explain, mode, onAnswer, label }: { question: Inline; options: string[]; answer: number; explain: Inline; mode: Mode; onAnswer?: (ok: boolean) => void; label: string }) {
  const [pick, setPick] = useState<number | null>(mode === 'watch' ? answer : null);
  const done = pick !== null;
  return (
    <div className="space-y-2 rounded-[6px] border border-line p-3" data-testid="choice">
      <p className="text-[12px] font-semibold text-muted">{label}</p>
      <p className="font-medium">
        <Rich text={question} />
      </p>
      <ul className="space-y-1">
        {options.map((o, k) => (
          <li key={k}>
            <button
              disabled={done}
              onClick={() => {
                setPick(k);
                onAnswer?.(k === answer);
              }}
              className={cx('w-full rounded-[5px] border px-3 py-1.5 text-left text-[14px]', !done ? 'border-line hover:border-action' : k === answer ? 'border-healthy bg-healthy/10' : k === pick ? 'border-down bg-down/10' : 'border-line opacity-60')}
            >
              <span className="mr-2 font-mono text-muted">{String.fromCharCode(65 + k)}</span>
              {o}
            </button>
          </li>
        ))}
      </ul>
      {done && (
        <p className={cx('text-[13.5px]', pick === answer ? 'text-healthy' : 'text-text')}>
          {pick === answer ? <Check className="mr-1 inline size-4" /> : <X className="mr-1 inline size-4 text-down" />}
          <Rich text={explain} />
        </p>
      )}
    </div>
  );
}

function Quiz({ block, mode, onScore }: { block: Extract<Block, { type: 'quiz' }>; mode: Mode; onScore: (id: string, correct: number, total: number) => void }) {
  const [answers, setAnswers] = useState<Record<number, boolean>>({});
  const correct = Object.values(answers).filter(Boolean).length;
  return (
    <div className="space-y-2" data-testid={`quiz-${block.id}`}>
      {block.questions.map((qq, k) => (
        <Choice
          key={k}
          label={`Question ${k + 1} of ${block.questions.length}`}
          question={qq.q}
          options={qq.options}
          answer={qq.answer}
          explain={qq.explain}
          mode={mode}
          onAnswer={(ok) => {
            const next = { ...answers, [k]: ok };
            setAnswers(next);
            if (Object.keys(next).length === block.questions.length) onScore(block.id, Object.values(next).filter(Boolean).length, block.questions.length);
          }}
        />
      ))}
      {Object.keys(answers).length === block.questions.length && (
        <p className="font-semibold" data-testid="quiz-score">
          Score: {correct}/{block.questions.length}
        </p>
      )}
    </div>
  );
}

function Trainer({ block, mode, onDone }: { block: Extract<Block, { type: 'trainer' }>; mode: Mode; onDone: (id: string, steps: number) => void }) {
  const [step, setStep] = useState(mode === 'watch' ? block.steps.length : 0);
  const [input, setInput] = useState('');
  const [log, setLog] = useState<{ cmd: string; out: string; ok: boolean }[]>(mode === 'watch' ? block.steps.map((s) => ({ cmd: s.hint.replace(/[`*]/g, '').split(' (')[0], out: s.output ?? '', ok: true })) : []);
  const [hint, setHint] = useState(false);
  const cur = block.steps[step];
  const submit = () => {
    const cmd = input.trim().replace(/\s+/g, ' ');
    if (!cmd || !cur) return;
    const ok = new RegExp(cur.expect, 'i').test(cmd);
    setLog([...log, { cmd, out: ok ? cur.output ?? '' : '% Not what this step needs. Read the goal again.', ok }]);
    setInput('');
    if (ok) {
      setHint(false);
      const n = step + 1;
      setStep(n);
      if (n === block.steps.length) onDone(block.id, n);
    }
  };
  return (
    <div className="overflow-hidden rounded-[6px] border border-line" data-testid={`trainer-${block.id}`}>
      <div className="flex items-center gap-2 border-b border-line bg-pane-2 px-3 py-1.5 text-[12.5px]">
        <span className="font-semibold">{block.title}</span>
        <span className="text-muted">· command trainer for {block.device} (checks your commands; it is not a live device)</span>
        <span className="ml-auto text-muted">
          {Math.min(step, block.steps.length)}/{block.steps.length}
        </span>
      </div>
      <div className="max-h-56 overflow-auto bg-[#0b1520] px-3 py-2 font-mono text-[12.5px] text-[#d6e2ee]">
        {log.map((l, k) => (
          <div key={k}>
            <div>
              <span className="text-[#7fb2e5]">#</span> {l.cmd}
            </div>
            {l.out && <div className={cx('whitespace-pre-wrap', l.ok ? 'text-[#9fb3c6]' : 'text-[#ff9a8a]')}>{l.out}</div>}
          </div>
        ))}
        {step >= block.steps.length && <div className="text-[#7be0a0]">✔ All steps done.</div>}
      </div>
      {cur && (
        <div className="space-y-2 p-3">
          <p className="text-[14px]">
            <span className="font-semibold">Step {step + 1}:</span> <Rich text={cur.goal} />
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input value={input} onChange={(e) => setInput(e.target.value)} className="h-9 flex-1 rounded-[5px] border border-line-strong bg-ink px-2 font-mono text-[13px]" aria-label="Command" autoComplete="off" spellCheck={false} />
            <Button type="submit" variant="primary">
              <Play className="size-3.5" /> Run
            </Button>
            {mode === 'guided' && (
              <Button type="button" onClick={() => setHint(!hint)} aria-label="Hint">
                <Lightbulb className="size-4" />
              </Button>
            )}
          </form>
          {hint && (
            <p className="text-[13px] text-muted">
              Hint: <Rich text={cur.hint} />
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Cmd({ block, mode }: { block: Extract<Block, { type: 'cmd' }>; mode: Mode }) {
  const [shown, setShown] = useState(mode === 'watch' || !block.output);
  return (
    <div className="overflow-hidden rounded-[6px] border border-line">
      <div className="flex items-center gap-2 bg-[#0b1520] px-3 py-2 font-mono text-[12.5px] text-[#d6e2ee]">
        <span className="text-[#7fb2e5]">{block.prompt}</span>
        <span className="flex-1 break-all">{block.command}</span>
        {block.output && !shown && (
          <button className="rounded border border-[#2a4058] px-2 py-0.5 text-[11px] text-[#9fb3c6] hover:text-white" onClick={() => setShown(true)}>
            Show output
          </button>
        )}
      </div>
      {shown && block.output && <pre className="overflow-auto bg-[#0b1520] px-3 pb-2 font-mono text-[12px] whitespace-pre text-[#9fb3c6]">{block.output}</pre>}
      {block.explain && (
        <p className="border-t border-line px-3 py-1.5 text-[13.5px]">
          <Rich text={block.explain} />
        </p>
      )}
    </div>
  );
}

export function BlockView({ block, mode, level, onQuiz, onTrainer }: { block: Block; mode: Mode; level: 'beginner' | 'advanced'; onQuiz: (id: string, c: number, t: number) => void; onTrainer: (id: string, n: number) => void }) {
  switch (block.type) {
    case 'p':
      if (block.level === 'advanced' && level === 'beginner') return null;
      return (
        <p className={cx('text-[15px] leading-relaxed', block.level === 'advanced' && 'border-l-2 border-action/50 pl-3')}>
          {block.level === 'advanced' && <span className="mr-1 rounded bg-action/15 px-1 text-[11px] text-action">Advanced</span>}
          <Rich text={block.text} />
        </p>
      );
    case 'h':
      return <h3 className="pt-2 text-[16px] font-semibold">{block.text}</h3>;
    case 'list': {
      const L = block.ordered ? 'ol' : 'ul';
      return (
        <L className={cx('space-y-1 pl-5 text-[15px] leading-relaxed', block.ordered ? 'list-decimal' : 'list-disc')}>
          {block.items.map((i, k) => (
            <li key={k}>
              <Rich text={i} />
            </li>
          ))}
        </L>
      );
    }
    case 'code':
      return (
        <figure className="overflow-hidden rounded-[6px] border border-line">
          {block.title && <figcaption className="border-b border-line bg-pane-2 px-3 py-1 text-[12px] text-muted">{block.title}</figcaption>}
          <pre className="overflow-auto bg-[#0b1520] p-3 font-mono text-[12.5px] whitespace-pre text-[#d6e2ee]">{block.code}</pre>
        </figure>
      );
    case 'cmd':
      return <Cmd block={block} mode={mode} />;
    case 'callout':
      return (
        <aside className={cx('rounded-[6px] border px-3 py-2 text-[14.5px]', TONE[block.tone])} role="note">
          {block.title && <p className="font-semibold">{block.title}</p>}
          <Rich text={block.text} />
        </aside>
      );
    case 'table':
      return (
        <figure className="overflow-auto rounded-[6px] border border-line">
          <table className="w-full text-[13.5px]">
            <thead className="bg-pane-2 text-left">
              <tr>
                {block.head.map((h) => (
                  <th key={h} className="px-3 py-1.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, k) => (
                <tr key={k} className="border-t border-line">
                  {r.map((c, j) => (
                    <td key={j} className="px-3 py-1.5 align-top">
                      <Rich text={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {block.caption && <figcaption className="border-t border-line px-3 py-1 text-[12px] text-muted">{block.caption}</figcaption>}
        </figure>
      );
    case 'device': {
      const m = MODEL_BY_KEY[block.model];
      if (!m) return null;
      return (
        <figure className="grid gap-3 rounded-[6px] border border-line p-3 md:grid-cols-[minmax(0,1.2fr)_1fr]">
          <div className="flex min-h-[180px] items-center justify-center overflow-hidden rounded bg-pane-2">
            <DevicePicture model={m} className="max-h-[320px] max-w-full object-contain" />
          </div>
          <figcaption className="space-y-2 text-[14px]">
            <p className="font-semibold">
              {m.vendor} {m.name}
            </p>
            <p>
              <Rich text={block.caption} />
            </p>
            {block.points && (
              <ul className="list-disc pl-5 text-[13.5px] text-muted">
                {block.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </figcaption>
        </figure>
      );
    }
    case 'image':
      return (
        <figure className="overflow-hidden rounded-[6px] border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.src} alt={block.alt} className="max-h-[420px] w-full object-contain bg-pane-2" />
          {block.caption && (
            <figcaption className="px-3 py-1 text-[12px] text-muted">
              <Rich text={block.caption} />
            </figcaption>
          )}
        </figure>
      );
    case 'diagram':
      return (
        <figure className="rounded-[6px] border border-line bg-pane p-2">
          <div className="mx-auto max-w-[640px]">
            <Diagram name={block.name} />
          </div>
          {block.caption && (
            <figcaption className="px-1 pt-1 text-center text-[12.5px] text-muted">
              <Rich text={block.caption} />
            </figcaption>
          )}
        </figure>
      );
    case 'compare':
      return (
        <div className="grid gap-2 md:grid-cols-2">
          {([block.before, block.after] as const).map((x, k) => (
            <div key={k} className={cx('rounded-[6px] border p-3', k === 0 ? 'border-down/40' : 'border-healthy/50')}>
              <p className={cx('mb-1 text-[12px] font-semibold', k === 0 ? 'text-down' : 'text-healthy')}>{x.title}</p>
              {x.text && (
                <p className="text-[14px]">
                  <Rich text={x.text} />
                </p>
              )}
              {x.code && <pre className="mt-1 overflow-auto rounded bg-[#0b1520] p-2 font-mono text-[12px] text-[#d6e2ee]">{x.code}</pre>}
            </div>
          ))}
        </div>
      );
    case 'reveal':
      return <Reveal prompt={block.prompt} answer={block.answer} mode={mode} />;
    case 'predict':
      return <Choice label="What happens next?" question={block.question} options={block.options} answer={block.answer} explain={block.explain} mode={mode} />;
    case 'quiz':
      return <Quiz block={block} mode={mode} onScore={onQuiz} />;
    case 'trainer':
      return <Trainer block={block} mode={mode} onDone={onTrainer} />;
    case 'lab':
      return (
        <div className={cx('flex flex-wrap items-center gap-3 rounded-[6px] border p-3', block.graded ? 'border-action bg-action/8' : 'border-line')}>
          <p className="min-w-0 flex-1 text-[14.5px]">
            {block.graded && <span className="mr-2 rounded bg-action px-1.5 py-0.5 text-[11px] font-semibold text-white">Graded</span>}
            <Rich text={block.text} />
          </p>
          <Link href={`/lab?${block.workbook ? `workbook=${block.workbook}` : `challenge=${block.challenge}`}`} className="inline-flex h-9 items-center rounded-[5px] bg-action px-3 text-[13px] font-medium text-white hover:opacity-90" data-testid="lesson-open-lab">
            Open in the Lab
          </Link>
        </div>
      );
  }
}
