'use client';

// The study tutor: a dock on the right, a launcher in the corner, and the detour bar.
// It follows you between pages, remembers what was hard, and can send you to a prerequisite
// and bring you back with the link explained. Answers come from the AEGIS lessons.
import { ArrowLeft, ArrowRight, Brain, Copy, ExternalLink, Send, Sparkles, Trash2, X } from 'lucide-react';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/components/ui';
import { useDashItem } from '@/components/cert/DashboardSide';
import { act, chat, CHAPTERS, chapterOf, detourArrive, detourReturn, greet, lessonById, PAIRS, patterns, resolveLesson, welcome, type Action, type MapNode, type Reply } from '@/learn/tutorBrain';
import { askLive, chatgptUrl, claudeUrl, externalPrompt, liveStatus, payloadFor, type LiveStatus } from '@/learn/liveTutor';
import { useBookLesson } from '@/state/bookLesson';
import { useTutor } from '@/state/tutor';

/** Inline formatting: **bold**, *italic* and `code`. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|\b_[^_\s][^_]*_\b)/g).map((seg, k) =>
        seg.startsWith('**') && seg.endsWith('**') ? (
          <b key={k} className="font-semibold text-text">{seg.slice(2, -2)}</b>
        ) : seg.startsWith('`') && seg.endsWith('`') ? (
          <code key={k} className="tutor-code">{seg.slice(1, -1)}</code>
        ) : ((seg.startsWith('*') && seg.endsWith('*')) || (seg.startsWith('_') && seg.endsWith('_'))) && seg.length > 2 ? (
          <em key={k}>{seg.slice(1, -1)}</em>
        ) : (
          <Fragment key={k}>{seg}</Fragment>
        ),
      )}
    </>
  );
}
/** Formatter for tutor text from the offline tutor or a live AI: paragraphs, lists, code blocks and a --- divider. */
function Rich({ text }: { text: string }) {
  const parts = text.replace(/\r/g, '').split(/(```[\s\S]*?```)/g);
  return (
    <>
      {parts.map((part, pi) => {
        if (part.startsWith('```')) return <pre key={pi} className="flash-cli !mt-2 !text-[12px]">{part.replace(/^```\w*\n?/, '').replace(/```$/, '').trim()}</pre>;
        return part
          .split(/\n{2,}/)
          .filter((p) => p.trim())
          .map((p, i) => {
            if (p.trim() === '---') return <hr key={`${pi}-${i}`} className="my-2 border-line" />;
            const lines = p.split('\n');
            if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l)))
              return (
                <ul key={`${pi}-${i}`} className="tutor-list [&+p]:mt-2">
                  {lines.map((l, k) => (
                    <li key={k}>
                      <Inline text={l.replace(/^\s*([-*•]|\d+[.)])\s+/, '')} />
                    </li>
                  ))}
                </ul>
              );
            return (
              <p key={`${pi}-${i}`} className="[&+*]:mt-2">
                {lines.map((l, k) => (
                  <Fragment key={k}>
                    {k > 0 && <br />}
                    <Inline text={l.replace(/^#+\s*/, '')} />
                  </Fragment>
                ))}
              </p>
            );
          });
      })}
    </>
  );
}

export function TutorDock() {
  const s = useTutor();
  const [tab, setTab] = useState<'chat' | 'memory'>('chat');
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [live, setLive] = useState<LiveStatus | null>(null);
  useEffect(() => {
    liveStatus().then(setLive);
  }, []);
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
      // Keep the conversation on the lesson just discussed, so "why?" and "quiz me" follow it.
      if (r.focus) {
        const fl = lessonById(r.focus);
        if (fl) useTutor.setState({ ctx: { kind: 'Chat', label: fl.title, lessonId: fl.id, where: useDashItem.getState().item } });
      }
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
      // Opened from the corner: use the lesson on screen as the context, so "what am I on?" just works.
      const item = useDashItem.getState().item;
      const lessonId = useBookLesson.getState().lessonId;
      if (!st.ctx && item === 'learn/topics' && lessonId) {
        const l = lessonById(lessonId);
        if (l) useTutor.setState({ ctx: { kind: 'Lesson', label: l.title, lessonId, where: item } });
      }
      const ctxNow = useTutor.getState().ctx;
      const w = welcome(st.memory);
      const l = ctxNow ? resolveLesson(ctxNow) : undefined;
      apply(l && !w.msgs[0]?.actions ? greet(ctxNow!, st.memory, st.memory.name ?? '') : w);
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
  const send = async () => {
    const t = input.trim();
    if (!t || typing) return;
    setInput('');
    const st = useTutor.getState();
    st.push([{ role: 'me', text: t }]);
    const ctx = st.ctx ?? { kind: '', label: t };
    const offline = () => apply(chat(t, ctx, st.memory, st.detour, st.awaiting));
    if (!live?.available) return offline();
    // Live AI: grounded in the lesson in focus, or the lesson the question names.
    // A question that names a topic is grounded in that topic; "why?" or "explain this" stays on the current one.
    const lesson = resolveLesson({ kind: '', label: t, text: t }, true) ?? resolveLesson(ctx);
    const history = useTutor.getState().msgs.map((m) => ({ ...m }));
    if (st.awaiting && lesson) history[history.length - 1].text = `Here is my teach-back of "${lesson.title}": ${t}\n\nGrade it kindly: what I got right, what is missing or wrong, and a model answer in one or two sentences.`;
    setTyping(true);
    try {
      const r = await askLive(payloadFor(history, lesson, st.memory, ctx.kind ? `${ctx.kind}: ${ctx.label}` : useDashItem.getState().item));
      setTyping(false);
      useTutor.getState().push([{ role: 'ai', text: r.text, live: r.provider, source: lesson ? { id: lesson.id, title: `${lesson.id} ${lesson.title}` } : undefined, actions: [{ label: 'Simpler', a: { k: 'simple' } }, { label: 'Quiz me', a: { k: 'quiz' } }, { label: 'Show the map', a: { k: 'map' } }] }]);
      if (st.awaiting) useTutor.getState().setAwaiting(null);
      if (lesson && lesson.id !== resolveLesson(ctx)?.id) useTutor.setState({ ctx: { kind: 'Chat', label: lesson.title, lessonId: lesson.id, where: useDashItem.getState().item } });
    } catch {
      setTyping(false);
      offline();
    }
  };
  /** The same question, ready for the student's own ChatGPT or Claude. */
  const lastQuestion = [...s.msgs].reverse().find((m) => m.role === 'me')?.text ?? '';
  const outside = () => externalPrompt(lastQuestion, s.ctx ? resolveLesson(s.ctx) : undefined, s.memory);

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
            <p className="flex items-center gap-1.5 truncate text-[11.5px] text-faint">
              <i className={cx('size-1.5 shrink-0 rounded-full', live?.available ? 'bg-[#38d9a9] shadow-[0_0_6px_#38d9a9]' : 'bg-faint')} title={live?.available ? `Live AI: ${live.providers.join(', ')}` : 'Offline tutor'} />
              <span className="truncate">{cur ? `On: ${cur.title}` : s.ctx?.label ? `On: ${s.ctx.label}` : 'Ask about anything you study'}</span>
            </p>
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
                    {m.live && <span className="tutor-live-tag">✦ {m.live}</span>}
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
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-faint" data-testid="tutor-footer">
                <span>{live?.available ? `Live AI: ${live.providers[0]} · grounded in AEGIS lessons` : 'Offline tutor: answers from AEGIS lessons'}</span>
                <span className="ml-auto flex items-center gap-2">
                  Ask in
                  <a href={chatgptUrl(outside())} target="_blank" rel="noopener noreferrer" className="tutor-out" data-testid="tutor-chatgpt">
                    ChatGPT <ExternalLink className="size-3" />
                  </a>
                  <a href={claudeUrl(outside())} target="_blank" rel="noopener noreferrer" className="tutor-out" data-testid="tutor-claude">
                    Claude <ExternalLink className="size-3" />
                  </a>
                  <button type="button" onClick={() => navigator.clipboard?.writeText(outside())} className="tutor-out" title="Copy the question with the lesson as context">
                    <Copy className="size-3" />
                  </button>
                </span>
              </div>
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
