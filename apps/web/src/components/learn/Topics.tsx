'use client';

import { ArrowLeft, ArrowRight, BookOpen, Check, FlaskConical, Gamepad2, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, cx } from '@/components/ui';
import { loadProgress, updateProgress, type Progress } from '@/content/progress';
import { certById, certTopics } from '@/content/certs';
import { useUi } from '@/state/ui';
import { ALL_TOPICS, COURSES, courseTopics, topicById, topicMatches, type CourseId, type TeachLevel, type Topic } from '@/content/topics';

export const LEVELS: { key: TeachLevel; label: string; hint: string }[] = [
  { key: 'simple', label: 'Simple', hint: 'Plain words and an everyday example, like explaining to a 10-year-old' },
  { key: 'technical', label: 'Technical', hint: 'How it works, with the real terms and commands' },
  { key: 'advanced', label: 'Advanced', hint: 'Design choices, edge cases and what professionals watch for' },
];
const sel = 'h-9 rounded-[5px] border border-line-strong bg-ink px-2 text-[13px]';

function labLink(t: Topic) {
  if (t.lab?.workbook) return { href: `/lab?workbook=${t.lab.workbook}`, label: 'Open the guided lab', icon: FlaskConical };
  if (t.lab?.challenge) return { href: `/lab?challenge=${t.lab.challenge}`, label: 'Fix a broken network in the Lab', icon: FlaskConical };
  if (t.lab?.game) return { href: `/games?template=${t.lab.game}`, label: 'Play a scenario', icon: Gamepad2 };
  return null;
}

/** End-of-topic exam: answer every question, then submit for a score with explanations. */
function TopicExam({ t, onScore }: { t: Topic; onScore: (score: number, total: number) => void }) {
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [done, setDone] = useState(false);
  const score = t.quiz.filter((q, k) => picks[k] === q.answer).length;
  return (
    <section className="space-y-3 rounded-[8px] border border-line p-3" data-testid="topic-exam">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-[15px] font-semibold">Check yourself</h3>
        <span className="text-[12px] text-muted">{t.quiz.length} questions. Answer all, then submit.</span>
      </div>
      {t.quiz.map((q, k) => (
        <fieldset key={k} className="space-y-1.5">
          <legend className="text-[14px] font-medium">
            {k + 1}. {q.q}
          </legend>
          <div className="grid gap-1">
            {q.options.map((o, i) => {
              const chosen = picks[k] === i;
              const tone = done ? (i === q.answer ? 'border-healthy bg-healthy/10' : chosen ? 'border-down bg-down/10' : 'border-line opacity-70') : chosen ? 'border-action bg-action/15' : 'border-line hover:border-line-strong';
              return (
                <button key={i} disabled={done} role="radio" aria-checked={chosen} onClick={() => setPicks({ ...picks, [k]: i })} className={cx('rounded-[5px] border px-3 py-1.5 text-left text-[13.5px]', tone)} data-testid={`exam-q${k}-o${i}`}>
                  <span className="mr-2 font-mono text-muted">{String.fromCharCode(65 + i)}</span>
                  {o}
                </button>
              );
            })}
          </div>
          {done && (
            <p className={cx('text-[13px]', picks[k] === q.answer ? 'text-healthy' : 'text-text')}>
              {picks[k] === q.answer ? <Check className="mr-1 inline size-4" /> : <X className="mr-1 inline size-4 text-down" />}
              {q.explain}
            </p>
          )}
        </fieldset>
      ))}
      {done ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold" data-testid="topic-exam-score">
            Score: {score}/{t.quiz.length}
          </p>
          <Button
            size="sm"
            onClick={() => {
              setPicks({});
              setDone(false);
            }}
          >
            Try again
          </Button>
        </div>
      ) : (
        <Button
          variant="primary"
          disabled={Object.keys(picks).length < t.quiz.length}
          onClick={() => {
            setDone(true);
            onScore(score, t.quiz.length);
          }}
          data-testid="topic-exam-submit"
        >
          Submit answers
        </Button>
      )}
    </section>
  );
}

function TopicPage({ t, list: scoped, scopeLabel, level, setLevel, onOpenLesson, onTopic, progress, onScore }: { t: Topic; list?: Topic[]; scopeLabel?: string; level: TeachLevel; setLevel: (l: TeachLevel) => void; onOpenLesson: (id: string) => void; onTopic: (id: string) => void; progress: Progress | null; onScore: (s: number, n: number) => void }) {
  const list = scoped && scoped.some((x) => x.id === t.id) ? scoped : courseTopics(t.course);
  const idx = list.findIndex((x) => x.id === t.id);
  const prev = list[idx - 1];
  const next = list[idx + 1];
  const lab = labLink(t);
  const rec = progress?.topics?.[t.id];
  return (
    <article className="max-w-[860px] space-y-4" data-testid={`topic-${t.id}`}>
      <div>
        <p className="text-[12px] text-muted">
          {list === scoped && scopeLabel ? `${scopeLabel} · ` : ''}
          {COURSES.find((c) => c.id === t.course)?.title} · {t.unit} · topic {idx + 1} of {list.length}
        </p>
        <h2 className="text-[24px] font-semibold" data-testid="topic-title">
          {t.title}
        </h2>
        {rec?.total !== undefined && <Badge tone={(rec.score ?? 0) / rec.total >= 0.8 ? 'good' : 'warn'}>Last exam {rec.score}/{rec.total}</Badge>}
      </div>
      <div className="space-y-1">
        <p className="text-[12px] text-muted">How should I teach this?</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Teaching level">
          {LEVELS.map((l) => (
            <button key={l.key} role="radio" aria-checked={level === l.key} title={l.hint} onClick={() => setLevel(l.key)} className={cx('rounded-[6px] border px-3 py-1.5 text-left text-[13px]', level === l.key ? 'border-action bg-action/15' : 'border-line hover:border-line-strong')} data-testid={`level-${l.key}`}>
              <span className="block font-medium">{l.label}</span>
              <span className="block max-w-[220px] text-[11px] text-muted">{l.hint}</span>
            </button>
          ))}
        </div>
      </div>
      <section className="rounded-[8px] border border-line bg-pane p-4 text-[15.5px] leading-relaxed" data-testid="topic-explanation">
        {t[level]}
      </section>
      {level !== 'simple' && t.example && (
        <section className="space-y-1">
          <h3 className="text-[14px] font-semibold">{t.example.title}</h3>
          <pre className="overflow-auto rounded-[6px] bg-ink p-3 font-mono text-[12.5px]">{t.example.code}</pre>
        </section>
      )}
      <section className="space-y-1.5">
        <h3 className="text-[14px] font-semibold">Key terms</h3>
        <dl className="grid gap-2 sm:grid-cols-2">
          {t.terms.map(([term, meaning]) => (
            <div key={term} className="rounded-[6px] border border-line px-3 py-2">
              <dt className="font-mono text-[13px] font-semibold">{term}</dt>
              <dd className="text-[13px] text-muted">{meaning}</dd>
            </div>
          ))}
        </dl>
      </section>
      {t.mistakes && t.mistakes.length > 0 && (
        <section>
          <h3 className="text-[14px] font-semibold">Common mistakes</h3>
          <ul className="list-disc pl-5 text-[13.5px]">
            {t.mistakes.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      )}
      <TopicExam key={t.id} t={t} onScore={onScore} />
      <section className="flex flex-wrap items-center gap-3 rounded-[8px] border border-action/40 bg-action/5 p-3" data-testid="topic-practice">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Now practise it</p>
          <p className="text-[13px] text-muted">{lab ? 'Doing it once in the Lab is worth ten readings.' : 'Build it yourself in the Lab sandbox, or try a related lab from the Labs picker.'}</p>
        </div>
        {lab ? (
          <Link href={lab.href} className="inline-flex h-9 items-center gap-1.5 rounded-[5px] bg-action px-3 text-[13px] font-medium text-action-ink" data-testid="topic-lab-link">
            <lab.icon className="size-4" /> {lab.label}
          </Link>
        ) : (
          <Link href="/lab" className="inline-flex h-9 items-center gap-1.5 rounded-[5px] border border-action px-3 text-[13px] text-action" data-testid="topic-lab-link">
            <FlaskConical className="size-4" /> Open the Lab
          </Link>
        )}
        {t.lesson && (
          <Button onClick={() => onOpenLesson(t.lesson!)} data-testid="topic-full-lesson">
            <BookOpen className="size-4" /> Full interactive lesson
          </Button>
        )}
      </section>
      <nav className="flex justify-between gap-2" aria-label="Topic navigation">
        <Button disabled={!prev} onClick={() => prev && onTopic(prev.id)} data-testid="topic-prev">
          <ArrowLeft className="size-4" /> {prev ? prev.title : 'Previous'}
        </Button>
        <Button variant="primary" disabled={!next} onClick={() => next && onTopic(next.id)} data-testid="topic-next">
          {next ? next.title : 'Last topic'} <ArrowRight className="size-4" />
        </Button>
      </nav>
    </article>
  );
}

/** Learn by topic: pick a course, then a topic from the drop-down, and choose how it is taught. */
export function TopicsView({ initialTopic, onOpenLesson }: { initialTopic?: string; onOpenLesson: (id: string) => void }) {
  const cert = certById(useUi((s) => s.certId));
  const certList = useMemo(() => (cert ? certTopics(cert) : []), [cert]);
  const [allCourses, setAllCourses] = useState(false);
  const certMode = !!cert && !allCourses;
  const [course, setCourse] = useState<CourseId>(() => topicById(initialTopic ?? '')?.course ?? 'networking');
  const [topicId, setTopicId] = useState<string | null>(initialTopic && topicById(initialTopic) ? initialTopic : null);
  const [q, setQ] = useState('');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [level, setLevelState] = useState<TeachLevel>('simple');
  useEffect(() => {
    const p = loadProgress();
    setProgress(p);
    setLevelState(p.teach ?? 'simple');
  }, []);
  const setLevel = (l: TeachLevel) => {
    setLevelState(l);
    setProgress(updateProgress((p) => {
      p.teach = l;
    }));
  };
  const open = (id: string) => {
    const t = topicById(id);
    if (!t) return;
    setCourse(t.course);
    setTopicId(id);
    setQ('');
    window.history.replaceState(null, '', `/learn?topic=${id}`);
    document.getElementById('topics-top')?.scrollIntoView({ block: 'start' });
  };
  const c = COURSES.find((x) => x.id === course)!;
  const topics = certMode ? certList : courseTopics(course);
  // Cert mode groups topics by "course · unit" so the drop-down still reads like a syllabus.
  const groups = certMode ? [...new Set(certList.map((x) => `${COURSES.find((k) => k.id === x.course)?.title.replace(/ \(.*\)$/, '')} · ${x.unit}`))] : c.units;
  const groupOf = (x: Topic) => (certMode ? `${COURSES.find((k) => k.id === x.course)?.title.replace(/ \(.*\)$/, '')} · ${x.unit}` : x.unit);
  const hits = useMemo(() => (q.trim() ? ALL_TOPICS.filter((t) => topicMatches(t, q)).slice(0, 30) : []), [q]);
  const t = topicId ? topicById(topicId) : undefined;
  const doneCount = topics.filter((x) => progress?.topics?.[x.id]?.total !== undefined).length;
  return (
    <div className="space-y-3" data-testid="topics-view" id="topics-top">
      <div className="flex flex-wrap items-end gap-2">
        {cert && (
          <div className="space-y-0.5">
            <span className="block text-[12px] text-muted">Certification focus</span>
            <div className="flex h-9 items-center gap-2 rounded-[5px] border border-action/50 bg-action/10 px-2 text-[13px]" data-testid="topics-cert">
              <span className="font-medium">{cert.short}</span>
              <span className="text-muted">{certList.length} topics</span>
              <label className="ml-2 flex items-center gap-1 text-[12px] text-muted">
                <input type="checkbox" checked={allCourses} onChange={(e) => setAllCourses(e.target.checked)} data-testid="topics-show-all" /> Show all courses
              </label>
            </div>
          </div>
        )}
        <label className={cx('space-y-0.5', certMode && 'hidden')}>
          <span className="block text-[12px] text-muted">Course</span>
          <select
            className={cx(sel, 'w-64')}
            value={course}
            onChange={(e) => {
              setCourse(e.target.value as CourseId);
              setTopicId(null);
              window.history.replaceState(null, '', '/learn?tab=topics');
            }}
            data-testid="topic-course"
          >
            {COURSES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title} ({courseTopics(x.id).length})
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-0.5">
          <span className="block text-[12px] text-muted">Topic</span>
          <select className={cx(sel, 'w-72')} value={topicId ?? ''} onChange={(e) => (e.target.value ? open(e.target.value) : setTopicId(null))} data-testid="topic-select">
            <option value="">Choose a topic…</option>
            {groups.map((u) => (
              <optgroup key={u} label={u}>
                {topics
                  .filter((x) => groupOf(x) === u)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {progress?.topics?.[x.id]?.total !== undefined ? '✓ ' : ''}
                      {x.title}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="relative ml-auto">
          <Search className="pointer-events-none absolute top-2.5 left-2 size-4 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search all ${ALL_TOPICS.length} topics`} aria-label="Search topics" className={cx(sel, 'w-72 pl-8')} data-testid="topic-search" />
        </label>
      </div>
      {q.trim() ? (
        <ul className="grid gap-1.5 md:grid-cols-2" data-testid="topic-search-results">
          {hits.map((x) => (
            <li key={x.id}>
              <button className="w-full rounded-[6px] border border-line px-3 py-2 text-left hover:border-action" onClick={() => open(x.id)} data-testid={`topic-hit-${x.id}`}>
                <span className="block font-medium">{x.title}</span>
                <span className="block text-[12px] text-muted">
                  {COURSES.find((k) => k.id === x.course)?.title} · {x.unit}
                </span>
              </button>
            </li>
          ))}
          {!hits.length && <li className="text-[13px] text-muted">No topic matches “{q}”.</li>}
        </ul>
      ) : t ? (
        <TopicPage
          t={t}
          list={certMode ? certList : undefined}
          scopeLabel={cert?.short}
          level={level}
          setLevel={setLevel}
          onOpenLesson={onOpenLesson}
          onTopic={open}
          progress={progress}
          onScore={(score, total) =>
            setProgress(updateProgress((p) => {
              p.topics = { ...(p.topics ?? {}), [t.id]: { level, score, total, at: new Date().toISOString() } };
            }))
          }
        />
      ) : (
        <div className="space-y-3">
          <div>
            <h2 className="text-[18px] font-semibold" data-testid="topics-heading">{certMode ? cert!.name : c.title}</h2>
            <p className="max-w-3xl text-[13px] text-muted">{certMode ? cert!.summary : c.summary}</p>
            {certMode && <p className="mt-1 text-[12px] text-muted">Exam domains: {cert!.domains.join(' · ')}</p>}
            <p className="text-[12px] text-muted" data-testid="course-progress">
              {doneCount} of {topics.length} topics checked
            </p>
          </div>
          {groups.map((u) => (
            <section key={u}>
              <h3 className="mb-1 text-[13px] font-semibold">{u}</h3>
              <ul className="flex flex-wrap gap-1.5">
                {topics
                  .filter((x) => groupOf(x) === u)
                  .map((x) => {
                    const r = progress?.topics?.[x.id];
                    return (
                      <li key={x.id}>
                        <button className={cx('rounded-[5px] border px-2.5 py-1 text-[13px] hover:border-action', r?.total !== undefined ? 'border-healthy/50' : 'border-line')} onClick={() => open(x.id)} data-testid={`topic-card-${x.id}`}>
                          {r?.total !== undefined && <Check className="mr-1 inline size-3.5 text-healthy" />}
                          {x.title}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** One topic on its own (used by the dashboard playground): level choice, exam and lab link. */
export function TopicPlayground({ topicId, list, scopeLabel, onTopic, onOpenLesson }: { topicId: string; list?: Topic[]; scopeLabel?: string; onTopic: (id: string) => void; onOpenLesson: (id: string) => void }) {
  const t = topicById(topicId);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [level, setLevelState] = useState<TeachLevel>('simple');
  useEffect(() => {
    const p = loadProgress();
    setProgress(p);
    setLevelState(p.teach ?? 'simple');
  }, []);
  if (!t) return null;
  return (
    <TopicPage
      t={t}
      list={list}
      scopeLabel={scopeLabel}
      level={level}
      setLevel={(l) => {
        setLevelState(l);
        setProgress(updateProgress((p) => {
          p.teach = l;
        }));
      }}
      onOpenLesson={onOpenLesson}
      onTopic={onTopic}
      progress={progress}
      onScore={(score, total) =>
        setProgress(updateProgress((p) => {
          p.topics = { ...(p.topics ?? {}), [t.id]: { level, score, total, at: new Date().toISOString() } };
        }))
      }
    />
  );
}
