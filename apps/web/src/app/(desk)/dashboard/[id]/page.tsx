'use client';

import { FlaskConical, Gamepad2, MousePointerClick } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { CertStrip } from '@/components/cert/CertStrip';
import { useDashItem } from '@/components/cert/DashboardSide';
import { Flashcards, TimedExam } from '@/components/learn/Exams';
import { EmptyState } from '@/components/ui';
import { allGames } from '@/content';
import { certById, dashboardById } from '@/content/certs';
import { WORKBOOKS } from '@/lab/workbooks';
import { useUi } from '@/state/ui';

/** A dashboard's playground. The left side (DashboardSide) lists the sections; the middle stays clear
 *  until one is picked there. */
export default function DashboardPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const dash = dashboardById(id);
  const focus = certById(id);
  const { item, setItem } = useDashItem();
  // Opening a dashboard by URL makes it the current focus (once per visit, so switching away is not undone),
  // and restores the picked item from ?item=.
  useEffect(() => {
    if (dash && useUi.getState().certId !== dash.id) useUi.getState().setCert(dash.id);
    const it = new URLSearchParams(window.location.search).get('item');
    const moved: Record<string, string> = { exam: 'learn/exam', flashcards: 'learn/flashcards', scenarios: 'games' };
    useDashItem.setState({ item: !it || it.startsWith('topic:') ? null : (moved[it] ?? it) });
  }, [dash]);
  if (!dash || !focus) return <EmptyState title="No such dashboard" body="Choose a certification area from the drop-down at the top." />;

  const placeholder = (key: string, title: string) =>
    item === key && (
      <div className="p-4" data-testid={`playground-${key}`}>
        <EmptyState title={title} body={`The ${dash.title} ${title.toLowerCase()} space is reserved and will be designed next.`} />
      </div>
    );
  const learnTab = item === 'learn/flashcards' ? 'flashcards' : 'exam';
  return (
    <div className="h-full overflow-auto" data-testid={`dashboard-${dash.id}`}>
      <h1 className="sr-only" data-testid="dashboard-title">
        {dash.title}
      </h1>
      {!item && (
        <div className="grid h-full place-items-center p-6" data-testid="dashboard-playground-empty">
          <div className="text-center text-muted">
            <MousePointerClick className="mx-auto mb-2 size-8 opacity-50" />
            <p className="text-[14px]">Pick something from the {dash.title} menu on the left.</p>
          </div>
        </div>
      )}
      {item?.startsWith('learn') && (
        <div className="p-4" data-testid="playground-learn">
          <div className="mb-3 flex gap-1 border-b border-line" role="tablist" aria-label="Learn">
            {(
              [
                ['exam', 'Practice exam'],
                ['flashcards', 'Flashcards'],
              ] as const
            ).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={learnTab === k} onClick={() => setItem(`learn/${k}`)} className={`-mb-px border-b-2 px-3 py-1.5 text-[13px] ${learnTab === k ? 'border-action text-text' : 'border-transparent text-muted hover:text-text'}`} data-testid={`learn-tab-${k}`}>
                {label}
              </button>
            ))}
          </div>
          {learnTab === 'exam' ? (
            <div data-testid="playground-exam">
              <TimedExam onStudy={(t) => router.push(`/learn?topic=${t}`)} />
            </div>
          ) : (
            <div data-testid="playground-flashcards">
              <Flashcards />
            </div>
          )}
        </div>
      )}
      {item === 'labs' && (
        <ul className="grid gap-2 p-4 md:grid-cols-2" data-testid="playground-labs">
          {focus.labs.map((l) => WORKBOOKS.find((w) => w.id === l)).filter(Boolean).map((w) => (
            <li key={w!.id}>
              <Link href={`/lab?workbook=${w!.id}`} className="flex h-full flex-col gap-1 rounded-[6px] border border-line p-3 hover:border-action">
                <span className="flex items-center gap-1.5 font-semibold">
                  <FlaskConical className="size-4 text-action" /> {w!.title}
                </span>
                <span className="line-clamp-2 text-[12.5px] text-muted">{w!.intro}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {item === 'games' && (
        <ul className="grid gap-2 p-4 md:grid-cols-2" data-testid="playground-games">
          {allGames()
            .filter((g) => focus.games.includes(g.id))
            .map((g) => (
              <li key={g.id}>
                <Link href={`/games?template=${g.id}`} className="flex h-full flex-col gap-1 rounded-[6px] border border-line p-3 hover:border-action">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Gamepad2 className="size-4 text-action" /> {g.title}
                  </span>
                  <span className="text-[12.5px] text-muted">{g.summary}</span>
                </Link>
              </li>
            ))}
        </ul>
      )}
      {item === 'progress' && (
        <div data-testid="playground-progress">
          <CertStrip />
        </div>
      )}
      {placeholder('projects', 'Projects')}
      {placeholder('skills', 'Skills')}
      {placeholder('career', 'Career')}
      {placeholder('settings', 'Settings')}
    </div>
  );
}
