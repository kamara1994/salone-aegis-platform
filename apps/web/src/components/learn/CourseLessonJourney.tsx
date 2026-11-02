'use client';

import { type ReactNode } from 'react';

type Level = 'beginner' | 'technical';
type LessonContent = {
  id: string;
  title: string;
  why?: string;
  beginner: { definition?: string; analogy?: string; example?: string; remember?: string; analogyParts?: { analogy: string; meaning: string }[] };
  technical: { definition?: string; explanation?: string; application?: string; remember?: string; deepDive?: string; check?: string };
  teaching?: { problem?: string; steps?: { text: string }[]; result?: string; method?: string; verify?: string; evidence?: { command?: string; output?: string; interpretation?: string } };
  teachingGuide?: { concept?: string; mechanism?: string; commonTrap?: string; teachBack?: string };
  masterclass?: { goal?: string; concept?: string; steps?: string[]; worked?: string; diagnosis?: string };
  depthV8?: { concept?: string; procedure?: string[]; workedExample?: string; verification?: string; commonError?: string };
  interview?: { question?: string; sampleAnswer?: string };
  wordHelp?: { term: string; meaning: string }[];
};

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-lg border border-line-strong bg-pane p-5"><h2 className="mb-3 text-[17px] font-semibold text-text">{title}</h2><div className="space-y-3 text-[15px] leading-7 text-text">{children}</div></section>;
}

/** One sequence for the full book; each page draws on the lesson's own scenario and evidence. */
export function CourseLessonJourney({ lesson, stage, level, reviewTopics = [] }: { lesson: LessonContent; stage: string; level: Level; reviewTopics?: LessonContent[] }) {
  const beginner = level === 'beginner';
  const teaching = lesson.teaching;
  const guide = lesson.teachingGuide;
  const depth = lesson.depthV8;
  const example = teaching?.problem;

  if (stage === 'meaning') return <>
    <Card title="The real problem"><p>{example ?? lesson.why}</p><p>{beginner ? lesson.beginner.definition : lesson.technical.definition}</p></Card>
    <Card title="Why this matters"><p>{lesson.why}</p><p className="text-[13px] text-muted">The following pages explain the moving parts before showing how they behave in this situation.</p></Card>
    {!!lesson.wordHelp?.length && <details className="rounded-lg border border-line-strong bg-pane p-4"><summary className="cursor-pointer font-semibold text-text">Words you may need</summary><dl className="mt-3 grid gap-3 sm:grid-cols-2">{lesson.wordHelp.map((item) => <div key={item.term}><dt className="font-semibold text-text">{item.term}</dt><dd className="text-[13px] text-muted">{item.meaning}</dd></div>)}</dl></details>}
  </>;

  if (stage === 'mental-model') return <>
    <Card title={beginner ? 'Build a picture of it' : 'Build the technical model'}><p>{beginner ? lesson.beginner.analogy : lesson.technical.explanation}</p></Card>
    {beginner && !!lesson.beginner.analogyParts?.length && <Card title="Translate the picture into network terms"><dl className="grid gap-3 sm:grid-cols-2">{lesson.beginner.analogyParts.map((item) => <div key={item.analogy}><dt className="font-semibold">{item.analogy}</dt><dd className="text-muted">{item.meaning}</dd></div>)}</dl></Card>}
    <Card title={beginner ? 'Now leave the comparison behind' : 'Operational meaning'}><p>{beginner ? lesson.beginner.example ?? guide?.concept : guide?.mechanism ?? lesson.technical.application}</p></Card>
  </>;

  if (stage === 'mechanism') return <>
    <Card title={beginner ? 'What actually happens' : 'Mechanism and decision rule'}><p>{beginner ? guide?.concept ?? lesson.technical.explanation : depth?.concept ?? lesson.masterclass?.concept ?? lesson.technical.explanation}</p></Card>
    {beginner && guide?.mechanism && <Card title="Connect the steps"><p>{guide.mechanism}</p></Card>}
    {!beginner && lesson.masterclass?.concept && lesson.masterclass.concept !== depth?.concept && <Card title="The wider model"><p>{lesson.masterclass.concept}</p></Card>}
    {!beginner && lesson.technical.deepDive && <Card title="A detail that changes decisions"><p>{lesson.technical.deepDive}</p></Card>}
    {!beginner && !!depth?.procedure?.length && <Card title="Follow the process"><ol className="list-decimal space-y-2 pl-6">{depth.procedure.map((step, index) => <li key={index}>{step}</li>)}</ol></Card>}
  </>;

  if (stage === 'worked-example') return <>
    <Card title="Work through the same situation"><p className="text-[13px] text-muted">Recall the problem: {example}</p>{teaching?.steps?.length ? <ol className="list-decimal space-y-3 pl-6">{teaching.steps.map((step, index) => <li key={index}>{step.text}</li>)}</ol> : <p>{lesson.masterclass?.worked ?? lesson.technical.application}</p>}</Card>
    <Card title="What the result proves"><p>{teaching?.result ?? lesson.masterclass?.worked}</p><p className="text-[13px] text-muted">This result explains the immediate outcome. The next page separates observed evidence from assumptions that still need checking.</p></Card>
    {!beginner && lesson.masterclass?.worked && lesson.masterclass.worked !== teaching?.result && <Card title="A second way to see it"><p>{lesson.masterclass.worked}</p></Card>}
  </>;

  if (stage === 'verification') return <>
    <Card title={beginner ? 'How to check your result' : 'Verification evidence'}><p>{beginner ? teaching?.verify ?? lesson.technical.application : depth?.verification ?? teaching?.verify ?? lesson.technical.application}</p>{teaching?.evidence?.command && <pre className="overflow-auto rounded-md bg-ink p-3 font-mono text-[12px] leading-6">{teaching.evidence.command}</pre>}{teaching?.evidence?.output && <pre className="overflow-auto rounded-md bg-ink p-3 font-mono text-[12px] leading-6">{teaching.evidence.output}</pre>}{teaching?.evidence?.interpretation && <p><strong>Read the evidence:</strong> {teaching.evidence.interpretation}</p>}</Card>
    <Card title="Before you move on"><p>A single successful check establishes only the condition it observes. The path may still fail at another link, interface, protocol, or policy. Read the output alongside the original symptom and the end-to-end result.</p></Card>
  </>;

  if (stage === 'troubleshooting') return <>
    <Card title="A mistake to catch"><p>{beginner ? guide?.commonTrap ?? depth?.commonError : depth?.commonError ?? guide?.commonTrap}</p></Card>
    <Card title="Narrow it with evidence"><p>{teaching?.method ?? lesson.masterclass?.diagnosis ?? lesson.technical.check}</p><p className="text-[13px] text-muted">Compare the observed result with the expected state, then inspect the nearest point where they differ. Change one justified setting and verify again.</p></Card>
  </>;

  if (stage === 'recap') return <>
    <Card title="The idea in one sentence"><p>{beginner ? lesson.beginner.remember : lesson.technical.remember}</p></Card>
    {reviewTopics.length ? <Card title="The chapter in context"><p>{beginner ? lesson.beginner.example : lesson.technical.application}</p><p>These ideas work together: {reviewTopics.map((topic) => topic.title).join(', ')}. The next chapter builds on this foundation.</p></Card> : <>
      <Card title="How the pieces fit"><p>{guide?.mechanism ?? guide?.concept ?? lesson.technical.explanation}</p><p>{teaching?.result ?? lesson.technical.application}</p></Card>
      <Card title="The boundary to remember"><p>{guide?.commonTrap ?? depth?.commonError ?? lesson.technical.deepDive ?? lesson.beginner.example}</p></Card>
    </>}
  </>;

  if (stage === 'overview') return <>
    <Card title="Chapter synthesis"><p>{beginner ? lesson.beginner.definition : lesson.technical.definition}</p><p>{beginner ? lesson.beginner.example : lesson.technical.explanation}</p></Card>
    {reviewTopics.map((topic) => <Card key={topic.id} title={`${topic.id} · ${topic.title}`}><p>{beginner ? topic.beginner.definition : topic.technical.definition}</p><p>{beginner ? topic.beginner.example ?? topic.teachingGuide?.concept : topic.teachingGuide?.mechanism ?? topic.technical.explanation}</p></Card>)}
  </>;

  return null;
}
