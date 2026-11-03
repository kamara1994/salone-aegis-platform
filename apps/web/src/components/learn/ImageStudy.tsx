'use client';

// Learn with images (CCNA): every picture card in the deck, grouped by topic.
// Quiz me hides the answer so you study the picture and commit to an answer first; Browse shows everything.
import { ArrowLeft, ArrowRight, Eye, ImageIcon, Maximize2, X } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Button, cx } from '@/components/ui';
import deckJson from '@/content/flashcards/ccna.json';
import { Segments, ShowSide, StudySide, useSide, useStored, type SideGroup } from './StudyKit';
import { AskAI } from '@/components/tutor/AskAI';

type Card = { t: string; q: string; a: string; cli?: string; why?: string; img?: string; imgAlt?: string; imgKind?: string; imgCredit?: string; imgSource?: string; imgFallback?: string };
const DECK = deckJson as Card[];
const HUE: Record<string, string> = { OSI: '#7c5cff', Switching: '#22b8cf', VLANs: '#cc5de8', IPv4: '#ff922b', IPv6: '#20c997', Routing: '#ff6b6b', Services: '#4c6ef5', Security: '#fa5252', Wireless: '#339af0', Automation: '#12b886', Hardware: '#fcc419', Interview: '#94d82d' };
/** Picture cards only, keeping their place in the deck as the id. */
const ORDER = ['Hardware', 'OSI', 'Switching', 'VLANs', 'IPv4', 'IPv6', 'Routing', 'Services', 'Security', 'Wireless', 'Automation', 'Interview'];
const rank = (t: string) => (ORDER.includes(t) ? ORDER.indexOf(t) : ORDER.length);
const FIGS = DECK.map((c, i) => ({ c, id: String(i) }))
  .filter((x) => x.c.img)
  .sort((a, b) => rank(a.c.t) - rank(b.c.t));
const TOPICS = [...new Set(FIGS.map((f) => f.c.t))];
const kindOf = (c: Card) => (/photo/i.test(c.imgKind ?? '') ? 'Photo' : /screenshot/i.test(c.imgKind ?? '') ? 'Screenshot' : 'Diagram');

type Saved = { seen: Record<string, 1>; cur: string };

function Figure({ c, onZoom, big }: { c: Card; onZoom?: () => void; big?: boolean }) {
  const [src, setSrc] = useState(c.img);
  const [fell, setFell] = useState(false);
  useEffect(() => {
    setSrc(c.img);
    setFell(false);
  }, [c.img]);
  if (!src) return <div className="grid h-72 place-items-center rounded-2xl border border-line text-muted">Picture unavailable</div>;
  const dark = fell || kindOf(c) !== 'Photo';
  return (
    <figure className={cx('img-stage group relative overflow-hidden rounded-2xl border border-line', dark ? 'bg-[#0b1427]' : 'bg-white')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={c.imgAlt ?? ''}
        onClick={onZoom}
        className={cx('block w-full object-contain', big ? 'max-h-[82vh]' : 'h-[min(46vh,440px)]', onZoom && 'cursor-zoom-in')}
        onError={() => {
          if (c.imgFallback && src !== c.imgFallback) {
            setSrc(c.imgFallback);
            setFell(true);
          } else setSrc(undefined);
        }}
      />
      {onZoom && (
        <button type="button" onClick={onZoom} className="absolute top-3 right-3 grid size-8 place-items-center rounded-lg bg-black/55 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus:opacity-100" title="Full screen (Enter)" aria-label="Full screen" data-testid="img-zoom">
          <Maximize2 className="size-4" />
        </button>
      )}
      {(c.imgCredit || fell) && (
        <figcaption className="absolute right-3 bottom-2.5 max-w-[75%] truncate rounded-full bg-black/60 px-2.5 py-0.5 text-[10.5px] text-white/85">
          {fell ? 'Labelled diagram (photo could not load)' : c.imgSource ? <a href={c.imgSource} target="_blank" rel="noopener noreferrer" className="hover:underline">{c.imgCredit}</a> : c.imgCredit}
        </figcaption>
      )}
    </figure>
  );
}

export function ImageStudy() {
  const [saved, setSaved] = useStored<Saved>('aegis.images.ccna.v1', { seen: {}, cur: FIGS[0]?.id ?? '' });
  const [side, setSide] = useSide('aegis.images.side');
  const [quiz, setQuiz] = useState(true);
  const [shown, setShown] = useState(false);
  const [zoom, setZoom] = useState(false);
  const idx = Math.max(0, FIGS.findIndex((f) => f.id === saved.cur));
  const fig = FIGS[idx];
  const group = FIGS.filter((f) => f.c.t === fig?.c.t);
  const gi = group.findIndex((f) => f.id === fig?.id);
  const open = shown || !quiz;
  const hue = HUE[fig?.c.t ?? ''] ?? '#22b8cf';

  const goTo = (id: string) => {
    setShown(false);
    setSaved({ ...saved, cur: id });
  };
  const step = (d: 1 | -1) => goTo(FIGS[(idx + d + FIGS.length) % FIGS.length].id);
  const reveal = () => {
    setShown(true);
    if (fig && !saved.seen[fig.id]) setSaved({ ...saved, seen: { ...saved.seen, [fig.id]: 1 } });
  };
  // Browse mode counts a figure as studied once you land on it.
  useEffect(() => {
    if (!quiz && fig && !saved.seen[fig.id]) setSaved({ ...saved, seen: { ...saved.seen, [fig.id]: 1 } });
  }, [quiz, fig?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') return setZoom(false);
      if (e.key === 'ArrowRight') return step(1);
      if (e.key === 'ArrowLeft') return step(-1);
      if (e.key === 'Enter') return setZoom((z) => !z);
      if (e.key === ' ') {
        e.preventDefault();
        if (!open) reveal();
        else step(1);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const groups: SideGroup[] = useMemo(
    () =>
      TOPICS.map((t) => ({
        key: t,
        title: t,
        hue: HUE[t] ?? '#22b8cf',
        items: FIGS.filter((f) => f.c.t === t).map((f) => ({ id: f.id, label: f.c.q, done: !!saved.seen[f.id], mark: <span className="mt-0.5 shrink-0 text-[9.5px] tracking-wide text-faint uppercase">{kindOf(f.c).slice(0, 5)}</span> })),
      })),
    [saved.seen],
  );

  if (!fig) return <p className="text-muted">No picture cards yet.</p>;
  return (
    <div className="flex gap-6" data-testid="image-study">
      {side && <StudySide eyebrow="Learn with images" doneLabel="studied" groups={groups} current={fig.id} onItem={goTo} onHide={() => setSide(false)} testid="img-side" />}
      <div className="mx-auto min-w-0 max-w-[880px] flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {!side && <ShowSide onShow={() => setSide(true)} />}
          <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted" data-testid="img-position">
            Figure <b className="text-text">{idx + 1}</b> of {FIGS.length}
            <span className="mx-1.5 text-faint">·</span>
            <span className="font-semibold" style={{ color: hue }}>{fig.c.t}</span>
            <span className="mx-1.5 text-faint">·</span>
            {kindOf(fig.c)}
          </p>
          <div className="flex shrink-0 gap-1 rounded-xl border border-line bg-pane p-1" role="radiogroup" aria-label="How to study">
            {(
              [
                [true, 'Quiz me', 'Answer from the picture, then reveal'],
                [false, 'Browse', 'Show the answer with every picture'],
              ] as const
            ).map(([v, label, hint]) => (
              <button key={label} type="button" role="radio" aria-checked={quiz === v} title={hint} onClick={() => { setQuiz(v); setShown(false); }} className={cx('rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors', quiz === v ? 'bg-action text-white shadow-[0_0_16px_-4px_var(--action)]' : 'text-muted hover:text-text')} data-testid={`img-mode-${v ? 'quiz' : 'browse'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <Segments n={group.length} at={gi} done={(k) => !!saved.seen[group[k].id]} onPick={(k) => goTo(group[k].id)} hue={hue} labels={group.map((f) => f.c.q)} />

        <div className="img-frame" style={{ '--hue': hue } as CSSProperties}>
          <Figure key={fig.id} c={fig.c} onZoom={() => setZoom(true)} />
        </div>

        <section className={cx('img-answer rounded-2xl border p-5', open ? 'is-open' : '')} style={{ '--hue': hue } as CSSProperties} aria-live="polite" data-testid="img-answer">
          <div className="flex items-center gap-2">
            <p className="flex-1 text-[10.5px] font-semibold tracking-[0.2em] uppercase" style={{ color: hue }}>
              {open ? 'Answer' : 'Look closely'}
            </p>
            <AskAI ctx={{ kind: 'Picture', label: fig.c.t, text: `${fig.c.q} ${fig.c.imgAlt ?? ''}` }} />
          </div>
          <h2 className="mt-1.5 text-[20px] leading-snug font-semibold text-text">{fig.c.q}</h2>
          {open ? (
            <div className="img-reveal mt-3 space-y-3">
              <p className="text-[17px] leading-relaxed text-text" style={{ fontFamily: "'IBM Plex Serif', Georgia, serif" }}>{fig.c.a}</p>
              {fig.c.cli && <pre className="flash-cli">{fig.c.cli}</pre>}
              {fig.c.why && <p className="border-t border-dashed border-line pt-3 text-[13px] text-muted">💡 {fig.c.why}</p>}
            </div>
          ) : (
            <p className="mt-2 text-[13px] text-faint">Study the picture and say your answer out loud before you reveal it. Committing first makes it stick.</p>
          )}
        </section>

        <div className="flex items-center gap-3">
          <Button onClick={() => step(-1)} data-testid="img-back">
            <ArrowLeft className="size-4" /> Back
          </Button>
          <div className="flex flex-1 justify-center">
            {!open && (
              <button type="button" onClick={reveal} className="flash-show" data-testid="img-reveal">
                <Eye className="size-4" /> Reveal answer <kbd>Space</kbd>
              </button>
            )}
          </div>
          <Button variant="primary" onClick={() => step(1)} data-testid="img-next">
            Next <ArrowRight className="size-4" />
          </Button>
        </div>
        <p className="text-center text-[11.5px] text-faint">Space reveal, then next · Enter full screen · ← → move</p>
      </div>

      {zoom && (
        <div className="img-lightbox fixed inset-0 z-[80] grid place-items-center bg-black/85 p-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={fig.c.imgAlt ?? 'Picture'} onClick={() => setZoom(false)} data-testid="img-lightbox">
          <div className="w-full max-w-[1200px]" onClick={(e) => e.stopPropagation()}>
            <Figure c={fig.c} big />
            <p className="mt-3 flex items-center gap-2 text-[13px] text-white/80">
              <ImageIcon className="size-4" /> {fig.c.imgAlt}
            </p>
          </div>
          <button type="button" onClick={() => setZoom(false)} className="absolute top-5 right-5 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Close (Esc)">
            <X className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
