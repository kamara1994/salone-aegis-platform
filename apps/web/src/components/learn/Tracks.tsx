'use client';

import { Download, Gamepad2, Trash, Upload } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, cx } from '@/components/ui';
import { allGames, BUILTIN_LESSONS, TRACKS, trackGames, trackLessons } from '@/content';
import { ADVANCED_TOPIC_COUNTS } from '@/content/advancedTopics';
import { exportProgressFile, importProgressFile, installPack, lessonProgress, loadPacks, loadProgress, removePack, validatePack, type ContentPack, type Progress } from '@/content/progress';
import type { TrackId } from '@/content/types';
import { CHALLENGES } from '@/lab/challenges';
import { WORKBOOKS } from '@/lab/workbooks';

/** Which guided labs belong to a track. */
export function trackWorkbooks(t: TrackId) {
  const sec = new Set(['port-security', 'dhcp-snooping', 'acl', 'nat', 'stp-guard']);
  return WORKBOOKS.filter((w) => (t === 'ccna' && w.level === 'CCNA') || (t === 'ccnp' && (w.level === 'CCNP' || ['stp', 'etherchannel', 'ospf', 'fhrp'].includes(w.id))) || ((t === 'security-plus' || t === 'soc') && sec.has(w.id)) || (t === 'helpdesk' && ['basic-switch', 'vlans-trunking', 'dhcp', 'port-security'].includes(w.id)));
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TracksView({ onLesson, onPractice }: { onLesson: (id: string) => void; onPractice: (track: string) => void }) {
  const [sel, setSel] = useState<TrackId>('ccna');
  const [progress, setProgress] = useState<Progress | null>(null);
  useEffect(() => setProgress(loadProgress()), []);
  const t = TRACKS.find((x) => x.id === sel)!;
  const lessons = trackLessons(sel);
  const labs = trackWorkbooks(sel);
  const games = trackGames(sel);
  const doneLessons = progress ? lessons.filter((l) => lessonProgress(progress, l.id).done).length : 0;
  const doneLabs = progress ? labs.filter((w) => progress.lessons[`lab:${w.id}`]?.done).length : 0;
  const gameScores = (id: string) => progress?.games.filter((g) => g.template === id) ?? [];
  const total = lessons.length + labs.length + games.length;
  const done = doneLessons + doneLabs + games.filter((g) => gameScores(g.id).length).length;
  return (
    <div className="grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]" data-testid="tracks">
      <ul className="space-y-1">
        {TRACKS.map((x) => (
          <li key={x.id}>
            <button className={cx('w-full rounded-[6px] border px-3 py-2 text-left text-[13.5px]', sel === x.id ? 'border-action bg-action/10' : 'border-line hover:border-line-strong')} onClick={() => setSel(x.id)} data-testid={`track-${x.id}`}>
              <span className="flex items-center justify-between gap-2">
                <span>{x.title}</span>
                <span className="text-[11px] text-muted">{ADVANCED_TOPIC_COUNTS[x.id]} topics</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="space-y-3">
        <div>
          <h2 className="text-[18px] font-semibold">{t.title}</h2>
          <p className="text-[13px] text-muted">{t.summary}</p>
          <p className="mt-1 text-[12px] text-action">{ADVANCED_TOPIC_COUNTS[sel]} advanced textbook topics plus guided labs and scenarios</p>
          <div className="mt-2 flex items-center gap-2 text-[12px]">
            <span className="h-2 w-60 overflow-hidden rounded bg-pane-2">
              <span className="block h-full bg-healthy" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
            </span>
            <span data-testid="track-progress">
              {done}/{total} done
            </span>
          </div>
        </div>
        <section>
          <h3 className="mb-1 font-semibold">Lessons</h3>
          {lessons.length ? (
            <ul className="flex flex-wrap gap-2">
              {lessons.map((l) => (
                <li key={l.id}>
                  <button className="rounded border border-line px-2 py-1 text-[13px] hover:border-action" onClick={() => onLesson(l.id)}>
                    {progress && lessonProgress(progress, l.id).done ? '✓ ' : ''}
                    {l.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">No lessons yet for this track. Import a content pack, or use AI practice.</p>
          )}
        </section>
        <section>
          <h3 className="mb-1 font-semibold">Practice labs</h3>
          {labs.length ? (
            <ul className="flex flex-wrap gap-2">
              {labs.map((w) => (
                <li key={w.id}>
                  <Link className="inline-block rounded border border-line px-2 py-1 text-[13px] hover:border-action" href={`/lab?workbook=${w.id}`}>
                    {progress?.lessons[`lab:${w.id}`]?.done ? '✓ ' : ''}[{w.level}] {w.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">Use the troubleshooting drills and the Lab sandbox.</p>
          )}
        </section>
        <section>
          <h3 className="mb-1 font-semibold">Games and scenarios</h3>
          <ul className="flex flex-wrap gap-2">
            {games.map((g) => {
              const s = gameScores(g.id);
              const best = s.length ? Math.max(...s.map((x) => Math.round((x.score / x.max) * 100))) : null;
              return (
                <li key={g.id}>
                  <Link className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[13px] hover:border-action" href={`/games?template=${g.id}`}>
                    <Gamepad2 className="size-3.5" /> {g.title} {best !== null && <Badge tone={best >= 80 ? 'good' : 'warn'}>best {best}%</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
        <section>
          <h3 className="mb-1 font-semibold">Troubleshooting, exams and drills</h3>
          <div className="flex flex-wrap gap-2 text-[13px]">
            {CHALLENGES.slice(0, sel === 'ccna' || sel === 'helpdesk' ? 6 : 3).map((c) => (
              <Link key={c.id} className="rounded border border-line px-2 py-1 hover:border-action" href={`/lab?challenge=${c.id}`}>
                Drill: {c.title}
              </Link>
            ))}
            {t.learnTrack && (
              <Button size="sm" onClick={() => onPractice(t.learnTrack!)}>
                Timed exam and flashcards (AI)
              </Button>
            )}
          </div>
        </section>
        <ProgressAndPacks />
      </div>
    </div>
  );
}

function ProgressAndPacks() {
  const fileP = useRef<HTMLInputElement>(null);
  const fileK = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [packs, setPacks] = useState<ContentPack[]>([]);
  useEffect(() => setPacks(loadPacks()), []);
  return (
    <section className="space-y-2 rounded-[6px] border border-line p-3 text-[13px]" data-testid="packs">
      <h3 className="font-semibold">Your data (stored only on this computer)</h3>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => download(`aegis-progress-${new Date().toISOString().slice(0, 10)}.json`, exportProgressFile())} data-testid="export-progress">
          <Download className="size-3.5" /> Export progress
        </Button>
        <Button size="sm" onClick={() => fileP.current?.click()}>
          <Upload className="size-3.5" /> Import progress
        </Button>
        <Button size="sm" onClick={() => fileK.current?.click()} data-testid="import-pack">
          <Upload className="size-3.5" /> Import content pack
        </Button>
        <Button
          size="sm"
          onClick={() => {
            const pack: ContentPack = { format: 'aegis-content-pack', version: 1, name: 'My pack', description: 'Starter pack: edit the lessons and games, then import it.', createdAt: new Date().toISOString(), lessons: [BUILTIN_LESSONS[1]], games: [{ ...allGames()[0], cases: [allGames()[0].cases[0]] }] };
            download('aegis-content-pack-template.json', JSON.stringify(pack, null, 2));
          }}
        >
          <Download className="size-3.5" /> Download pack template
        </Button>
      </div>
      <input
        ref={fileP}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Progress file"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const r = importProgressFile(await f.text());
          setMsg(r.ok ? { ok: true, text: 'Progress imported.' } : { ok: false, text: `Could not import: ${r.error}` });
        }}
      />
      <input
        ref={fileK}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Content pack file"
        data-testid="pack-file"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const v = validatePack(JSON.parse(await f.text()));
            if (!v.ok) return setMsg({ ok: false, text: `Not imported: ${v.error}` });
            if (!installPack(v.pack)) return setMsg({ ok: false, text: 'Browser storage is full.' });
            setPacks(loadPacks());
            setMsg({ ok: true, text: `Installed "${v.pack.name}": ${v.pack.lessons?.length ?? 0} lessons, ${v.pack.games?.length ?? 0} games, ${v.pack.labs?.length ?? 0} labs.` });
          } catch (err) {
            setMsg({ ok: false, text: `Not imported: ${(err as Error).message}` });
          }
        }}
      />
      {msg && <p className={msg.ok ? 'text-healthy' : 'text-down'}>{msg.text}</p>}
      {packs.length > 0 && (
        <ul className="space-y-1">
          {packs.map((p) => (
            <li key={p.name} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="font-medium">{p.name}</span> <span className="text-muted">{p.description}</span>
                {p.labs?.map((l, i) => (
                  <Link key={i} href={`/lab?pack=${encodeURIComponent(p.name)}&lab=${i}`} className="ml-2 text-action underline">
                    Open lab: {l.name}
                  </Link>
                ))}
              </span>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  removePack(p.name);
                  setPacks(loadPacks());
                }}
              >
                <Trash className="size-3.5" /> Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11.5px] text-muted">Content packs are plain JSON (lessons, games, lab layouts). They are validated and never run code.</p>
    </section>
  );
}
