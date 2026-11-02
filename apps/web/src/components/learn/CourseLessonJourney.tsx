'use client';

import { useState, type ReactNode } from 'react';
import recallSource from '@/content/books/ccna-recall-v9.json';

type Level = 'beginner' | 'technical';
type LessonContent = {
  id: string;
  title: string;
  why?: string;
  beginner: { definition?: string; analogy?: string; example?: string; remember?: string; analogyParts?: { analogy: string; meaning: string }[] };
  technical: { definition?: string; explanation?: string; application?: string; remember?: string; deepDive?: string; check?: string };
  teaching?: { problem?: string; steps?: { text: string }[]; result?: string; method?: string; verify?: string; evidence?: { command?: string; output?: string; interpretation?: string } };
  teachingGuide?: { concept?: string; mechanism?: string; commonTrap?: string; teachBack?: string };
  masterclass?: { goal?: string; concept?: string; worked?: string; diagnosis?: string; challenge?: string };
  depthV8?: { concept?: string; verification?: string; commonError?: string };
  interview?: { question?: string; sampleAnswer?: string };
  wordHelp?: { term: string; meaning: string }[];
};

type RecallItem = { prompt: string; beginnerAnswer: string; technicalAnswer: string };
const recallBank = recallSource as Record<string, RecallItem[]>;

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-lg border border-line-strong bg-pane p-5"><h2 className="mb-3 text-[17px] font-semibold text-text">{title}</h2><div className="space-y-3 text-[15px] leading-7 text-text">{children}</div></section>;
}

/** One sequence for the full book; each page draws on the lesson's own scenario and evidence. */
export function CourseLessonJourney({ lesson, stage, level }: { lesson: LessonContent; stage: string; level: Level }) {
  const beginner = level === 'beginner';
  const teaching = lesson.teaching;
  const guide = lesson.teachingGuide;
  const depth = lesson.depthV8;
  const example = teaching?.problem;

  if (stage === 'meaning') return <>
    <Card title="The real problem"><p>{example ?? lesson.why}</p><p>{beginner ? lesson.beginner.definition : lesson.technical.definition}</p></Card>
    <Card title="Why this matters"><p>{lesson.why}</p><p className="text-[13px] text-muted">Before going on, decide what you would look for first in this situation. The next steps will test that prediction.</p></Card>
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
    {!beginner && lesson.technical.deepDive && <Card title="A detail that changes decisions"><p>{lesson.technical.deepDive}</p></Card>}
  </>;

  if (stage === 'worked-example') return <>
    <Card title="Work through the same situation"><p className="text-[13px] text-muted">Recall the problem: {example}</p>{teaching?.steps?.length ? <ol className="list-decimal space-y-3 pl-6">{teaching.steps.map((step, index) => <li key={index}>{step.text}</li>)}</ol> : <p>{lesson.masterclass?.worked ?? lesson.technical.application}</p>}</Card>
    <Card title="What the result proves"><p>{teaching?.result ?? lesson.masterclass?.worked}</p><p className="text-[13px] text-muted">Ask which part of the result is observed and which part still needs verification.</p></Card>
  </>;

  if (stage === 'verification') return <>
    <Card title={beginner ? 'How to check your result' : 'Verification evidence'}><p>{beginner ? teaching?.verify ?? lesson.technical.application : depth?.verification ?? teaching?.verify ?? lesson.technical.application}</p>{teaching?.evidence?.command && <pre className="overflow-auto rounded-md bg-ink p-3 font-mono text-[12px] leading-6">{teaching.evidence.command}</pre>}{teaching?.evidence?.output && <pre className="overflow-auto rounded-md bg-ink p-3 font-mono text-[12px] leading-6">{teaching.evidence.output}</pre>}{teaching?.evidence?.interpretation && <p><strong>Read the evidence:</strong> {teaching.evidence.interpretation}</p>}</Card>
    <Card title="Before you move on"><p>Could the same output appear while another part of the network is still wrong? State what this evidence proves and what it does not prove.</p></Card>
  </>;

  if (stage === 'troubleshooting') return <>
    <Card title="A mistake to catch"><p>{beginner ? guide?.commonTrap ?? depth?.commonError : depth?.commonError ?? guide?.commonTrap}</p></Card>
    <Card title="Narrow it with evidence"><p>{teaching?.method ?? lesson.masterclass?.diagnosis ?? lesson.technical.check}</p><p className="text-[13px] text-muted">Return to the original situation and choose the smallest next check that distinguishes this fault from a different one.</p></Card>
  </>;

  if (stage === 'interview') return <>
    <Card title="Explain it without notes"><p>{guide?.teachBack ?? lesson.masterclass?.challenge ?? lesson.interview?.question}</p><details className="rounded-md border border-line p-3"><summary className="cursor-pointer font-semibold">Compare with a model explanation</summary><p className="mt-3">{teaching?.result} {teaching?.verify ?? lesson.interview?.sampleAnswer ?? lesson.technical.explanation}</p></details></Card>
    <Card title="Carry it forward"><p>{lesson.beginner.remember ?? lesson.technical.remember}</p></Card>
  </>;

  if (stage === 'overview') return <Card title="Review the chapter from memory"><p>{beginner ? lesson.beginner.definition : lesson.technical.definition}</p><p>Use the next page to explain several situations from this chapter before looking at the model responses.</p></Card>;

  return null;
}

export function BookRecall({ lessonId, level, onComplete }: { lessonId: string; level: Level; onComplete: () => void }) {
  const items = recallBank[lessonId] ?? [];
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [ratings, setRatings] = useState<Record<number, boolean>>({});
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const item = items[index];
  const finished = items.length > 0 && items.every((_, i) => ratings[i] !== undefined);
  const strong = finished && items.every((_, i) => ratings[i]);

  if (!item) return <p className="text-muted">No review prompts are available for this topic.</p>;
  const rate = (couldExplain: boolean) => {
    const updated = { ...ratings, [index]: couldExplain };
    setRatings(updated);
    setRevealed(false);
    if (index < items.length - 1) setIndex(index + 1);
    else if (items.every((_, i) => updated[i])) onComplete();
  };
  return <section className="space-y-4" data-testid="ccna-book-recall">
    <div><h2 className="text-[18px] font-semibold">Explain it from memory</h2><p className="text-[13px] text-muted">Prompt {index + 1} of {items.length} · Think or speak your answer before revealing the model. This is a self-check; the Practice Exam provides scored questions.</p></div>
    <Card title="Your prompt"><p>{item.prompt}</p><label className="block text-[13px] font-semibold" htmlFor="book-recall-draft">Your explanation (optional if speaking aloud)</label><textarea id="book-recall-draft" value={drafts[index] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [index]: event.target.value }))} rows={3} className="w-full rounded-md border border-line-strong bg-ink p-3 text-[14px] text-text" placeholder="Explain your reasoning before looking at the model…" /></Card>
    {!revealed ? <button type="button" onClick={() => setRevealed(true)} className="rounded-md bg-action px-4 py-2 text-[13px] font-semibold text-white">Show model response</button> : <><Card title="Compare your reasoning with the model">{drafts[index]?.trim() && <div className="rounded-md border border-line p-3"><p className="text-[12px] font-semibold uppercase text-muted">Your explanation</p><p className="whitespace-pre-wrap">{drafts[index]}</p></div>}<div className="rounded-md border border-line p-3"><p className="text-[12px] font-semibold uppercase text-muted">Model response</p><p>{level === 'beginner' ? item.beginnerAnswer : item.technicalAnswer}</p></div></Card><div className="flex flex-wrap gap-2"><button type="button" onClick={() => rate(true)} className="rounded-md border border-healthy px-4 py-2 text-[13px] text-healthy">I could explain it</button><button type="button" onClick={() => rate(false)} className="rounded-md border border-line-strong px-4 py-2 text-[13px] text-text">Review this topic</button></div></>}
    {index > 0 && <button type="button" onClick={() => { setIndex(index - 1); setRevealed(false); }} className="text-[13px] text-action underline">Previous prompt</button>}
    {finished && <div className="flex flex-wrap items-center gap-3"><p role="status" className="text-[13px] text-muted">{strong ? 'You marked every prompt as explained. This lesson is recorded as reviewed.' : 'You marked at least one prompt for review. Revisit the lesson and try again when ready.'}</p><button type="button" onClick={() => { setIndex(0); setRatings({}); setDrafts({}); setRevealed(false); }} className="text-[13px] text-action underline">Retry all prompts</button></div>}
  </section>;
}
