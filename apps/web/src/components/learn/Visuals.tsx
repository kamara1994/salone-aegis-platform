'use client';

import { ArrowLeft, ArrowRight, BookOpenText, CheckCircle2, Crosshair, Maximize2, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { Badge, Dialog } from '@/components/ui';
import { topicById, type Topic } from '@/content/topics';

type Callout = { number: string; label: string; boxX: number; boxY: number; width: number; targetX: number; targetY: number };

const huntingSteps = [
  {
    title: 'Open Alerts and scope the signal',
    focus: 'Severity · alert details',
    location: 'Security Onion SOC → Alerts',
    image: '/learn/visuals/hunting/screenshots/50_alerts.png',
    source: 'https://docs.securityonion.net/en/2.4/alerts.html',
    callouts: [
      { number: '1', label: 'Read the rule and severity', boxX: 710, boxY: 270, width: 390, targetX: 1195, targetY: 438 },
      { number: '2', label: 'Expand the alert row', boxX: 270, boxY: 840, width: 345, targetX: 276, targetY: 438 },
    ],
    actions: [
      'In Security Onion, select Alerts. Adjust the time picker so the alert and the surrounding activity are included.',
      'Find the alert row and read its rule name, severity, count, and event module. Expand the row to inspect an individual event.',
      'In the details, check the timestamp, sensor, source and destination IPs, ports, and protocol. Decide what the alert actually supports.',
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
      { number: '1', label: 'Read the question and context', boxX: 590, boxY: 120, width: 420, targetX: 688, targetY: 184 },
      { number: '2', label: 'Open its query in Hunt', boxX: 375, boxY: 332, width: 355, targetX: 340, targetY: 338 },
    ],
    actions: [
      'If Guided Analysis is present, read one question and its context. Check which data source and time range the question uses.',
      'Review the Instant Insight rows. Use the blue crosshair beside a query to open it in Hunt, where you can inspect and adjust the search.',
      'Guided Analysis is experimental and some playbooks may be AI-generated. Treat its questions as leads; validate every conclusion against the event data.',
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
      { number: '1', label: 'Review filters and OQL query', boxX: 495, boxY: 240, width: 430, targetX: 715, targetY: 183 },
      { number: '2', label: 'Confirm the time window', boxX: 1310, boxY: 270, width: 360, targetX: 1460, targetY: 185 },
    ],
    actions: [
      'Check the query text and the blue filter chips. They show which conditions are active. The text in this reference screenshot belongs to its sample data; build your search from your own alert or worksheet.',
      'Confirm the time picker covers the period you are investigating. Start narrow, then widen it only when needed.',
      'Inspect grouped fields and event rows. Compare host, destination, timestamps, event counts, and byte or duration fields when they are available.',
      'Look for ordinary explanations such as approved agents, updates, monitoring, and scheduled business applications before calling a pattern suspicious.',
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
      { number: '1', label: 'Verify both connection endpoints', boxX: 780, boxY: 215, width: 430, targetX: 1300, targetY: 135 },
      { number: '2', label: 'Compare request and response headers', boxX: 1040, boxY: 300, width: 555, targetX: 390, targetY: 386 },
    ],
    actions: [
      'Use the PCAP action from a matching event when it is available and relevant. Verify the source and destination endpoints at the top before reading the stream.',
      'Compare request and response headers, timestamps, and content type. Use the payload view only when the exercise specifically asks you to inspect it.',
      'If endpoint telemetry is also available and the exercise needs it, pivot back to Hunt and search the same host and time window for process or user events.',
      'If the lab does not provide PCAP or endpoint data, skip that branch and state the visibility limit instead of guessing.',
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
      { number: '1', label: 'Give the case a clear title', boxX: 1100, boxY: 86, width: 360, targetX: 660, targetY: 112 },
      { number: '2', label: 'Add a concise evidence-based comment', boxX: 880, boxY: 680, width: 600, targetX: 890, targetY: 505 },
    ],
    actions: [
      'Summarize the hypothesis, data source, query or pivot, time range, and evidence that supports or weakens the idea.',
      'State a measured conclusion: suspicious, benign, or inconclusive. Include what remains unknown and the next owner/action.',
      'Create or update a Case only when the lab calls for escalation or your response process requires it. Add the relevant event or observable; avoid unrelated raw data.',
    ],
    record: 'Use a case comment only when a case is required. Include key evidence references, conclusion, confidence, and next action. If no case or worksheet is required, do not create extra records just to finish the hunt.',
  },
];

function ScreenshotCallouts({ callouts, markerId, accessible = false }: { callouts: Callout[]; markerId: string; accessible?: boolean }) {
  return (
    <svg viewBox="0 0 1920 1080" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 size-full" role={accessible ? 'img' : undefined} aria-hidden={accessible ? undefined : true} aria-label={accessible ? `Numbered callouts: ${callouts.map((item) => item.label).join('; ')}` : undefined}>
      <defs><marker id={markerId} markerWidth="12" markerHeight="12" refX="10" refY="4" orient="auto"><path d="M0 0 11 4 0 8Z" fill="#ffd44d" /></marker></defs>
      {callouts.map((callout) => {
        const anchorX = callout.boxX + callout.width / 2;
        const anchorY = callout.boxY + 60;
        return (
          <g key={callout.number}>
            <path d={`M${anchorX} ${anchorY} L${callout.targetX} ${callout.targetY}`} fill="none" stroke="#081725" strokeWidth="13" />
            <path d={`M${anchorX} ${anchorY} L${callout.targetX} ${callout.targetY}`} fill="none" stroke="#ffd44d" strokeWidth="7" markerEnd={`url(#${markerId})`} />
            <rect x={callout.boxX} y={callout.boxY} width={callout.width} height="76" rx="15" fill="#071421" fillOpacity="0.96" stroke="#ffd44d" strokeWidth="5" />
            <circle cx={callout.boxX + 39} cy={callout.boxY + 38} r="25" fill="#ffd44d" />
            <text x={callout.boxX + 39} y={callout.boxY + 47} textAnchor="middle" fontFamily="Arial,sans-serif" fontWeight="700" fontSize="27" fill="#081725">{callout.number}</text>
            <text x={callout.boxX + 78} y={callout.boxY + 48} fontFamily="Arial,sans-serif" fontWeight="700" fontSize="29" fill="#ffffff">{callout.label}</text>
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
            <p className="max-w-4xl text-[14px] leading-6 text-[#edf4fa]">These are real screenshots from Security Onion’s documentation, annotated for practice. They show example data, not your live system. Each image highlights one or two details; notes below explain what to do and when recording is actually needed.</p>
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
            <div className="relative mx-auto aspect-video max-w-full" style={{ width: 'min(100%, 74vh)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current.image} alt={`Security Onion SOC screenshot with callouts for ${current.focus}`} className="block size-full object-contain" />
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
            <div className="mt-3 grid gap-2 text-[14px] leading-6 text-white sm:grid-cols-2" aria-label="Screenshot callout key">
              {current.callouts.map((callout) => (
                <p key={callout.number} className="flex items-start gap-2 rounded-md border border-line bg-ink/35 p-2.5"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#ffd44d] text-[12px] font-bold text-[#081725]">{callout.number}</span><span>{callout.label}</span></p>
              ))}
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
          <Dialog open={zoomOpen} onClose={() => setZoomOpen(false)} title={`${current.title} · Security Onion screenshot`} wide>
            <div className="relative mx-auto aspect-video max-w-full overflow-hidden rounded-md bg-[#071421]" style={{ width: 'min(100%, 138vh)', maxWidth: '1280px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current.image} alt={`Security Onion screenshot with callouts for ${current.focus}`} className="block size-full object-contain" />
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
