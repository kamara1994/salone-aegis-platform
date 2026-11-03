'use client';

// CCNA Focus scenario questions as case files: read the situation, write your own answer to each question,
// then compare against what a strong answer covers and tick the points you hit. Same layout as Learn by topic.
import { ArrowLeft, ArrowRight, Check, ClipboardList, FlaskConical, Lightbulb, Target } from 'lucide-react';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, cx } from '@/components/ui';
import { CCNA_FOCUS_BRIEFS } from '@/content/ccnaFocus';
import { MiniRing, Segments, ShowSide, StudySide, useSide, useStored, type SideGroup } from './StudyKit';
import { AskAI } from '@/components/tutor/AskAI';

const DOMAIN_HUE = ['#4f9cf9', '#22b8cf', '#ff922b', '#4c6ef5', '#fa5252', '#12b886'];
const LEVEL_HUE: Record<string, string> = { Beginner: '#38d9a9', Intermediate: '#ffa94d', Advanced: '#ff6b81' };
const domains = [...new Set(CCNA_FOCUS_BRIEFS.map((b) => b.domain))];
const hueOf = (domain: string) => DOMAIN_HUE[domains.indexOf(domain) % DOMAIN_HUE.length];

type Saved = { cur: string; done: Record<string, 1>; notes: Record<string, string[]>; ticks: Record<string, number[]> };

export function ScenarioCases({ switcher }: { switcher: ReactNode }) {
  const first = CCNA_FOCUS_BRIEFS[0]?.id ?? '';
  const [saved, setSaved] = useStored<Saved>('aegis.scenarios.ccna.v1', { cur: first, done: {}, notes: {}, ticks: {} });
  const [side, setSide] = useSide('aegis.scenarios.side');
  const [compare, setCompare] = useState(false);
  const idx = Math.max(0, CCNA_FOCUS_BRIEFS.findIndex((b) => b.id === saved.cur));
  const b = CCNA_FOCUS_BRIEFS[idx];
  const hue = b ? hueOf(b.domain) : '#4f9cf9';
  const inDomain = CCNA_FOCUS_BRIEFS.filter((x) => x.domain === b?.domain);
  const di = inDomain.findIndex((x) => x.id === b?.id);
  const notes = saved.notes[b?.id ?? ''] ?? [];
  const ticks = saved.ticks[b?.id ?? ''] ?? [];

  const goTo = (id: string) => {
    setCompare(false);
    setSaved({ ...saved, cur: id });
  };
  const step = (d: 1 | -1) => goTo(CCNA_FOCUS_BRIEFS[(idx + d + CCNA_FOCUS_BRIEFS.length) % CCNA_FOCUS_BRIEFS.length].id);
  const setNote = (k: number, v: string) => {
    const n = [...notes];
    n[k] = v;
    setSaved({ ...saved, notes: { ...saved.notes, [b.id]: n } });
  };
  const toggleTick = (k: number) => {
    const t = ticks.includes(k) ? ticks.filter((x) => x !== k) : [...ticks, k];
    setSaved({ ...saved, ticks: { ...saved.ticks, [b.id]: t } });
  };
  const finish = () => {
    const next = CCNA_FOCUS_BRIEFS[(idx + 1) % CCNA_FOCUS_BRIEFS.length].id;
    setCompare(false);
    setSaved({ ...saved, done: { ...saved.done, [b.id]: 1 }, cur: next });
  };

  const groups: SideGroup[] = useMemo(
    () =>
      domains.map((d) => ({
        key: d,
        title: d.replace(/^\d+\s·\s/, ''),
        hue: hueOf(d),
        items: CCNA_FOCUS_BRIEFS.filter((x) => x.domain === d).map((x) => ({
          id: x.id,
          label: x.topic,
          done: !!saved.done[x.id],
          mark: <i className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: LEVEL_HUE[x.level] }} title={x.level} />,
        })),
      })),
    [saved.done],
  );

  if (!b) return <p className="text-[13px] text-muted">No CCNA Focus questions are available yet.</p>;
  const answered = notes.filter((n) => n?.trim()).length;
  const covered = ticks.length;
  return (
    <div className="flex gap-6" data-testid="ccna-focus-scenario-questions">
      {side && <StudySide eyebrow="Scenario questions" doneLabel="cases done" groups={groups} current={b.id} onItem={goTo} onHide={() => setSide(false)} testid="case-side" />}
      <div className="mx-auto min-w-0 max-w-[860px] flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {!side && <ShowSide onShow={() => setSide(true)} />}
          <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted">
            Case <b className="text-text">{idx + 1}</b> of {CCNA_FOCUS_BRIEFS.length}
            <span className="mx-1.5 text-faint">·</span>
            <span className="font-semibold" style={{ color: hue }}>{b.domain.replace(/^\d+\s·\s/, '')}</span>
          </p>
          {switcher}
        </div>
        <Segments n={inDomain.length} at={di} done={(k) => !!saved.done[inDomain[k].id]} onPick={(k) => goTo(inDomain[k].id)} hue={hue} labels={inDomain.map((x) => x.topic)} />

        <article className="case-file" style={{ '--hue': hue } as CSSProperties} data-testid="ccna-focus-question-brief">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flash-tag" style={{ '--hue': hue } as CSSProperties}>{b.topic}</span>
            <span className="case-chip" style={{ '--c': LEVEL_HUE[b.level] } as CSSProperties}>{b.level}</span>
            <span className="case-chip" style={{ '--c': '#94a3b8' } as CSSProperties}>{b.format}</span>
            <span className="ml-auto text-[11px] text-faint" title="CCNA 200-301 exam objectives">Objectives {b.objectives.join(', ')}</span>
            <AskAI ctx={{ kind: 'Case', label: b.topic, text: `${b.title} ${b.scenario}` }} />
          </div>
          <h2 className="mt-3 text-[24px] leading-tight font-semibold tracking-[-0.01em] text-text">{b.title}</h2>
          <div className="case-brief mt-4">
            <p className="text-[10.5px] font-semibold tracking-[0.2em] text-faint uppercase">The situation</p>
            <p className="mt-1.5 text-[15.5px] leading-relaxed text-text" style={{ fontFamily: "'IBM Plex Serif', Georgia, serif" }}>
              {b.scenario}
            </p>
          </div>
        </article>

        <section className="case-section" data-testid="case-questions">
          <header className="flex items-center gap-2">
            <Lightbulb className="size-4" style={{ color: hue }} />
            <h3 className="text-[14px] font-semibold">Think it through</h3>
            <span className="ml-auto text-[11.5px] text-faint">
              {answered}/{b.questions.length} answered · saved on this computer
            </span>
          </header>
          <ol className="mt-3 space-y-3">
            {b.questions.map((q, k) => (
              <li key={q} className="case-q" style={{ '--hue': hue } as CSSProperties}>
                <span className="case-num" data-on={notes[k]?.trim() ? '1' : undefined}>{notes[k]?.trim() ? <Check className="size-3" strokeWidth={3} /> : k + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] leading-snug text-text">{q}</p>
                  <textarea value={notes[k] ?? ''} onChange={(e) => setNote(k, e.target.value)} rows={2} placeholder="Your answer, in your own words…" className="case-input mt-2" aria-label={`Your answer to question ${k + 1}`} data-testid={`case-note-${k}`} />
                </div>
              </li>
            ))}
          </ol>
        </section>

        {!compare ? (
          <div className="flex justify-center">
            <button type="button" onClick={() => setCompare(true)} className="flash-show" data-testid="case-compare">
              <Target className="size-4" /> Compare with a strong answer
            </button>
          </div>
        ) : (
          <section className="case-section case-rubric" style={{ '--hue': hue } as CSSProperties} data-testid="case-rubric">
            <header className="flex items-center gap-3">
              <MiniRing pct={b.evidence.length ? (covered / b.evidence.length) * 100 : 0} size={40} stroke={3.5} color={hue}>
                <span className="text-[11px] font-semibold">
                  {covered}/{b.evidence.length}
                </span>
              </MiniRing>
              <div>
                <h3 className="text-[14px] font-semibold">What a strong answer covers</h3>
                <p className="text-[12px] text-muted">Tick each point your answers actually covered.</p>
              </div>
            </header>
            <ul className="mt-3 space-y-1.5">
              {b.evidence.map((e, k) => {
                const on = ticks.includes(k);
                return (
                  <li key={e}>
                    <button type="button" onClick={() => toggleTick(k)} aria-pressed={on} className={cx('case-tick', on && 'is-on')} data-testid={`case-tick-${k}`}>
                      <span className="case-box">{on && <Check className="size-3" strokeWidth={3} />}</span>
                      <span className="flex-1 text-left">{e}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 rounded-xl border border-dashed border-line p-3.5">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-text">
                <FlaskConical className="size-3.5" style={{ color: hue }} /> Then build it: Labs → CCNA Focus Lab
              </p>
              <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-muted">
                {b.tasks.map((t) => (
                  <li key={t} className="flex gap-2">
                    <ClipboardList className="mt-0.5 size-3.5 shrink-0 text-faint" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={() => step(-1)} data-testid="case-back">
            <ArrowLeft className="size-4" /> Back
          </Button>
          <div className="flex-1" />
          <Button variant="primary" onClick={finish} data-testid="case-done">
            {saved.done[b.id] ? 'Next case' : 'Mark done, next case'} <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
