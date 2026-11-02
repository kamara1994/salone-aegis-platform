'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Tags } from 'lucide-react';
import { Button, cx } from '@/components/ui';
import { useBookLesson } from '@/state/bookLesson';
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

/** Toolbar topic picker: type to search all lessons, grouped by chapter. */
export function BookTopicPicker() {
  const { lessonId, open } = useBookLesson();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [completed, setCompleted] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const current = book.lessons.find((l) => l.id === lessonId);
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byId = new Map(book.lessons.map((l) => [l.id, l]));
    return book.chapters
      .map((c) => ({ chapter: c, lessons: c.lessonIds.map((id) => byId.get(id)).filter((l): l is Lesson => !!l && (!q || `${l.id} ${l.title} ${c.title}`.toLowerCase().includes(q))) }))
      .filter((g) => g.lessons.length);
  }, [query]);
  useEffect(() => {
    if (!isOpen) return;
    setCompleted(savedBookProgress().completed);
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [isOpen]);
  const pick = (id: string) => {
    open(id);
    setIsOpen(false);
    setQuery('');
    (document.activeElement as HTMLElement | null)?.blur?.();
  };
  return (
    <div ref={ref} className="relative" data-testid="ccna-book-picker">
      <Tags className="pointer-events-none absolute top-2 left-2 z-10 size-3.5 text-faint" aria-hidden />
      <input
        type="search"
        value={isOpen ? query : current ? `${current.id} · ${current.title}` : ''}
        onFocus={() => {
          setIsOpen(true);
          setQuery('');
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setIsOpen(false);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'Enter' && groups[0]?.lessons[0]) pick(groups[0].lessons[0].id);
        }}
        placeholder={`Choose or search ${book.lessons.length} topics…`}
        aria-label="Search and choose a CCNA topic"
        aria-expanded={isOpen}
        role="combobox"
        className="h-8 w-60 rounded-[6px] border border-line-strong bg-ink pr-2 pl-7 text-[12.5px] placeholder:text-faint focus:border-action focus:outline-none lg:w-80"
        data-testid="ccna-book-topic"
      />
      {isOpen && (
        <div role="listbox" className="absolute top-full left-0 z-50 mt-1 max-h-[70vh] w-[340px] overflow-auto rounded-[8px] border border-line-strong bg-pane p-1 shadow-xl">
          {!groups.length ? (
            <p className="px-3 py-2 text-[12px] text-muted">No matching topics.</p>
          ) : (
            groups.map((g) => (
              <div key={g.chapter.id}>
                <p className="sticky top-0 bg-pane px-2 pt-2 pb-1 text-[10.5px] font-semibold tracking-wide text-faint uppercase">
                  Chapter {g.chapter.number}: {g.chapter.title}
                </p>
                {g.lessons.map((l) => (
                  <button key={l.id} type="button" role="option" aria-selected={l.id === lessonId} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(l.id)} className={cx('flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px] text-text', l.id === lessonId ? 'bg-action/25' : 'hover:bg-pane-2')}>
                    <span className="w-9 shrink-0 text-faint">{l.id}</span>
                    <span className="min-w-0 flex-1">{l.title}</span>
                    {completed.includes(l.id) && <span className="text-healthy" aria-label="done">✓</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Panel({ title, children, tone = 'normal' }: { title: string; children?: ReactNode; tone?: 'normal' | 'remember' }) {
  if (!children) return null;
  return <section className={cx('space-y-2 rounded-lg border p-4', tone === 'remember' ? 'border-healthy/30 bg-healthy/8' : 'border-line bg-pane')}><h3 className="text-[14px] font-semibold">{title}</h3><div className="space-y-2 text-[14px] leading-relaxed text-text">{children}</div></section>;
}

export function CCNABook() {
  const { teach } = useLearningPreferences();
  const lessonId = useBookLesson((b) => b.lessonId);
  const setLessonId = useBookLesson((b) => b.open);
  const [stageIndex, setStageIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [completed, setCompleted] = useState<string[]>([]);
  const level = teach === 'technical' ? 'technical' : 'beginner';

  useEffect(() => {
    const saved = savedBookProgress();
    if (!useBookLesson.getState().lessonId) setLessonId(book.lessons.some((lesson) => lesson.id === saved.lessonId) ? saved.lessonId! : book.lessons[0]?.id ?? '');
    setCompleted(saved.completed);
  }, []);

  const lesson = book.lessons.find((entry) => entry.id === lessonId) ?? book.lessons[0];
  const chapter = book.chapters.find((entry) => entry.id === lesson?.chapterId);
  const stages = lesson?.learningJourney?.stages?.length ? lesson.learningJourney.stages : ['meaning', 'mental-model', 'mechanism', 'worked-example', 'verification', 'troubleshooting', 'interview', 'assessment'];
  const safeStageIndex = Math.min(stageIndex, stages.length - 1);
  const stage = stages[safeStageIndex];
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
  // A lesson picked from the toolbar starts at its first step.
  useEffect(() => {
    setStageIndex(0);
    setShowAnswer(false);
  }, [lessonId]);

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
