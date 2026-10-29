'use client';

import { ArrowLeft, ArrowRight, BookOpenText, CheckCircle2, Crosshair, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui';
import { topicById, type Topic } from '@/content/topics';

const huntingSteps = [
  {
    title: 'Start with the alert and its context',
    focus: 'Check severity, the affected host, and the time window.',
    image: '/learn/visuals/hunting/01-alert-context.svg',
    caption: 'Open the alert details before deciding what it means. Record the source host and the earliest relevant time so your later searches stay focused.',
  },
  {
    title: 'Write a testable hypothesis',
    focus: 'State the behavior you expect to find and choose a matching time range.',
    image: '/learn/visuals/hunting/02-hypothesis-search.svg',
    caption: 'A useful hunt asks a question that evidence can answer. Here: “Is this workstation making regular outbound connections to the same rare destination?”',
  },
  {
    title: 'Look for a pattern across results',
    focus: 'Compare destination, interval, and transferred bytes.',
    image: '/learn/visuals/hunting/03-pattern-results.svg',
    caption: 'Repeated connections at nearly even intervals with similar byte counts can indicate beaconing. Treat that as a lead to investigate, not proof by itself.',
  },
  {
    title: 'Pivot to host evidence',
    focus: 'Connect the network activity to a process and user.',
    image: '/learn/visuals/hunting/04-host-pivot.svg',
    caption: 'Use the same host and time window to inspect endpoint telemetry. Check the process path, signer, parent process, account, and whether the activity is expected.',
  },
  {
    title: 'Record evidence and decide the next action',
    focus: 'Preserve the evidence, state your confidence, and document a follow-up.',
    image: '/learn/visuals/hunting/05-findings.svg',
    caption: 'Write down what you searched, what you found, and what remains uncertain. Escalate and follow your response process if evidence supports malicious activity.',
  },
];

function HuntingLesson({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(-1);
  const current = huntingSteps[step];

  return (
    <section className="mx-auto max-w-5xl space-y-4" data-testid="hunting-visual-lesson">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-text">
        <ArrowLeft className="size-4" /> All image lessons
      </button>

      {step < 0 ? (
        <div className="rounded-xl border border-line-strong bg-pane p-5 md:p-7" data-testid="hunting-lesson-intro">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>SOC · Guided visual lesson</Badge>
            <span className="text-[12px] text-muted">About 12 minutes · 5 steps</span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Threat hunting</h1>
          <p className="mt-2 max-w-3xl text-[15px] leading-6 text-muted">
            Threat hunting is a structured search for suspicious activity that routine alerts may have missed. You begin with a focused question, examine relevant evidence, test what you find, and record the result.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <article className="rounded-lg border border-line bg-ink/40 p-4">
              <h2 className="flex items-center gap-2 font-semibold"><BookOpenText className="size-4 text-action" /> What you’ll learn</h2>
              <ul className="mt-2 list-inside list-disc space-y-1.5 text-[13px] leading-5 text-muted">
                <li>Turn an alert or threat idea into a testable hypothesis.</li>
                <li>Scope searches by host, data source, and time.</li>
                <li>Recognize patterns worth investigating without treating them as proof.</li>
                <li>Pivot between network and endpoint evidence, then document a defensible finding.</li>
              </ul>
            </article>
            <article className="rounded-lg border border-line bg-ink/40 p-4">
              <h2 className="flex items-center gap-2 font-semibold"><Crosshair className="size-4 text-action" /> What to focus on while hunting</h2>
              <ul className="mt-2 list-inside list-disc space-y-1.5 text-[13px] leading-5 text-muted">
                <li><strong className="text-text">Scope:</strong> which host, account, data source, and time window?</li>
                <li><strong className="text-text">Baseline:</strong> what is normal for this host or user?</li>
                <li><strong className="text-text">Connections:</strong> do time, process, destination, and behavior line up?</li>
                <li><strong className="text-text">Evidence:</strong> can another source confirm or disprove the lead?</li>
              </ul>
            </article>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-action/10 px-4 py-3">
            <p className="text-[13px] text-muted">The screens are simulated training interfaces. Follow the numbered callouts; each screen focuses on one or two investigation decisions.</p>
            <button onClick={() => setStep(0)} className="inline-flex items-center gap-2 rounded-md bg-action px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110" data-testid="hunting-start">
              Start step 1 <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      ) : current ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[12px] font-medium uppercase tracking-wide text-action">Step {step + 1} of {huntingSteps.length}</p>
              <h1 className="mt-1 text-xl font-semibold">{current.title}</h1>
            </div>
            <button onClick={() => setStep(-1)} className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-2 text-[12px] text-muted hover:text-text">
              <RotateCcw className="size-3.5" /> Lesson overview
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-line-strong bg-[#071421] shadow-lg">
            {/* SVG screenshots are authored locally so labels and callout arrows stay crisp at any zoom. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.image} alt={`Simulated SOC hunting screen: ${current.focus}`} className="block h-auto w-full" />
          </div>

          <div className="rounded-xl border border-line bg-pane p-4 md:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{current.focus}</Badge>
              <span className="text-[12px] text-muted">Follow callout 1, then callout 2.</span>
            </div>
            <p className="mt-3 text-[14px] leading-6 text-text">{current.caption}</p>
          </div>

          <nav className="flex items-center justify-between gap-3" aria-label="Hunting lesson steps">
            <button onClick={() => setStep(step === 0 ? -1 : step - 1)} className="inline-flex items-center gap-2 rounded-md border border-line-strong px-4 py-2 text-[13px] hover:bg-pane-2" data-testid="hunting-previous">
              <ArrowLeft className="size-4" /> Previous
            </button>
            <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${huntingSteps.length}`}>
              {huntingSteps.map((item, index) => (
                <button key={item.title} onClick={() => setStep(index)} aria-label={`Go to step ${index + 1}: ${item.title}`} aria-current={index === step ? 'step' : undefined} className={`size-2.5 rounded-full ${index === step ? 'bg-action ring-2 ring-action/25' : index < step ? 'bg-action/60' : 'bg-line-strong'}`} />
              ))}
            </div>
            {step < huntingSteps.length - 1 ? (
              <button onClick={() => setStep(step + 1)} className="inline-flex items-center gap-2 rounded-md bg-action px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110" data-testid="hunting-next">
                Next <ArrowRight className="size-4" />
              </button>
            ) : (
              <button onClick={() => setStep(-1)} className="inline-flex items-center gap-2 rounded-md bg-action px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110" data-testid="hunting-finish">
                Finish <CheckCircle2 className="size-4" />
              </button>
            )}
          </nav>
        </>
      ) : null}
    </section>
  );
}

export function VisualsView({ onTopic, scope, topicId }: { onTopic: (id: string) => void; scope?: Topic[]; topicId?: string }) {
  const [opened, setOpened] = useState(false);
  const huntingTopic = topicById('soc-hunting');
  const isSoc = !!scope?.some((topic) => topic.id === 'soc-hunting');
  const showHunting = isSoc && (opened || topicId === 'soc-hunting');

  if (showHunting) return <HuntingLesson onBack={() => { setOpened(false); onTopic(''); }} />;

  return (
    <div className="mx-auto max-w-5xl space-y-4" data-testid="visuals-view">
      <div>
        <p className="text-[13px] text-muted">Focused visual walkthroughs for difficult tasks that benefit from seeing where to look and what evidence matters.</p>
        <p className="mt-1 text-[11.5px] text-faint">Training screens are simulated and contain no real credentials or customer data.</p>
      </div>
      {isSoc && huntingTopic ? (
        <article className="overflow-hidden rounded-xl border border-line-strong bg-pane md:grid md:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="space-y-3 p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-2"><Badge>SOC · Investigation</Badge><span className="text-[12px] text-muted">5 guided visual steps</span></div>
            <h1 className="text-2xl font-semibold">Hunting</h1>
            <p className="max-w-2xl text-[14px] leading-6 text-muted">Learn how to move from a focused hypothesis to scoped searches, suspicious patterns, endpoint evidence, and a clear documented outcome.</p>
            <button onClick={() => { onTopic(huntingTopic.id); setOpened(true); }} className="inline-flex items-center gap-2 rounded-md bg-action px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110" data-testid="open-hunting-visual-lesson">
              Open Hunting lesson <ArrowRight className="size-4" />
            </button>
          </div>
          <div className="flex flex-col justify-center gap-2 border-t border-line bg-ink/35 p-5 md:border-t-0 md:border-l">
            {['Alert context and scope', 'Hypothesis and search', 'Pattern across results', 'Endpoint pivot', 'Evidence and decision'].map((item, index) => (
              <div key={item} className="flex items-center gap-2.5 text-[13px] text-muted"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-action/15 text-[11px] font-semibold text-action">{index + 1}</span>{item}</div>
            ))}
          </div>
        </article>
      ) : (
        <div className="rounded-lg border border-line bg-pane p-4 text-[13px] text-muted" data-testid="visuals-topic-empty">
          {scope ? 'This certification does not have a visual walkthrough yet. Hunting is the first SOC walkthrough.' : 'Choose the SOC dashboard to open the Hunting visual walkthrough.'}
        </div>
      )}
    </div>
  );
}
