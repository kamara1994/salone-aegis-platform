'use client';

import { ArrowLeft, ArrowRight, BookOpenText, CheckCircle2, Crosshair, Maximize2, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Badge, Dialog } from '@/components/ui';
import { topicById, type Topic } from '@/content/topics';

type Callout = { number: string; title: string; explanation: string; pinX: number; pinY: number; targetX: number; targetY: number };

const huntingSteps = [
  {
    title: 'Open Alerts and scope the signal',
    focus: 'Time range · alert context',
    location: 'Security Onion SOC → Alerts',
    image: '/learn/visuals/hunting/screenshots/50_alerts.png',
    source: 'https://docs.securityonion.net/en/2.4/alerts.html',
    callouts: [
      { number: '1', title: 'Set a useful time window', explanation: 'Include the alert and nearby activity in the time picker. Security Onion displays these times in UTC, so keep that in mind when matching other evidence.', pinX: 1230, pinY: 135, targetX: 1160, targetY: 183 },
      { number: '2', title: 'Read the alert rule and severity', explanation: 'Use the rule name, severity, and summary to understand what triggered. A high severity is a lead to validate, not proof by itself.', pinX: 1450, pinY: 145, targetX: 1640, targetY: 176 },
      { number: '3', title: 'Open the event row', explanation: 'Expand the matching row to inspect the individual event. Compare its timestamp, sensor, source and destination, ports, and protocol with the exercise question.', pinX: 260, pinY: 365, targetX: 276, targetY: 438 },
    ],
    record: 'Only if the lab worksheet or a case requires it, note the alert name or ID, UTC time, affected host, and the specific reason it needs checking. Use these details to scope your Hunt search.',
  },
  {
    title: 'Use guided questions as leads',
    focus: 'Guided Analysis · query results',
    location: 'Security Onion SOC → Alerts → Guided Analysis (if available)',
    image: '/learn/visuals/hunting/screenshots/51_alerts_play.png',
    source: 'https://docs.securityonion.net/en/2.4/alerts.html#guided-analysis',
    callouts: [
      { number: '1', title: 'Read one focused question', explanation: 'Start with the question and context. Check the stated data source and date range so you know what evidence its suggested search can find.', pinX: 1040, pinY: 151, targetX: 930, targetY: 184 },
      { number: '2', title: 'Open the query in Hunt', explanation: 'The blue crosshair opens this query in Hunt. Review and adjust it there; treat the suggested question and sample results as leads, not a confirmed finding.', pinX: 394, pinY: 375, targetX: 340, targetY: 335 },
    ],
    record: 'This step is optional. If Guided Analysis is disabled or the exercise does not use it, skip to Hunt. Record a question or query only when it helps answer the lab task or is required in a case.',
  },
  {
    title: 'Narrow and inspect the Hunt results',
    focus: 'Query · time range',
    location: 'Security Onion SOC → Hunt',
    image: '/learn/visuals/hunting/screenshots/56_hunt.png',
    source: 'https://docs.securityonion.net/en/2.4/hunt.html',
    callouts: [
      { number: '1', title: 'Check the active query and filters', explanation: 'Read the OQL query and blue filter chips together; they define what this search includes. Replace the sample values with the host, indicator, or question from your exercise.', pinX: 700, pinY: 231, targetX: 700, targetY: 183 },
      { number: '2', title: 'Set and verify the time range', explanation: 'Make sure the time picker covers the activity you are testing. Start with a focused interval and widen it only when related evidence falls outside it.', pinX: 1500, pinY: 134, targetX: 1460, targetY: 184 },
      { number: '3', title: 'Compare matching events', explanation: 'Compare timestamps, hosts, destinations, and available process or network fields. Check ordinary explanations before calling a pattern suspicious.', pinX: 1600, pinY: 700, targetX: 1300, targetY: 798 },
    ],
    record: 'If the lab asks for a hunt record, include the query/filter, time range, and the event references that support your observation. A repeated pattern alone does not prove command and control.',
  },
  {
    title: 'Inspect packet evidence when the lab requires it',
    focus: 'Connection endpoints · request and response',
    location: 'Security Onion SOC → PCAP (from a matching network event)',
    image: '/learn/visuals/hunting/screenshots/65_pcap_details.png',
    source: 'https://docs.securityonion.net/en/2.4/pcap.html',
    callouts: [
      { number: '1', title: 'Verify the source and destination', explanation: 'Read both endpoint fields before interpreting the stream. Check that the addresses and ports match the network event you pivoted from.', pinX: 1650, pinY: 205, targetX: 1270, targetY: 135 },
      { number: '2', title: 'Compare request and response headers', explanation: 'Read the request headers, then compare the response status, server, date, and content type. These fields explain the exchange without relying on an alert label alone.', pinX: 670, pinY: 356, targetX: 390, targetY: 286 },
      { number: '3', title: 'Treat payload as sensitive evidence', explanation: 'The lower pane is captured content, not something to run. Inspect it only when the exercise requires it. If PCAP or endpoint data is unavailable, state that visibility limit.', pinX: 870, pinY: 650, targetX: 930, targetY: 700 },
    ],
    record: 'Only when requested, note the event/stream reference, endpoints, time, and the relevant field or header. Treat captured payloads as evidence; never execute a downloaded file.',
  },
  {
    title: 'Document the finding and choose the next action',
    focus: 'Case title · comment · evidence',
    location: 'Security Onion SOC → Cases (only when escalation or the lab requires it)',
    image: '/learn/visuals/hunting/screenshots/57_2_cases_create.png',
    source: 'https://docs.securityonion.net/en/2.4/cases.html',
    callouts: [
      { number: '1', title: 'Name the case clearly', explanation: 'Use a concise title that identifies the host or activity and the investigation question. Keep it factual; do not present an unverified hypothesis as confirmed.', pinX: 1100, pinY: 133, targetX: 930, targetY: 111 },
      { number: '2', title: 'Write an evidence-based update', explanation: 'Summarize the time range, data source, query or pivot, and evidence that supports or weakens the hypothesis. State whether the result is suspicious, benign, or inconclusive, and name the next action.', pinX: 1410, pinY: 322, targetX: 1120, targetY: 493 },
      { number: '3', title: 'Link the relevant event', explanation: 'Use the case’s Events area to attach the event that supports the update. Create or update a case only when the exercise or response process calls for it.', pinX: 1290, pinY: 180, targetX: 1150, targetY: 221 },
    ],
    record: 'Use a case comment only when a case is required. Include key evidence references, conclusion, confidence, and next action. If no case or worksheet is required, do not create extra records just to finish the hunt.',
  },
];

function ScreenshotCallouts({ callouts, markerId, accessible = false }: { callouts: Callout[]; markerId: string; accessible?: boolean }) {
  return (
    <svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet" className="pointer-events-none absolute inset-0 size-full" role={accessible ? 'img' : undefined} aria-hidden={accessible ? undefined : true} aria-label={accessible ? `Numbered arrows: ${callouts.map((item) => `${item.number}, ${item.title}: ${item.explanation}`).join('; ')}` : undefined}>
      <defs><marker id={markerId} markerWidth="12" markerHeight="12" refX="10" refY="4" orient="auto"><path d="M0 0 11 4 0 8Z" fill="#ffd44d" /></marker></defs>
      {callouts.map((callout) => {
        const dx = callout.targetX - callout.pinX;
        const dy = callout.targetY - callout.pinY;
        const distance = Math.hypot(dx, dy) || 1;
        const startX = callout.pinX + (dx / distance) * 27;
        const startY = callout.pinY + (dy / distance) * 27;
        return (
          <g key={callout.number}>
            <path d={`M${startX} ${startY} L${callout.targetX} ${callout.targetY}`} fill="none" stroke="#071421" strokeWidth="12" />
            <path d={`M${startX} ${startY} L${callout.targetX} ${callout.targetY}`} fill="none" stroke="#ffd44d" strokeWidth="6" markerEnd={`url(#${markerId})`} />
            <circle cx={callout.pinX} cy={callout.pinY} r="27" fill="#071421" stroke="#ffd44d" strokeWidth="6" />
            <text x={callout.pinX} y={callout.pinY + 9} textAnchor="middle" fontFamily="Arial,sans-serif" fontWeight="700" fontSize="27" fill="#ffffff">{callout.number}</text>
          </g>
        );
      })}
    </svg>
  );
}

function HuntingLesson({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(-1);
  const [zoomOpen, setZoomOpen] = useState(false);
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
            Threat hunting is a deliberate investigation for suspicious activity that routine alerts may have missed. Start with a question, search the right data, test the evidence, then document what you learned. This walkthrough uses real Security Onion screenshots and marks optional steps clearly.
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
            <p className="max-w-4xl text-[14px] leading-6 text-[#edf4fa]">These are real screenshots from Security Onion’s documentation, annotated for practice. They show example data, not your live system. Each arrow number matches a bright explanation directly below the screenshot.</p>
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

          <div className="overflow-hidden rounded-xl border border-line-strong bg-[#071421] shadow-lg">
            <div className="relative aspect-video w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current.image} alt={`Security Onion SOC screenshot with numbered arrows for ${current.focus}`} className="block size-full object-fill" />
              <ScreenshotCallouts callouts={current.callouts} markerId={`hunting-arrow-${step}`} accessible />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-[#0b1b29] px-3 py-2">
              <p className="text-[12px] text-[#dce8f4]">Screenshot: <a className="underline decoration-[#8bd8ff] underline-offset-2 hover:text-white" href={current.source} target="_blank" rel="noreferrer">Security Onion Solutions documentation 2.4</a> · <a className="underline decoration-[#8bd8ff] underline-offset-2 hover:text-white" href="https://docs.securityonion.net/en/2.4/about.html#license" target="_blank" rel="noreferrer">CC BY 4.0</a> · teaching arrows and notes by AEGIS.</p>
              <button onClick={() => setZoomOpen(true)} className="inline-flex items-center gap-1.5 rounded border border-line-strong px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-pane-2" aria-label="Enlarge screenshot">
                <Maximize2 className="size-3.5" /> Enlarge screenshot
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-line-strong bg-pane p-4 md:p-5" data-testid="hunting-step-notes">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{current.location}</Badge>
              <span className="text-[13px] font-medium text-white">Focus: {current.focus}</span>
            </div>
            <h2 className="mt-3 text-[17px] font-semibold text-white">Follow the numbered arrows</h2>
            <ol className="mt-2 grid gap-2 text-[15px] leading-6 text-[#f0f5fa] md:grid-cols-2">
              {current.callouts.map((callout) => (
                <li key={callout.number} className="flex items-start gap-3 rounded-md border border-line bg-ink/35 p-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#ffd44d] text-[13px] font-bold text-[#081725]">{callout.number}</span>
                  <span><strong className="text-white">{callout.title}.</strong> {callout.explanation}</span>
                </li>
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
          <Dialog open={zoomOpen} onClose={() => setZoomOpen(false)} title={`${current.title} · Security Onion screenshot`} wide>
            <div className="relative mx-auto aspect-video w-[min(92vw,1800px)] max-w-full overflow-hidden rounded-md bg-[#071421]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current.image} alt={`Security Onion screenshot with numbered arrows for ${current.focus}`} className="block size-full object-fill" />
              <ScreenshotCallouts callouts={current.callouts} markerId={`hunting-zoom-arrow-${step}`} />
            </div>
            <p className="mt-2 text-[12px] text-[#dce8f4]">Security Onion Solutions documentation 2.4 · <a className="underline decoration-[#8bd8ff] underline-offset-2" href="https://docs.securityonion.net/en/2.4/about.html#license" target="_blank" rel="noreferrer">CC BY 4.0</a> · annotations by AEGIS.</p>
          </Dialog>
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
            {['Review the alert', 'Guided Analysis (optional)', 'Search and compare in Hunt', 'Inspect PCAP if needed', 'Document in Cases if required'].map((item, index) => (
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
