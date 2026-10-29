'use client';

import { useQuery } from '@tanstack/react-query';
import { BookOpen, Image as ImageIcon, Map as MapIcon, Timer } from 'lucide-react';
import { ExamsView, type ExamsSub } from '@/components/learn/Exams';
import { TopicsView } from '@/components/learn/Topics';
import { certById } from '@/content/certs';
import { useUi } from '@/state/ui';
import { VisualsView } from '@/components/learn/Visuals';
import { LessonLibrary, LessonReader } from '@/components/learn/Lessons';
import { TracksView } from '@/components/learn/Tracks';
import { LabDrills, Interview, Practice, Subnetting } from '@/components/learn/Practice';
import { useEffect, useMemo, useState } from 'react';
import { Badge, Tabs } from '@/components/ui';
import { learnApi, TRACKS, type Track } from '@/learn/api';

type LearnTab = 'images' | 'topics' | 'exams' | 'tracks';

export default function LearnPage() {
  const certId = useUi((s) => s.certId);
  const cert = certById(certId);
  const [tab, setTab] = useState<LearnTab>('topics');
  const [examSub, setExamSub] = useState<ExamsSub | undefined>();
  const [lesson, setLesson] = useState<{ id: string; section?: string } | null>(null);
  const [topic, setTopic] = useState<string | undefined>();
  const [practiceTrack, setPracticeTrack] = useState<Track | undefined>();
  // Deep links: /learn?topic=vlans, /learn?lesson=vlans&section=trunk, /learn?tab=exams&sub=flashcards
  // (older links ?tab=practice|interview|subnetting|labs|lessons still work)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const l = p.get('lesson');
    const tp = p.get('topic');
    const t = p.get('tab');
    if (l) {
      setTab('topics');
      setLesson({ id: l, section: p.get('section') ?? undefined });
    } else if (tp) {
      setTab('topics');
      setTopic(tp);
    } else if (t === 'practice' || t === 'interview' || t === 'subnetting') {
      setTab('exams');
      setExamSub(t === 'practice' ? 'ai' : t);
    } else if (t === 'exams') {
      setTab('exams');
      setExamSub((p.get('sub') as ExamsSub | null) ?? undefined);
    } else if (t === 'labs' || t === 'lessons' || t === 'tracks') setTab('tracks');
    else if (t === 'images') setTab('images');
  }, []);
  const openLesson = (id: string, section?: string) => {
    setTab('topics');
    setLesson({ id, section });
    window.history.replaceState(null, '', `/learn?lesson=${id}${section ? `&section=${section}` : ''}`);
  };
  const openTopic = (id: string) => {
    setLesson(null);
    setTab('topics');
    setTopic(id);
    window.history.replaceState(null, '', `/learn?topic=${id}`);
  };
  const progress = useQuery({ queryKey: ['learn-progress'], queryFn: learnApi.progress, retry: false });
  const weak = useMemo(() => progress.data?.tracks.flatMap((t) => t.weak_objectives.map((o) => `${TRACKS.find((x) => x.key === t.track)?.label ?? t.track}: ${o}`)).slice(0, 6) ?? [], [progress.data]);
  return (
    <div className="space-y-3 p-4" data-testid="learn-page">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[18px] font-semibold">
            Learn{cert && <span className="ml-2 rounded-full border border-action/50 bg-action/10 px-2 py-0.5 align-middle text-[12px] font-medium text-action" data-testid="learn-cert">{cert.short}</span>}
          </h1>
          <p className="max-w-3xl text-[13px] text-muted">Pick a course and a topic, choose how you want it explained, test yourself, then practise it in the Lab. Progress stays on this computer.</p>
        </div>
        {progress.data && (
          <div className="ml-auto flex flex-wrap gap-2 text-[12px]" data-testid="learn-progress">
            {progress.data.tracks.map((t) => (
              <Badge key={t.track} tone={t.accuracy >= 0.8 ? 'good' : t.accuracy >= 0.6 ? 'warn' : 'bad'}>
                {TRACKS.find((x) => x.key === t.track)?.label ?? t.track}: {Math.round(t.accuracy * 100)}% of {t.answered}
              </Badge>
            ))}
          </div>
        )}
      </div>
      {weak.length > 0 && <p className="text-[12.5px] text-muted">Review next: {weak.join(' · ')}</p>}
      <Tabs<LearnTab>
        value={tab}
        onChange={(k) => {
          setTab(k);
          if (k !== 'topics') setLesson(null);
        }}
        tabs={[
          { key: 'images', label: <span className="flex items-center gap-1.5"><ImageIcon className="size-4" /> Learn with images</span> },
          { key: 'topics', label: <span className="flex items-center gap-1.5"><BookOpen className="size-4" /> Topics</span> },
          { key: 'exams', label: <span className="flex items-center gap-1.5"><Timer className="size-4" /> Exams and flashcards</span> },
          { key: 'tracks', label: <span className="flex items-center gap-1.5"><MapIcon className="size-4" /> Tracks and progress</span> },
        ]}
      />
      {tab === 'images' && <VisualsView onTopic={openTopic} />}
      {tab === 'topics' &&
        (lesson ? (
          <LessonReader
            key={`${lesson.id}-${lesson.section ?? ''}`}
            lessonId={lesson.id}
            initialSection={lesson.section}
            onClose={() => {
              setLesson(null);
              window.history.replaceState(null, '', topic ? `/learn?topic=${topic}` : '/learn');
            }}
          />
        ) : (
          <TopicsView key={`${topic ?? 'none'}-${certId}`} initialTopic={topic} onOpenLesson={(id) => openLesson(id)} />
        ))}
      {tab === 'exams' && <ExamsView key={`${examSub ?? 'default'}-${certId}`} initial={examSub} onStudy={openTopic} ai={<Practice key={`${practiceTrack ?? 'default'}-${certId}`} initialTrack={practiceTrack ?? (cert?.aiTrack as Track | undefined)} />} subnetting={<Subnetting />} interview={<Interview />} />}
      {tab === 'tracks' && (
        <div className="space-y-6">
          <TracksView
            key={certId}
            onLesson={(id) => openLesson(id)}
            onPractice={(t) => {
              setPracticeTrack(t as Track);
              setExamSub('ai');
              setTab('exams');
            }}
          />
          <section className="space-y-2">
            <h2 className="text-[16px] font-semibold">Interactive lessons</h2>
            <LessonLibrary onOpen={openLesson} />
          </section>
          <section className="space-y-2">
            <h2 className="text-[16px] font-semibold">Guided labs and troubleshooting drills</h2>
            <LabDrills />
          </section>
        </div>
      )}
    </div>
  );
}
