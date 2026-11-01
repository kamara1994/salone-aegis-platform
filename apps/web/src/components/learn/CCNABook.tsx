'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Search } from 'lucide-react';
import { Button, cx, Input } from '@/components/ui';
import { useLearningPreferences } from '@/state/learning';
import source from '@/content/books/ccna-v8.1.json';

type Question = { id: string; prompt: string; options: string[]; answerIndex: number; explanation: string };
type Lesson = {
  id: string;
  chapterId: string;
  title: string;
  subtitle?: string;
  beginner: { definition?: string; analogy?: string; example?: string; remember?: string; analogyParts?: { analogy: string; meaning: string }[] };
  technical: { definition?: string; explanation?: string; application?: string; remember?: string; deepDive?: string; check?: string };
  why?: string;
  layerContext?: { label?: string; explanation?: string };
  wordHelp?: { term: string; meaning: string }[];
  teaching?: { problem?: string; steps?: { number?: number; text: string }[]; result?: string; method?: string; verify?: string; practicePrompt?: string; evidence?: { command?: string; output?: string; interpretation?: string } };
  teachingGuide?: { concept?: string; mechanism?: string; commonTrap?: string; teachBack?: string };
  masterclass?: { goal?: string; concept?: string; steps?: string[]; worked?: string; diagnosis?: string; challenge?: string };
  depthV8?: { concept?: string; procedure?: string[]; workedExample?: string; verification?: string; commonError?: string };
  commonMistake?: string;
  interview?: { question?: string; sampleAnswer?: string };
  assessments?: { beginner?: Question[]; technical?: Question[] };
  quiz?: Question[];
  learningJourney?: { kind?: string; stages?: string[] };
  navigation?: { previous?: string | null; next?: string | null };
};
type Chapter = { id: string; number: number; title: string; lessonIds: string[] };
type Book = { title: string; version: string; disclaimer?: string; qualityNotice?: string; chapters: Chapter[]; lessons: Lesson[] };

const book = source as unknown as Book;
const progressKey = 'aegis.ccna-book.v8.1';
const stageNames: Record<string, string> = {
  meaning: 'Why it matters',
  'mental-model': 'Mental model',
  mechanism: 'How it works',
  'worked-example': 'Worked example',
  verification: 'Verify and practise',
  troubleshooting: 'Troubleshooting',
  interview: 'Interview practice',
  assessment: 'Quiz',
  overview: 'Review overview',
};

function savedBookProgress(): { lessonId?: string; completed: string[] } {
  try {
    const saved = JSON.parse(window.localStorage.getItem(progressKey) ?? '{}') as { lessonId?: string; completed?: string[] };
    return { lessonId: saved.lessonId, completed: Array.isArray(saved.completed) ? saved.completed : [] };
  } catch {
    return { completed: [] };
  }
}

function Panel({ title, children, tone = 'normal' }: { title: string; children?: ReactNode; tone?: 'normal' | 'remember' }) {
  if (!children) return null;
  return <section className={cx('space-y-2 rounded-lg border p-4', tone === 'remember' ? 'border-healthy/30 bg-healthy/8' : 'border-line bg-pane')}><h3 className="text-[14px] font-semibold">{title}</h3><div className="space-y-2 text-[14px] leading-relaxed text-text">{children}</div></section>;
}

export function CCNABook() {
  const { teach } = useLearningPreferences();
  const [lessonId, setLessonId] = useState('');
  const [stageIndex, setStageIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [completed, setCompleted] = useState<string[]>([]);
  const level = teach === 'technical' ? 'technical' : 'beginner';

  useEffect(() => {
    const saved = savedBookProgress();
    setLessonId(book.lessons.some((lesson) => lesson.id === saved.lessonId) ? saved.lessonId! : book.lessons[0]?.id ?? '');
    setCompleted(saved.completed);
  }, []);

  const lesson = book.lessons.find((entry) => entry.id === lessonId) ?? book.lessons[0];
  const chapter = book.chapters.find((entry) => entry.id === lesson?.chapterId);
  const stages = lesson?.learningJourney?.stages?.length ? lesson.learningJourney.stages : ['meaning', 'mental-model', 'mechanism', 'worked-example', 'verification', 'troubleshooting', 'interview', 'assessment'];
  const safeStageIndex = Math.min(stageIndex, stages.length - 1);
  const stage = stages[safeStageIndex];
  const chapterLessons = useMemo(() => {
    const search = query.trim().toLowerCase();
    const byId = new Map(book.lessons.map((entry) => [entry.id, entry]));
    return book.chapters.map((item) => ({
      chapter: item,
      lessons: item.lessonIds.map((id) => byId.get(id)).filter((entry): entry is Lesson => !!entry && (entry.id === lessonId || !search || `${entry.id} ${entry.title} ${item.title} ${(entry as Lesson & { tags?: string[] }).tags?.join(' ') ?? ''}`.toLowerCase().includes(search))),
    })).filter((item) => item.lessons.length > 0);
  }, [query, lessonId]);
  const assessment = lesson?.assessments?.[level]?.length ? lesson.assessments[level]! : lesson?.quiz ?? [];
  const correctCount = assessment.filter((question) => answers[question.id] === question.answerIndex).length;
  const allAnswered = assessment.length > 0 && assessment.every((question) => answers[question.id] !== undefined);
  const progressPercent = book.lessons.length ? Math.round(completed.length / book.lessons.length * 100) : 0;

  useEffect(() => {
    if (!lessonId) return;
    try { window.localStorage.setItem(progressKey, JSON.stringify({ lessonId, completed })); } catch { /* local progress is optional */ }
  }, [lessonId, completed]);
  useEffect(() => {
    setAnswers({});
    setSubmitted(false);
  }, [level, lessonId]);

  const openLesson = (id: string) => {
    setLessonId(id);
    setStageIndex(0);
    setAnswers({});
    setSubmitted(false);
    setShowAnswer(false);
  };
  const setStage = (index: number) => {
    setStageIndex(Math.max(0, Math.min(index, stages.length - 1)));
    setAnswers({});
    setSubmitted(false);
    setShowAnswer(false);
  };
  const submitQuiz = () => {
    setSubmitted(true);
    if (correctCount / assessment.length >= 0.75) setCompleted((current) => current.includes(lesson.id) ? current : [...current, lesson.id]);
  };

  if (!lesson) return <div className="p-4 text-muted">The CCNA book could not be loaded.</div>;

  const nextLesson = lesson.navigation?.next ? book.lessons.findIndex((entry) => entry.id === lesson.navigation?.next) : -1;
  const beginner = lesson.beginner;
  const technical = lesson.technical;
  const teaching = lesson.teaching;
  const guide = lesson.teachingGuide;
  const masterclass = lesson.masterclass;
  const depth = lesson.depthV8;

  return <div className="min-w-0 space-y-4" data-testid="ccna-course-book">
    <section className="space-y-3 rounded-xl border border-line bg-pane p-3 sm:p-4" aria-label="CCNA topic selector">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-action">Learn by topic · CCNA · v{book.version}</p>
          <h2 className="mt-1 text-[17px] font-semibold">{book.title}</h2>
        </div>
        <div className="w-full max-w-xs sm:w-64">
          <p className="mb-1 flex justify-between text-[11px] text-muted"><span>Course progress</span><span>{completed.length}/{book.lessons.length} · {progressPercent}%</span></p>
          <div className="h-1.5 overflow-hidden rounded-full bg-pane-2" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100} aria-label="Book progress"><div className="h-full bg-action" style={{ width: `${progressPercent}%` }} /></div>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(260px,1fr)_minmax(220px,320px)]">
        <label className="min-w-0">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">Choose a topic</span>
          <select value={lesson.id} onChange={(event) => { openLesson(event.target.value); setQuery(''); }} aria-label="Choose a CCNA topic" className="h-10 w-full rounded-md border border-line-strong bg-ink px-3 text-[13px] text-text focus:border-action focus:outline-none" data-testid="ccna-book-topic">
            {chapterLessons.map(({ chapter: section, lessons }) => <optgroup key={section.id} label={`Chapter ${section.number}: ${section.title}`}>
              {lessons.map((entry) => <option key={entry.id} value={entry.id}>{completed.includes(entry.id) ? '✓ ' : ''}{entry.id} · {entry.title}</option>)}
            </optgroup>)}
          </select>
        </label>
        <label className="relative min-w-0">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">Find a topic</span>
          <Search className="pointer-events-none absolute top-[30px] left-3 size-4 text-faint" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chapters or topics…" aria-label="Search CCNA topics" className="!h-10 !w-full pl-9" data-testid="ccna-book-search" />
        </label>
      </div>
      {query.trim() && <p className="text-[11px] text-muted" aria-live="polite">The topic menu is filtered by your search.</p>}
    </section>

    <main className="min-w-0 space-y-4" data-testid="ccna-book-reader">
      <header className="rounded-xl border border-line bg-pane p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted"><span>Chapter {chapter?.number ?? '—'} of {book.chapters.length}</span><span>·</span><span>Lesson {lesson.id}</span><span>·</span><span>{stageNames[stage] ?? stage}</span><span className="ml-auto rounded border border-line px-2 py-1">{level === 'beginner' ? 'Beginner' : 'Technical / Expert'}</span></div>
        <h1 className="mt-2 text-[24px] font-semibold" data-testid="ccna-book-title">{lesson.title}</h1>
        {lesson.subtitle && <p className="mt-1 text-[14px] text-muted">{lesson.subtitle}</p>}
        {stage !== 'assessment' && <p className="mt-3 text-[15px] leading-relaxed">{level === 'beginner' ? beginner.definition : technical.definition}</p>}
      </header>

      <nav className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-pane p-1" aria-label="Lesson steps">
        {stages.map((name, index) => <button type="button" key={`${name}-${index}`} onClick={() => setStage(index)} aria-current={index === safeStageIndex ? 'step' : undefined} className={cx('shrink-0 rounded-md px-3 py-2 text-[12px]', index === safeStageIndex ? 'bg-action text-white' : 'text-muted hover:bg-pane-2 hover:text-text')} data-testid={`ccna-book-stage-${name}`}>{index + 1}. {stageNames[name] ?? name}</button>)}
      </nav>

      <article className="space-y-3" aria-live="polite">
        {stage === 'meaning' && <>
          <Panel title="Why this matters"><p>{lesson.why ?? lesson.subtitle}</p></Panel>
          {lesson.layerContext?.label && <p className="text-[12px] text-muted">Network context: <strong className="text-text">{lesson.layerContext.label}</strong> · {lesson.layerContext.explanation}</p>}
          {!!lesson.wordHelp?.length && <details className="rounded-lg border border-line bg-pane px-4 py-3"><summary className="cursor-pointer text-[13px] font-semibold">Terms to know</summary><dl className="mt-3 grid gap-2 sm:grid-cols-2">{lesson.wordHelp.map((item) => <div key={item.term}><dt className="font-mono text-[12px] font-semibold">{item.term}</dt><dd className="text-[13px] text-muted">{item.meaning}</dd></div>)}</dl></details>}
        </>}
        {stage === 'mental-model' && <>
          <Panel title={level === 'beginner' ? 'A familiar way to picture it' : 'How the concept works'}><p>{level === 'beginner' ? beginner.analogy : technical.explanation}</p></Panel>
          {level === 'beginner' && !!beginner.analogyParts?.length && <Panel title="Connect the analogy to the network"><dl className="grid gap-2 sm:grid-cols-2">{beginner.analogyParts.map((item) => <div key={item.analogy}><dt className="font-semibold">{item.analogy}</dt><dd className="text-muted">{item.meaning}</dd></div>)}</dl></Panel>}
          <Panel title="Real-world example"><p>{beginner.example ?? technical.application}</p></Panel>
        </>}
        {stage === 'mechanism' && <>
          <Panel title={level === 'beginner' ? 'The main idea' : 'Mechanism and decision rules'}><p>{level === 'beginner' ? guide?.concept ?? technical.explanation : depth?.concept ?? masterclass?.concept ?? technical.deepDive ?? technical.explanation}</p></Panel>
          {level === 'technical' && technical.deepDive && <Panel title="Technical detail"><p>{technical.deepDive}</p></Panel>}
          {level === 'beginner' && technical.explanation && <Panel title="In network terms"><p>{technical.explanation}</p></Panel>}
          {teaching?.steps?.length ? <Panel title="Walkthrough"><ol className="list-decimal space-y-2 pl-5">{teaching.steps.map((step, index) => <li key={`${step.number ?? index}-${step.text}`}>{step.text}</li>)}</ol></Panel> : null}
        </>}
        {stage === 'worked-example' && <>
          <Panel title="Situation"><p>{teaching?.problem ?? beginner.example}</p></Panel>
          {teaching?.steps?.length ? <Panel title="Work through it"><ol className="list-decimal space-y-2 pl-5">{teaching.steps.map((step, index) => <li key={`${step.number ?? index}-${step.text}`}>{step.text}</li>)}</ol></Panel> : null}
          <Panel title="What the result means"><p>{level === 'technical' ? depth?.workedExample ?? masterclass?.worked ?? teaching?.result : teaching?.result}</p></Panel>
        </>}
        {stage === 'verification' && <>
          <Panel title="Try this"><p>{teaching?.practicePrompt ?? technical.application ?? beginner.example}</p></Panel>
          <Panel title="How to verify"><p>{level === 'technical' ? depth?.verification ?? teaching?.verify : teaching?.verify ?? teaching?.method}</p></Panel>
          {teaching?.evidence?.output && <details className="rounded-lg border border-line bg-pane px-4 py-3"><summary className="cursor-pointer text-[13px] font-semibold">Example device evidence</summary>{teaching.evidence.command && <pre className="mt-3 overflow-auto rounded bg-ink p-3 font-mono text-[12px]">{teaching.evidence.command}</pre>}<pre className="mt-2 overflow-auto rounded bg-ink p-3 font-mono text-[12px]">{teaching.evidence.output}</pre>{teaching.evidence.interpretation && <p className="mt-2 text-[13px] text-muted">{teaching.evidence.interpretation}</p>}</details>}
        </>}
        {stage === 'troubleshooting' && <>
          <Panel title="Common mistake"><p>{level === 'technical' ? depth?.commonError ?? masterclass?.diagnosis ?? guide?.commonTrap ?? lesson.commonMistake : guide?.commonTrap ?? lesson.commonMistake}</p></Panel>
          <Panel title="Evidence and method"><p>{teaching?.method ?? technical.check}</p></Panel>
          <Panel title="Verify the fix"><p>{teaching?.verify ?? depth?.verification}</p></Panel>
        </>}
        {stage === 'interview' && <>
          <Panel title="Explain it in your own words"><p>{masterclass?.challenge ?? guide?.teachBack ?? lesson.interview?.question}</p></Panel>
          <Button type="button" variant="secondary" onClick={() => setShowAnswer((current) => !current)}>{showAnswer ? 'Hide sample response' : 'Show sample response'}</Button>
          {showAnswer && <Panel title="Sample response"><p>{lesson.interview?.sampleAnswer ?? technical.explanation}</p></Panel>}
        </>}
        {stage === 'overview' && <Panel title="Chapter review"><p>{lesson.why ?? lesson.subtitle ?? 'Review the chapter concepts, then complete the assessment.'}</p></Panel>}
        {stage === 'assessment' && <section className="space-y-3 rounded-xl border border-line bg-pane p-4" data-testid="ccna-book-assessment">
          <div><h2 className="text-[17px] font-semibold">{lesson.learningJourney?.kind === 'assessment' ? lesson.title : 'Topic check'}</h2><p className="text-[13px] text-muted">{assessment.length} questions · answer every question, then submit to see explanations.</p></div>
          {assessment.map((question, questionIndex) => <fieldset key={question.id} disabled={submitted} className="space-y-2 border-b border-line pb-3 last:border-0" data-testid={`ccna-book-question-${question.id}`}>
            <legend className="pb-1 text-[14px] font-medium">{questionIndex + 1}. {question.prompt}</legend>
            <div className="grid gap-1.5">{question.options.map((option, optionIndex) => <label key={optionIndex} className={cx('flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-[13px]', answers[question.id] === optionIndex ? 'border-action bg-action/10' : 'border-line hover:border-line-strong', submitted && optionIndex === question.answerIndex && 'border-healthy bg-healthy/10', submitted && answers[question.id] === optionIndex && optionIndex !== question.answerIndex && 'border-down bg-down/10')}><input type="radio" name={question.id} checked={answers[question.id] === optionIndex} onChange={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))} className="mt-0.5 accent-blue-500" />{option}</label>)}</div>
            {submitted && <p className="text-[12.5px] text-muted">{question.explanation}</p>}
          </fieldset>)}
          {submitted ? <div className="flex flex-wrap items-center gap-3"><p className="font-semibold" data-testid="ccna-book-score">Score: {correctCount}/{assessment.length} · {Math.round(correctCount / Math.max(assessment.length, 1) * 100)}%</p><Button type="button" onClick={() => { setAnswers({}); setSubmitted(false); }}>Try again</Button></div> : <Button type="button" variant="primary" disabled={!allAnswered} onClick={submitQuiz}>Submit answers</Button>}
        </section>}
        {stageNames[stage] && lesson.beginner.remember && stage === 'meaning' && <Panel title="Remember" tone="remember"><p>{level === 'beginner' ? beginner.remember : technical.remember ?? beginner.remember}</p></Panel>}
      </article>

      <footer className="flex items-center justify-between border-t border-line pt-3">
        <Button type="button" variant="secondary" onClick={() => safeStageIndex > 0 ? setStage(safeStageIndex - 1) : lesson.navigation?.previous && openLesson(lesson.navigation.previous)} disabled={safeStageIndex === 0 && !lesson.navigation?.previous}><ArrowLeft className="size-4" />Back</Button>
        <span className="hidden text-[12px] text-muted sm:inline">{safeStageIndex + 1} of {stages.length} · progress saves on this computer</span>
        {safeStageIndex < stages.length - 1 ? <Button type="button" variant="primary" onClick={() => setStage(safeStageIndex + 1)}>Next <ArrowRight className="size-4" /></Button> : lesson.navigation?.next && nextLesson >= 0 ? <Button type="button" variant="primary" onClick={() => openLesson(lesson.navigation!.next!)}>Next lesson <ArrowRight className="size-4" /></Button> : <Button type="button" variant="primary" onClick={() => openLesson(book.lessons[0].id)}><BookOpen className="size-4" />Back to start</Button>}
      </footer>
      <section className="rounded-lg border border-degraded/30 bg-degraded/5 px-4 py-3 text-[12px] text-muted" aria-label="Course quality notice"><p className="font-semibold text-text">Study draft · independent educational content</p><p className="mt-1">{book.qualityNotice}</p><p className="mt-1">{book.disclaimer}</p></section>
    </main>
  </div>;
}
