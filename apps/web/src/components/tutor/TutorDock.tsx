'use client';

// The study tutor: a dock on the right, a launcher in the corner, and the detour bar.
// It follows you between pages, remembers what was hard, and can send you to a prerequisite
// and bring you back with the link explained. Answers come from the AEGIS lessons.
import { ArrowLeft, ArrowRight, Brain, Send, Sparkles, Trash2, X } from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/components/ui';
import { useDashItem } from '@/components/cert/DashboardSide';
import { act, chat, CHAPTERS, chapterOf, detourArrive, detourReturn, greet, lessonById, PAIRS, patterns, resolveLesson, welcome, type Action, type MapNode, type Reply } from '@/learn/tutorBrain';
import { useBookLesson } from '@/state/bookLesson';
import { useTutor } from '@/state/tutor';

/** Tiny formatter for tutor text: **bold**, *italic*, paragraphs and a --- divider. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((p, i) =>
        p.trim() === '---' ? (
          <hr key={i} className="my-2 border-line" />
        ) : (
          <p key={i} className="[&+p]:mt-2">
            {p.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((seg, k) =>
              seg.startsWith('**') ? <b key={k} className="font-semibold text-text">{seg.slice(2, -2)}</b> : seg.startsWith('*') && seg.length > 2 ? <em key={k}>{seg.slice(1, -1)}</em> : <Fragment key={k}>{seg}</Fragment>,
            )}
          </p>
        ),
      )}
    </>
  );
}

export function TutorDock() {
  const s = useTutor();
  const [tab, setTab] = useState<'chat' | 'memory'>('chat');
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => s.hydrate(), []); // eslint-disable-line react-hooks/exhaustive-deps
  // On wide screens the page makes room for the dock instead of hiding under it.
  useEffect(() => {
    document.body.classList.toggle('tutor-open', s.open);
    return () => document.body.classList.remove('tutor-open');
  }, [s.open]);

  /** Show a reply with a short "thinking" beat, then apply its effects. */
  const apply = (r: Reply) => {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      const st = useTutor.getState();
      st.push(r.msgs);
      const patch: Parameters<typeof st.save>[0] = {};
      if (r.memory) patch.memory = r.memory;
      if (r.detour !== undefined) patch.detour = r.detour;
      if (Object.keys(patch).length) st.save(patch);
      if (r.await !== undefined) st.setAwaiting(r.await);
      if (r.go) {
        useDashItem.getState().setItem('learn/topics');
        useBookLesson.getState().open(r.go);
        if (r.detour) setTimeout(() => apply(detourArrive(r.detour!)), 500);
      }
    }, 380);
  };

  // New context (someone tapped Ask AI) or the end of a detour.
  useEffect(() => {
    if (!s.req || !s.ready) return;
    const st = useTutor.getState();
    if (s.req.kind === 'open' && st.ctx) {
      setTab('chat');
      apply(greet(st.ctx, st.memory, st.memory.name ?? ''));
    }
    if (s.req.kind === 'welcome') {
      setTab('chat');
      apply(welcome(st.memory));
    }
    if (s.req.kind === 'select' && s.req.text && st.ctx) {
      setTab('chat');
      st.push([{ role: 'me', text: `Explain this: “${s.req.text.length > 140 ? `${s.req.text.slice(0, 140)}…` : s.req.text}”` }]);
      apply(chat(s.req.text, st.ctx, st.memory, st.detour));
    }
    if (s.req.kind === 'back' && st.detour) {
      const d = st.detour;
      st.save({ detour: null });
      useTutor.setState({ ctx: d.from });
      apply(detourReturn(d, st.memory));
    }
  }, [s.req?.n, s.ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [s.msgs.length, typing]);

  const onAction = (label: string, a: Action) => {
    const st = useTutor.getState();
    st.push([{ role: 'me', text: label }]);
    if (a.k !== 'teach') st.setAwaiting(null);
    if (a.k === 'open') {
      useDashItem.getState().setItem('learn/topics');
      useBookLesson.getState().open(a.lesson);
      return;
    }
    apply(act(a, st.ctx ?? { kind: '', label: '' }, st.memory, st.detour));
  };
  const send = () => {
    const t = input.trim();
    if (!t) return;
    setInput('');
    const st = useTutor.getState();
    st.push([{ role: 'me', text: t }]);
    apply(chat(t, st.ctx ?? { kind: '', label: t }, st.memory, st.detour, st.awaiting));
  };

  const cur = s.ctx ? resolveLesson(s.ctx) : undefined;
  const lastActions = [...s.msgs].reverse().find((m) => m.role === 'ai')?.id;

  return (
    <>
      <DetourBar />
      <Launcher />
      <SelectionAsk />
      <aside className={cx('tutor-dock', s.open && 'is-open')} aria-label="AI study tutor" aria-hidden={!s.open} data-testid="tutor-dock">
        <header className="tutor-head">
          <span className="tutor-orb" aria-hidden>
            <Sparkles className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-text">Study tutor</p>
            <p className="truncate text-[11.5px] text-faint">{cur ? `On: ${cur.title}` : s.ctx?.label ? `On: ${s.ctx.label}` : 'Ask about anything you study'}</p>
          </div>
          <div className="seg !p-0.5" role="tablist" aria-label="Tutor views">
            {(['chat', 'memory'] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('seg-btn !px-2.5 !py-1 !text-[11.5px]', tab === k && 'is-on')} data-testid={`tutor-tab-${k}`}>
                {k === 'chat' ? 'Chat' : 'Memory'}
              </button>
            ))}
          </div>
          <button type="button" onClick={s.close} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-pane-2 hover:text-text" aria-label="Close tutor" data-testid="tutor-close">
            <X className="size-4" />
          </button>
        </header>

        {tab === 'chat' ? (
          <>
            <div className="tutor-body" aria-live="polite">
              {!s.msgs.length && !typing && (
                <div className="grid h-full place-items-center px-6 text-center">
                  <div>
                    <span className="tutor-orb mx-auto mb-3 !size-12">
                      <Sparkles className="size-5" />
                    </span>
                    <p className="text-[14px] font-semibold text-text">Tap ✦ next to anything you study</p>
                    <p className="mt-1 text-[12.5px] text-muted">I'll explain it simply, check what it builds on, and remember what you found hard.</p>
                  </div>
                </div>
              )}
              {s.msgs.map((m) => (
                <div key={m.id} className={cx('tutor-msg', m.role === 'me' ? 'is-me' : 'is-ai', m.tone && `is-${m.tone}`)}>
                  <div className="tutor-bubble">
                    <Rich text={m.text} />
                    {m.map && <TopicMap nodes={m.map} />}
                    {m.table && (
                      <div className="tutor-table-wrap">
                        <table className="tutor-table">
                          <thead>
                            <tr>{m.table.head.map((h, i) => <th key={i}>{h}</th>)}</tr>
                          </thead>
                          <tbody>
                            {m.table.rows.map((r, i) => (
                              <tr key={i}>{r.map((c, k) => (k ? <td key={k}>{c}</td> : <th key={k} scope="row">{c}</th>))}</tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {m.source && (
                      <button type="button" className="tutor-source" onClick={() => { useDashItem.getState().setItem('learn/topics'); useBookLesson.getState().open(m.source!.id); }} title="Open this lesson">
                        From: {m.source.title}
                      </button>
                    )}
                  </div>
                  {m.actions && m.id === lastActions && !typing && (
                    <div className="tutor-actions">
                      {m.actions.map((x) => (
                        <button key={x.label} type="button" onClick={() => onAction(x.label, x.a)} className={cx('tutor-chip', x.primary && 'is-primary')} data-testid={`tutor-act-${x.a.k}`}>
                          {x.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {typing && (
                <div className="tutor-msg is-ai">
                  <div className="tutor-bubble tutor-typing" aria-label="Thinking">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              )}
              <div ref={end} />
            </div>
            <form
              className="tutor-input"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <div className="tutor-quick mb-2 flex gap-1.5">
                {(
                  [
                    ['Simpler', { k: 'simple' }],
                    ['Deeper', { k: 'deep' }],
                    ['Quiz me', { k: 'quiz' }],
                    ['Teach back', { k: 'teach' }],
                    ['Map', { k: 'map' }],
                    ['Job ticket', { k: 'job' }],
                  ] as [string, Action][]
                ).map(([label, a]) => (
                  <button key={label} type="button" disabled={!s.ctx || typing} onClick={() => onAction(label, a)} className="tutor-chip !py-1 !text-[11.5px]">
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={s.awaiting ? 'Explain it in your own words…' : 'Ask anything… try “VLAN vs subnet”'} className={cx('tutor-field', s.awaiting && 'is-teach')} aria-label="Ask the tutor" data-testid="tutor-input" />
                <button type="submit" disabled={!input.trim() || typing} className="tutor-send" aria-label="Send">
                  <Send className="size-4" />
                </button>
              </div>
              <p className="mt-2 text-[10.5px] text-faint">Offline tutor: answers come from AEGIS lessons. The live AI plugs in here later.</p>
            </form>
          </>
        ) : (
          <MemoryPanel />
        )}
      </aside>
    </>
  );
}

/** What the tutor remembers, in plain words. The student can rename or clear it. */
function MemoryPanel() {
  const { memory, save, forget } = useTutor();
  const hard = Object.entries(memory.struggled).filter(([, n]) => n > 0).map(([id, n]) => ({ l: lessonById(id), n })).filter((x) => x.l).sort((a, b) => b.n - a.n);
  const known = Object.keys(memory.known).map((id) => lessonById(id)).filter(Boolean);
  const pats = patterns(memory);
  const row = (key: string, children: ReactNode) => <li key={key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] text-muted hover:bg-pane-2/60">{children}</li>;
  return (
    <div className="tutor-body space-y-5" data-testid="tutor-memory">
      <section>
        <p className="exam-label">What should I call you?</p>
        <input defaultValue={memory.name ?? ''} onBlur={(e) => save({ memory: { ...memory, name: e.target.value.trim() || undefined } })} placeholder="Your first name" className="tutor-field" aria-label="Your name" />
      </section>
      <section>
        <p className="exam-label">How you like explanations</p>
        <div className="seg">
          {(['simple', 'deep'] as const).map((k) => (
            <button key={k} type="button" onClick={() => save({ memory: { ...memory, style: k } })} className={cx('seg-btn', memory.style === k && 'is-on')}>
              {k === 'simple' ? 'Simple, with analogies' : 'Technical'}
            </button>
          ))}
        </div>
      </section>
      <section>
        <p className="exam-label">Mistake patterns</p>
        {pats.length ? (
          <ul>
            {pats.map((x) => row(`p${x.pair}`, <><i className="size-1.5 shrink-0 rounded-full bg-[#ffa94d]" /> <span className="flex-1 truncate">{PAIRS[x.pair].a} vs {PAIRS[x.pair].b}</span> <span className="text-[10.5px] text-faint">{x.n} misses</span></>))}
          </ul>
        ) : (
          <p className="text-[12px] text-faint">When the same mix-up keeps showing in your missed questions, I'll point it out.</p>
        )}
      </section>
      <section>
        <p className="exam-label flex items-center gap-1.5">
          <Brain className="size-3.5" /> Found hard ({hard.length})
        </p>
        {hard.length ? (
          <ul>
            {hard.slice(0, 12).map(({ l, n }) => row(l!.id, <><i className="size-1.5 shrink-0 rounded-full bg-[#ff8f6b]" /> <span className="flex-1 truncate">{l!.title}</span> <span className="text-[10.5px] text-faint">{chapterOf(l)?.title} · ×{n}</span></>))}
          </ul>
        ) : (
          <p className="text-[12px] text-faint">Nothing yet. When something doesn't click, I'll note it here and bring it back later.</p>
        )}
      </section>
      <section>
        <p className="exam-label">Confirmed you know ({known.length})</p>
        {known.length ? <ul>{known.slice(0, 12).map((l) => row(l!.id, <><i className="size-1.5 shrink-0 rounded-full bg-[#38d9a9]" /> <span className="flex-1 truncate">{l!.title}</span></>))}</ul> : <p className="text-[12px] text-faint">Answer a quick check and I'll stop asking about it.</p>}
      </section>
      <p className="text-[11px] leading-relaxed text-faint">Saved only on this computer. {CHAPTERS.length} CCNA chapters are linked so I can tell what each topic builds on.</p>
      <button type="button" onClick={forget} className="flex items-center gap-1.5 text-[12px] text-faint hover:text-[#ff8f6b]" data-testid="tutor-forget">
        <Trash2 className="size-3.5" /> Forget everything
      </button>
    </div>
  );
}

/** Pinned while you are on a detour: where you came from, and a way back. */
function DetourBar() {
  const { detour, ready, save, endDetour } = useTutor();
  if (!ready || !detour) return null;
  const from = lessonById(detour.fromLesson);
  const to = lessonById(detour.to);
  const back = () => {
    const where = detour.from.where ?? 'learn/topics';
    useDashItem.getState().setItem(where);
    if (where === 'learn/topics') useBookLesson.getState().open(detour.fromLesson);
    endDetour();
  };
  return (
    <div className="detour-bar" role="status" data-testid="detour-bar">
      <span className="detour-dot" aria-hidden />
      <span className="min-w-0 truncate text-[12.5px]">
        Detour to <b className="text-text">{to?.title}</b> from <b className="text-text">{from?.title ?? detour.from.label}</b>
      </span>
      <button type="button" onClick={back} className="detour-back" data-testid="detour-back">
        <ArrowLeft className="size-3.5" /> Back to {from?.title ?? detour.from.label}
      </button>
      <button type="button" onClick={() => save({ detour: null })} className="grid size-6 place-items-center rounded-full text-faint hover:text-text" aria-label="End detour">
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** The corner button. Shows a quiet offer when you look stuck. */
function Launcher() {
  const { open, toggle, nudge, ask, setNudge } = useTutor();
  if (open) return null;
  return (
    <div className="tutor-launch-wrap">
      {nudge && (
        <div className="tutor-nudge" role="status" data-testid="tutor-nudge">
          <button type="button" onClick={() => ask(nudge)} className="text-left">
            Stuck on <b className="text-text">{nudge.label}</b>? I can help.
          </button>
          <button type="button" onClick={() => setNudge(null)} className="text-faint hover:text-text" aria-label="Dismiss">
            <X className="size-3.5" />
          </button>
        </div>
      )}
      <button type="button" onClick={toggle} className={cx('tutor-launch', nudge && 'is-nudge')} aria-label="Open the AI study tutor" data-testid="tutor-launch">
        <Sparkles className="size-5" />
      </button>
    </div>
  );
}

/** "Why this topic": a chain of chapters coloured by how well you know each one. Tap to open. */
function TopicMap({ nodes }: { nodes: MapNode[] }) {
  return (
    <ol className="tutor-map" aria-label="How this topic connects">
      {nodes.map((n, i) => {
        const c = n.score === null ? 'var(--line-strong)' : n.score >= 0.7 ? '#38d9a9' : n.score >= 0.45 ? '#ffa94d' : '#ff6b81';
        return (
          <li key={`${n.id}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <ArrowRight className="size-3 shrink-0 text-faint" aria-hidden />}
            <button
              type="button"
              onClick={() => {
                useDashItem.getState().setItem('learn/topics');
                useBookLesson.getState().open(n.id);
              }}
              className={cx('tutor-node', n.here && 'is-here')}
              style={{ '--c': c } as React.CSSProperties}
              title={n.score === null ? 'Not started' : `${Math.round(n.score * 100)}% known`}
            >
              <i />
              {n.title}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Highlight any sentence on a Learn page and a small "Ask about this" bubble appears beside it. */
function SelectionAsk() {
  const [pos, setPos] = useState<{ x: number; y: number; text: string } | null>(null);
  useEffect(() => {
    const onUp = () =>
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? '';
        if (!sel || sel.isCollapsed || text.length < 3 || text.length > 400) return setPos(null);
        const anchor = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
        if (!anchor?.closest('[data-testid="dash-playground"]') || anchor.closest('input, textarea, .tutor-dock')) return setPos(null);
        const r = sel.getRangeAt(0).getBoundingClientRect();
        setPos({ x: Math.min(window.innerWidth - 180, r.left + r.width / 2), y: Math.max(56, r.top - 44), text });
      }, 10);
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest?.('.tutor-select')) setPos(null);
    };
    const onScroll = () => setPos(null);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, []);
  if (!pos) return null;
  return (
    <button
      type="button"
      className="tutor-select"
      style={{ left: pos.x, top: pos.y }}
      onClick={() => {
        useTutor.getState().askText({ kind: 'Highlight', label: pos.text.slice(0, 60), text: pos.text, where: useDashItem.getState().item }, pos.text);
        window.getSelection()?.removeAllRanges();
        setPos(null);
      }}
      data-testid="tutor-select"
    >
      <Sparkles className="size-3.5" /> Ask about this
    </button>
  );
}
