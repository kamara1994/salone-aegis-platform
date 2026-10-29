'use client';

import { useReactFlow } from '@xyflow/react';
import { Check, ChevronRight, Lightbulb, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { updateProgress } from '@/content/progress';
import { Badge, Button, cx } from '@/components/ui';
import { useLab } from '@/lab/store';
import type { LabDoc } from '@/lab/types';
import { gradeWorkbook, WORKBOOKS, type Level, type Workbook } from '@/lab/workbooks';

export function startWorkbookById(id: string, fit?: () => void): boolean {
  const wb = WORKBOOKS.find((w) => w.id === id);
  if (!wb) return false;
  useLab.getState().startWorkbook(wb.build(), wb.id, wb.title);
  if (fit) setTimeout(fit, 80);
  return true;
}

function Catalog() {
  const rf = useReactFlow();
  const [level, setLevel] = useState<Level | 'all'>('all');
  const list = WORKBOOKS.filter((w) => level === 'all' || w.level === level);
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 text-[12.5px]" data-testid="workbook-catalog">
      <div className="flex items-center gap-2">
        <p className="text-muted">Guided labs build their own topology and grade your work from the live network. Your current design is saved as a layout first.</p>
        <select className="ml-auto h-8 rounded-[5px] border border-line-strong bg-ink px-2 text-[12.5px]" value={level} onChange={(e) => setLevel(e.target.value as Level | 'all')} aria-label="Level">
          <option value="all">All levels</option>
          <option value="CCNA">CCNA</option>
          <option value="CCNP">CCNP</option>
        </select>
      </div>
      <ul className="grid min-h-0 flex-1 auto-rows-min gap-1.5 overflow-auto md:grid-cols-2 xl:grid-cols-3">
        {list.map((w) => (
          <li key={w.id}>
            <button className="flex w-full items-start gap-2 rounded-[6px] border border-line p-2 text-left hover:border-action" onClick={() => startWorkbookById(w.id, () => rf.fitView({ padding: 0.15 }))} data-testid={`workbook-${w.id}`}>
              <Badge tone={w.level === 'CCNP' ? 'warn' : 'neutral'}>{w.level}</Badge>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{w.title}</span>
                <span className="block text-muted">
                  {w.topic} · {w.tasks.length} tasks · about {w.minutes} min
                </span>
              </span>
              <ChevronRight className="mt-0.5 size-4 text-faint" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Active({ wb, doc }: { wb: Workbook; doc: LabDoc }) {
  const rf = useReactFlow();
  const st = useLab();
  const log = useLab((s) => s.log);
  const results = useMemo(() => gradeWorkbook(wb, doc, log), [wb, doc, log]);
  const [hints, setHints] = useState<Record<string, boolean>>({});
  const done = results.filter((r) => r.ok).length;
  const pct = Math.round((done / wb.tasks.length) * 100);
  // Record completion locally so Learn > Tracks can show it.
  useEffect(() => {
    if (pct === 100)
      updateProgress((p) => {
        p.lessons[`lab:${wb.id}`] = { ...(p.lessons[`lab:${wb.id}`] ?? { section: 0, visited: [], quiz: {}, trainer: {} }), done: true, updatedAt: new Date().toISOString() };
      });
  }, [pct, wb.id]);
  return (
    <div className="grid h-full min-h-0 grid-cols-[280px_1fr] gap-3 text-[12.5px] max-lg:grid-cols-1" data-testid="workbook-active">
      <div className="space-y-2 overflow-auto">
        <div className="flex items-center gap-2">
          <Badge tone={wb.level === 'CCNP' ? 'warn' : 'neutral'}>{wb.level}</Badge>
          <span className="text-muted">{wb.topic}</span>
        </div>
        <p className="text-[14px] font-semibold">{wb.title}</p>
        <p className="text-muted">{wb.intro}</p>
        <div>
          <div className="mb-1 flex justify-between text-[11.5px]">
            <span>
              {done}/{wb.tasks.length} tasks
            </span>
            <span data-testid="workbook-score">{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-pane-2">
            <div className={cx('h-full transition-[width]', pct === 100 ? 'bg-healthy' : 'bg-action')} style={{ width: `${pct}%` }} />
          </div>
        </div>
        {pct === 100 && <p className="rounded border border-healthy/50 bg-healthy/10 p-2 font-medium text-healthy">Lab complete. Every task checks out on the live network.</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => startWorkbookById(wb.id, () => rf.fitView({ padding: 0.15 }))}>
            <RotateCcw className="size-3.5" /> Restart lab
          </Button>
          <Button size="sm" onClick={() => st.endWorkbook()} data-testid="workbook-exit">
            <X className="size-3.5" /> Leave lab
          </Button>
        </div>
        <p className="text-[11px] text-muted">Your previous design is under Layouts as “Before lab: …”. Grading runs on every change: configuration, control plane and real packets.</p>
      </div>
      <ol className="min-h-0 space-y-1.5 overflow-auto pr-1" data-testid="workbook-tasks">
        {wb.tasks.map((t, k) => {
          const r = results[k];
          return (
            <li key={t.id} className={cx('rounded-[6px] border p-2', r.ok ? 'border-healthy/40 bg-healthy/5' : 'border-line')} data-testid={`task-${t.id}`} data-ok={r.ok}>
              <div className="flex items-start gap-2">
                <span className={cx('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px]', r.ok ? 'border-healthy bg-healthy text-white' : 'border-line-strong text-muted')}>{r.ok ? <Check className="size-3.5" /> : k + 1}</span>
                <div className="min-w-0 flex-1">
                  <p>{t.text}</p>
                  {!r.ok && r.detail && <p className="mt-0.5 text-[11.5px] text-degraded">Not yet: {r.detail}</p>}
                  {hints[t.id] && <p className="mt-1 rounded bg-pane-2 px-2 py-1 font-mono text-[11px]">{t.hint}</p>}
                </div>
                {!r.ok && (
                  <button className="text-muted hover:text-text" aria-label={`Hint for task ${k + 1}`} onClick={() => setHints({ ...hints, [t.id]: !hints[t.id] })}>
                    <Lightbulb className="size-4" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function WorkbooksTab({ doc }: { doc: LabDoc }) {
  const wb = doc.workbook ? WORKBOOKS.find((w) => w.id === doc.workbook!.id) : undefined;
  return wb ? <Active wb={wb} doc={doc} /> : <Catalog />;
}
