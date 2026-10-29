'use client';

import { ArrowLeft, ArrowRight, BookOpenText, CheckCircle2, Crosshair, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui';
import { topicById, type Topic } from '@/content/topics';

const huntingSteps = [
  {
    title: 'Open Alerts and scope the signal',
    focus: 'Severity · source host · timestamp',
    location: 'Security Onion SOC → Alerts',
    image: '/learn/visuals/hunting/01-alert-context.svg',
    actions: [
      'Set the time picker to include the alert and a little activity before and after it.',
      'Open the alert details. Check the rule name, severity, timestamp, sensor, source and destination, ports, and protocol.',
      'Decide what you need to validate. An alert is a lead; it is not a verdict.',
    ],
    record: 'If the lab worksheet asks for notes or you are opening a case, record the alert ID, UTC time, source host, and the reason it caught your attention. Otherwise, keep these details as your search scope.',
  },
  {
    title: 'Pivot into Hunt with a testable question',
    focus: 'Hunt query · time range',
    location: 'Security Onion SOC → Hunt',
    image: '/learn/visuals/hunting/02-hypothesis-search.svg',
    actions: [
      'From the alert, use its Hunt or crosshair action when available. This carries relevant context into Hunt; otherwise open Hunt from the SOC menu.',
      'Keep the source host and time range narrow at first. Expand them only when the first results suggest a reason.',
      'Ask one answerable question: “Did this host repeatedly contact the same uncommon external destination?”',
    ],
    record: 'Record the question and time range only when the exercise requires a hunt log or case. Do not copy credentials, unrelated personal data, or whole event payloads into notes.',
  },
  {
    title: 'Compare the matching events',
    focus: 'Destination · timing · event count',
    location: 'Security Onion SOC → Hunt results',
    image: '/learn/visuals/hunting/03-pattern-results.svg',
    actions: [
      'Look across the result rows for the same source host and destination. Check the event count and whether the destination is unusual for this environment.',
      'Compare timestamps and connection duration or byte counts if those fields are present. Regular intervals can be a beaconing clue.',
      'Check for normal explanations such as approved agents, update services, monitoring, or scheduled business applications.',
    ],
    record: 'If asked to document the pattern, note the destination, number of events, time span, and the field(s) that support your observation. A repeated pattern alone does not prove command and control.',
  },
  {
    title: 'Check endpoint evidence when it exists',
    focus: 'Process · parent · account',
    location: 'Security Onion SOC → Hunt, then endpoint/host telemetry if available',
    image: '/learn/visuals/hunting/04-host-pivot.svg',
    actions: [
      'Keep the same host and time window while pivoting. Look for a process or user event that lines up with the network connection.',
      'If endpoint telemetry is available, inspect the process path, parent process, account, signer, and command line. Compare with known-good software and the host baseline.',
      'If the lab has no endpoint data, stop at the network evidence and note the visibility gap. Do not invent a process or assume the connection is malicious.',
    ],
    record: 'Record the process and user only when endpoint evidence is present and the lab asks for it. Preserve the event reference or timestamp so another analyst can find the same evidence.',
  },
  {
    title: 'Document the finding and choose the next action',
    focus: 'Evidence · confidence · disposition',
    location: 'Security Onion SOC → Cases (only when escalation or the lab requires it)',
    image: '/learn/visuals/hunting/05-findings.svg',
    actions: [
      'Summarize the hypothesis, data source, query or pivot, time range, and evidence that supports or weakens the idea.',
      'State a measured conclusion: suspicious, benign, or inconclusive. Name what is still unknown.',
      'Create or update a Case only when the lab calls for escalation or your response process requires it. Follow local evidence and containment policy.',
    ],
    record: 'For a required case note, include evidence references, your conclusion and confidence, and the next owner/action. If no case or worksheet is required, do not create extra records just to complete the hunt.',
  },
];

function HuntingLesson({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(-1);
  const current = huntingSteps[step];

  return (
    <section className="mx-auto max-w-7xl space-y-3" data-testid="hunting-visual-lesson">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[14px] text-[#dce8f4] hover:text-white">
        <ArrowLeft className="size-4" /> All image lessons
      </button>

      {step < 0 ? (
        <div className="rounded-xl border border-line-strong bg-pane p-5 md:p-7" data-testid="hunting-lesson-intro">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>SOC · Guided visual lesson</Badge>
            <span className="text-[13px] text-[#d0deeb]">About 12 minutes · 5 steps</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Threat hunting</h1>
          <p className="mt-2 max-w-5xl text-[17px] leading-7 text-[#f0f5fa]">
            Threat hunting is a deliberate investigation for suspicious activity that routine alerts may have missed. Start with a question, search the right data, test the evidence, then document what you learned. This walkthrough follows the Security Onion SOC workflow and marks optional steps clearly.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <article className="rounded-lg border border-line bg-ink/40 p-4">
              <h2 className="flex items-center gap-2 text-[16px] font-semibold text-white"><BookOpenText className="size-4 text-action" /> What you’ll learn</h2>
              <ul className="mt-2 list-inside list-disc space-y-1.5 text-[15px] leading-6 text-[#e8f0f7]">
                <li>Turn an alert or threat idea into a testable hypothesis.</li>
                <li>Scope searches by host, data source, and time.</li>
                <li>Recognize patterns worth investigating without treating them as proof.</li>
                <li>Pivot between network and endpoint evidence, then document a defensible finding.</li>
              </ul>
            </article>
            <article className="rounded-lg border border-line bg-ink/40 p-4">
              <h2 className="flex items-center gap-2 text-[16px] font-semibold text-white"><Crosshair className="size-4 text-action" /> What to focus on while hunting</h2>
              <ul className="mt-2 list-inside list-disc space-y-1.5 text-[15px] leading-6 text-[#e8f0f7]">
                <li><strong className="text-white">Scope:</strong> which host, account, data source, and time window?</li>
                <li><strong className="text-white">Baseline:</strong> what is normal for this host or user?</li>
                <li><strong className="text-white">Connections:</strong> do time, process, destination, and behavior line up?</li>
                <li><strong className="text-white">Evidence:</strong> can another source confirm or disprove the lead?</li>
              </ul>
            </article>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-action/10 px-4 py-3">
            <p className="max-w-4xl text-[14px] leading-6 text-[#edf4fa]">These are simulated Security Onion SOC training screens, not a live system. Each image highlights one or two details; the larger notes below each image tell you what to do and when recording is actually needed.</p>
            <button onClick={() => setStep(0)} className="inline-flex items-center gap-2 rounded-md bg-action px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110" data-testid="hunting-start">
              Start step 1 <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
      ) : current ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-wide text-[#65c9ff]">Step {step + 1} of {huntingSteps.length}</p>
              <h1 className="mt-1 text-2xl font-semibold text-white">{current.title}</h1>
            </div>
            <button onClick={() => setStep(-1)} className="inline-flex items-center gap-1.5 rounded-md border border-line-strong px-3 py-2 text-[13px] text-[#e7eff6] hover:text-white">
              <RotateCcw className="size-3.5" /> Lesson overview
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-line-strong bg-[#071421] shadow-lg" aria-label={`Simulated screenshot from ${current.location}`}>
            {/* SVG screenshots are locally authored to mirror SOC workflow while keeping labels and arrows crisp. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.image} alt={`Simulated Security Onion SOC screen: ${current.focus}`} className="mx-auto block h-auto max-h-[34vh] w-full object-contain" />
          </div>

          <div className="rounded-xl border border-line-strong bg-pane p-4 md:p-5" data-testid="hunting-step-notes">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{current.location}</Badge>
              <span className="text-[13px] font-medium text-white">Focus: {current.focus}</span>
            </div>
            <h2 className="mt-3 text-[17px] font-semibold text-white">What to do in this step</h2>
            <ol className="mt-2 grid gap-2 text-[15px] leading-6 text-[#f0f5fa] md:grid-cols-2">
              {current.actions.map((action, index) => (
                <li key={action} className="flex gap-2.5 rounded-md border border-line bg-ink/35 p-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-action/25 text-[12px] font-bold text-white">{index + 1}</span><span>{action}</span></li>
              ))}
            </ol>
            <div className="mt-3 rounded-md border border-[#3b6682] bg-[#102b40] p-3">
              <p className="text-[13px] font-bold uppercase tracking-wide text-[#8bd8ff]">Notes · only when the lab or case needs them</p>
              <p className="mt-1 text-[14px] leading-6 text-white">{current.record}</p>
            </div>
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
