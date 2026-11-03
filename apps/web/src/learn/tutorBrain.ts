// AEGIS study tutor: the local "brain" used until the server tutor exists.
// It is grounded in the CCNA book: every answer comes from a lesson and says which one.
// It knows how chapters build on each other, checks what you already know from your progress,
// and can send you on a short detour to a prerequisite and bring you back with the link explained.
// Swap respond() for a POST /api/tutor call later; keep keys server-side.
import source from '@/content/books/ccna-v8.1.json';

type Q = { id: string; prompt: string; options: string[]; answerIndex: number; explanation: string; skill?: string };
export type BookLesson = {
  id: string;
  chapterId: string;
  title: string;
  subtitle?: string;
  tags?: string[];
  why?: string;
  commonMistake?: string;
  beginner: { definition?: string; analogy?: string; example?: string; remember?: string };
  technical: { definition?: string; explanation?: string; application?: string; remember?: string };
  teachingGuide?: { concept?: string; mechanism?: string; commonTrap?: string; teachBack?: string };
  assessments?: { beginner?: Q[]; technical?: Q[] };
};
type Chapter = { id: string; number: number; title: string; lessonIds: string[] };
const book = source as unknown as { chapters: Chapter[]; lessons: BookLesson[] };
export const LESSONS = book.lessons;
export const CHAPTERS = book.chapters;
const byId = new Map(LESSONS.map((l) => [l.id, l]));
export const lessonById = (id?: string) => (id ? byId.get(id) : undefined);
export const chapterOf = (l?: BookLesson) => CHAPTERS.find((c) => c.id === l?.chapterId);

/** Which chapters each chapter builds on. Hand-checked against the CCNA blueprint order. */
const PREREQ: Record<number, number[]> = { 2: [1], 3: [2], 4: [1, 2], 5: [1], 6: [5], 7: [5], 8: [4, 5], 9: [4, 8], 10: [6, 7], 11: [6], 12: [1], 13: [5], 14: [5, 12], 15: [5, 12], 16: [5, 14], 17: [8, 14], 18: [1, 8], 19: [6], 20: [3] };
/** Flashcard deck topics mapped to book chapters, so flashcard results count as evidence. */
const FLASH_TO_CH: Record<string, number[]> = { OSI: [1], Hardware: [2], Switching: [4, 9], VLANs: [8], IPv4: [5, 7], IPv6: [13], Routing: [6, 10, 11], Services: [12, 15, 16], Security: [14, 17], Wireless: [18], Automation: [19, 20] };

// ---------- types ----------
export type TutorCtx = {
  /** What the student is looking at, e.g. "Flashcard", "Lesson", "Case" */
  kind: string;
  label: string;
  /** Extra text from the item (question, answer) used to find the right lesson */
  text?: string;
  lessonId?: string;
  /** The dashboard item path to come back to (e.g. "learn/flashcards") */
  where?: string | null;
};
export type Action =
  | { k: 'simple' }
  | { k: 'deep' }
  | { k: 'stuck' }
  | { k: 'quiz' }
  | { k: 'answer'; lesson: string; q: number; pick: number; then?: 'prereq' }
  | { k: 'here'; pre: string }
  | { k: 'go'; pre: string }
  | { k: 'skip'; pre: string }
  | { k: 'again' }
  | { k: 'good' }
  | { k: 'start'; lesson: string };
export type Msg = { id: number; role: 'ai' | 'me'; text: string; source?: { id: string; title: string }; actions?: { label: string; a: Action; primary?: boolean }[]; tone?: 'ok' | 'bad' };
export type Memory = { struggled: Record<string, number>; known: Record<string, 1>; style?: 'simple' | 'deep'; visits: number; last?: { lesson: string; at: string }; name?: string };
export type Detour = { from: TutorCtx; fromLesson: string; to: string };
export type Reply = { msgs: Omit<Msg, 'id'>[]; memory?: Memory; go?: string; detour?: Detour | null };

// ---------- finding the lesson ----------
const STOP = new Set('the a an and or of to in on for is are what which how why does do with by from this that it its as at be can into your you'.split(' '));
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9./ ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
/** Best matching lesson for whatever the student is looking at. */
export function resolveLesson(ctx: TutorCtx): BookLesson | undefined {
  if (ctx.lessonId && byId.has(ctx.lessonId)) return byId.get(ctx.lessonId);
  const want = words(`${ctx.label} ${ctx.text ?? ''}`);
  if (!want.length) return undefined;
  const chHint = Object.entries(FLASH_TO_CH).find(([t]) => ctx.label.toLowerCase() === t.toLowerCase())?.[1];
  let best: BookLesson | undefined;
  let bestScore = 0;
  for (const l of LESSONS) {
    const ch = chapterOf(l);
    const hay = new Set(words(`${l.title} ${l.subtitle ?? ''} ${(l.tags ?? []).join(' ')} ${ch?.title ?? ''} ${l.beginner.definition ?? ''}`));
    let s = want.reduce((n, w) => n + (hay.has(w) ? (words(l.title).includes(w) ? 3 : 1) : 0), 0);
    if (chHint && ch && chHint.includes(ch.number)) s += 4;
    // Strong bonus when the whole lesson title appears in what the student is looking at.
    const tw = words(l.title);
    if (tw.length && tw.every((w) => want.includes(w))) s += 3 + tw.length;
    if (s > bestScore) {
      bestScore = s;
      best = l;
    }
  }
  return bestScore >= 2 ? best : undefined;
}

// ---------- what the student knows ----------
const read = <T,>(k: string): T | null => {
  try {
    const v = window.localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
};
/** 0..1 confidence for a chapter, or null when there is no evidence at all. */
export function chapterScore(n: number, mem: Memory): number | null {
  const ch = CHAPTERS.find((c) => c.number === n);
  if (!ch) return null;
  const parts: number[] = [];
  const done = new Set(read<{ completed?: string[] }>('aegis.ccna-book.v8.1')?.completed ?? []);
  const nDone = ch.lessonIds.filter((id) => done.has(id)).length;
  if (nDone) parts.push(nDone / ch.lessonIds.length);
  const flash = read<{ topic?: Record<string, { r: number; n: number }> }>('aegis.flash.ccna.v1')?.topic ?? {};
  for (const [t, chs] of Object.entries(FLASH_TO_CH)) if (chs.includes(n) && (flash[t]?.n ?? 0) >= 3) parts.push(flash[t].r / flash[t].n);
  const ids = ch.lessonIds;
  if (ids.some((id) => mem.known[id])) parts.push(0.85);
  const struggles = ids.reduce((s, id) => s + (mem.struggled[id] ?? 0), 0);
  if (struggles) parts.push(Math.max(0, 0.5 - struggles * 0.15));
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}
/** The prerequisite chapters for a lesson, weakest first, with their key lesson. */
export function prereqsOf(l: BookLesson, mem: Memory) {
  const ch = chapterOf(l);
  return (PREREQ[ch?.number ?? 0] ?? [])
    .map((n) => {
      const c = CHAPTERS.find((x) => x.number === n)!;
      return { chapter: c, lesson: byId.get(c.lessonIds[0])!, score: chapterScore(n, mem) };
    })
    .filter((p) => p.lesson)
    .sort((a, b) => (a.score ?? 0.5) - (b.score ?? 0.5));
}

// ---------- writing ----------
const lc = (s = '') => (s ? s[0].toLowerCase() + s.slice(1) : s);
const src = (l: BookLesson) => ({ id: l.id, title: `${l.id} ${l.title}` });
const checkQ = (l: BookLesson) => l.assessments?.beginner?.find((q) => q.skill !== 'define') ?? l.assessments?.beginner?.[0] ?? l.assessments?.technical?.[0];
const simple = (l: BookLesson) =>
  [l.beginner.definition, l.beginner.analogy && `Think of it like this: ${lc(l.beginner.analogy)}`, l.beginner.example && `For example: ${lc(l.beginner.example)}`, l.beginner.remember && `**Remember:** ${l.beginner.remember}`].filter(Boolean).join('\n\n');
const deep = (l: BookLesson) =>
  [l.technical.explanation ?? l.technical.definition, l.teachingGuide?.mechanism && `How it plays out: ${lc(l.teachingGuide.mechanism)}`, l.technical.application, l.teachingGuide?.commonTrap && `**Watch out:** ${l.teachingGuide.commonTrap}`].filter(Boolean).join('\n\n');
/** One sentence on why the prerequisite matters for the current lesson. */
export const bridge = (pre: BookLesson, cur: BookLesson) =>
  `**${cur.title}** builds on **${pre.title}**. ${pre.beginner.remember ?? pre.why ?? ''} That is why ${lc(cur.why ?? cur.beginner.definition ?? '')}`.trim();
const follow = (): Msg['actions'] => [
  { label: 'Got it', a: { k: 'good' }, primary: true },
  { label: 'Still confused', a: { k: 'stuck' } },
  { label: 'Quiz me', a: { k: 'quiz' } },
];

/** First message when the tutor opens on something. */
export function greet(ctx: TutorCtx, mem: Memory, name: string): Reply {
  const l = resolveLesson(ctx);
  const hi = name ? `Hi ${name} 👋` : 'Hi 👋';
  if (!l)
    return { msgs: [{ role: 'ai', text: `${hi} I'm your study tutor. What are you working on? Ask me anything about it and I'll explain it from the AEGIS lessons.` }] };
  const weakBefore = prereqsOf(l, mem).find((p) => p.chapter.lessonIds.some((id) => (mem.struggled[id] ?? 0) > 0));
  const recall = weakBefore ? `\n\nLast time, **${weakBefore.chapter.title}** was a bit tricky for you, and it feeds into this.` : '';
  return {
    msgs: [
      {
        role: 'ai',
        text: `${hi} I see you're on **${l.title}**${ctx.kind ? ` (${ctx.kind.toLowerCase()})` : ''}. Want it explained more simply, or is something specific not clicking?${recall}`,
        source: src(l),
        actions: [
          { label: 'Explain it simply', a: { k: 'simple' }, primary: mem.style !== 'deep' },
          { label: 'Go deeper', a: { k: 'deep' }, primary: mem.style === 'deep' },
          { label: "Something's not clicking", a: { k: 'stuck' } },
          { label: 'Quiz me', a: { k: 'quiz' } },
        ],
      },
    ],
    memory: { ...mem, visits: mem.visits + 1, last: { lesson: l.id, at: new Date().toISOString() } },
  };
}

/** React to a button. */
export function act(a: Action, ctx: TutorCtx, mem: Memory, detour: Detour | null): Reply {
  const l = resolveLesson(ctx);
  if (!l) return { msgs: [{ role: 'ai', text: "Tell me what you're stuck on in a few words and I'll find the right lesson." }] };
  switch (a.k) {
    case 'simple':
      return { msgs: [{ role: 'ai', text: simple(l), source: src(l), actions: follow() }], memory: { ...mem, style: 'simple' } };
    case 'deep':
      return { msgs: [{ role: 'ai', text: deep(l), source: src(l), actions: follow() }], memory: { ...mem, style: 'deep' } };
    case 'good':
      return { msgs: [{ role: 'ai', text: `Nice. ${l.teachingGuide?.teachBack ? `One quick way to lock it in: try answering this in your own words: *${l.teachingGuide.teachBack}*` : 'Keep going, and tap me any time.'}` }], memory: { ...mem, known: { ...mem.known, [l.id]: 1 } } };
    case 'quiz': {
      const q = checkQ(l);
      if (!q) return { msgs: [{ role: 'ai', text: `Explain **${l.title}** back to me in one sentence, as if to a new teammate.` }] };
      return { msgs: [{ role: 'ai', text: q.prompt, source: src(l), actions: q.options.map((o, i) => ({ label: o, a: { k: 'answer', lesson: l.id, q: 0, pick: i } as Action })) }] };
    }
    case 'answer': {
      const target = byId.get(a.lesson)!;
      const q = checkQ(target);
      if (!q) return { msgs: [] };
      const ok = a.pick === q.answerIndex;
      const m: Memory = ok ? { ...mem, known: { ...mem.known, [target.id]: 1 } } : { ...mem, struggled: { ...mem.struggled, [target.id]: (mem.struggled[target.id] ?? 0) + 1 } };
      if (a.then === 'prereq') {
        if (ok) return { msgs: [{ role: 'ai', tone: 'ok', text: `Correct, so **${target.title}** isn't the problem. Let me explain **${l.title}** from a different angle.` }, ...angle(l)], memory: m };
        return { msgs: [{ role: 'ai', tone: 'bad', text: `Not quite: ${q.explanation}\n\nThat's the gap. **${l.title}** sits on top of **${chapterOf(target)?.title}**. Let's fix that first.`, actions: detourActions(target) }], memory: m };
      }
      return { msgs: [{ role: 'ai', tone: ok ? 'ok' : 'bad', text: `${ok ? 'Correct! ' : 'Not quite. '}${q.explanation}`, actions: ok ? undefined : [{ label: 'Explain it simply', a: { k: 'simple' }, primary: true }, { label: 'Still confused', a: { k: 'stuck' } }] }], memory: m };
    }
    case 'stuck': {
      const m: Memory = { ...mem, struggled: { ...mem.struggled, [l.id]: (mem.struggled[l.id] ?? 0) + 1 } };
      const pres = prereqsOf(l, m);
      const weak = pres.find((p) => p.score !== null && p.score < 0.55);
      if (weak)
        return { msgs: [{ role: 'ai', text: `I think I see why. **${l.title}** builds on **${weak.chapter.title}**, and your progress there is still low (${Math.round((weak.score ?? 0) * 100)}%). Let's make that solid first.`, actions: detourActions(weak.lesson) }], memory: m };
      const unknown = pres.find((p) => p.score === null && !p.chapter.lessonIds.some((id) => m.known[id]));
      if (unknown) {
        const q = checkQ(unknown.lesson);
        if (q)
          return {
            msgs: [{ role: 'ai', text: `Quick check first, because **${l.title}** depends on **${unknown.chapter.title}**:\n\n${q.prompt}`, source: src(unknown.lesson), actions: q.options.map((o, i) => ({ label: o, a: { k: 'answer', lesson: unknown.lesson.id, q: 0, pick: i, then: 'prereq' } as Action })) }],
            memory: m,
          };
      }
      return { msgs: angle(l), memory: m };
    }
    case 'here': {
      const pre = byId.get(a.pre)!;
      return { msgs: [{ role: 'ai', text: `The 2-minute version of **${pre.title}**:\n\n${simple(pre)}\n\n---\n\n${bridge(pre, l)}`, source: src(pre), actions: follow() }], memory: { ...mem, known: { ...mem.known, [pre.id]: 1 } } };
    }
    case 'skip':
      return { msgs: [{ role: 'ai', text: `Okay, I'll trust you on that. Let me try **${l.title}** another way.` }, ...angle(l)], memory: { ...mem, known: { ...mem.known, [a.pre]: 1 } } };
    case 'go': {
      const pre = byId.get(a.pre)!;
      return {
        msgs: [{ role: 'ai', text: `Taking you to **${pre.title}**. You came from **${l.title}**, so I'll focus on the part that matters there. When you're ready, press **Back** in the bar at the bottom and I'll connect the two.`, source: src(pre) }],
        go: pre.id,
        detour: { from: ctx, fromLesson: l.id, to: pre.id },
      };
    }
    case 'again':
      return { msgs: [{ role: 'ai', text: mem.style === 'deep' ? deep(l) : simple(l), source: src(l), actions: follow() }] };
    case 'start':
      return { msgs: [] };
  }
  void detour;
  return { msgs: [] };
}

const detourActions = (pre: BookLesson): Msg['actions'] => [
  { label: 'Explain it here', a: { k: 'here', pre: pre.id }, primary: true },
  { label: `Take me to ${pre.title}`, a: { k: 'go', pre: pre.id } },
  { label: 'Skip, I know it', a: { k: 'skip', pre: pre.id } },
];
/** A different way in: the core idea, the mechanism and the usual trap, then a teach-back. */
function angle(l: BookLesson): Omit<Msg, 'id'>[] {
  const parts = [l.teachingGuide?.concept && `**The core idea:** ${l.teachingGuide.concept}`, l.teachingGuide?.mechanism && `**What actually happens:** ${l.teachingGuide.mechanism}`, (l.teachingGuide?.commonTrap ?? l.commonMistake) && `**Where people slip:** ${l.teachingGuide?.commonTrap ?? l.commonMistake}`].filter(Boolean);
  return [{ role: 'ai', text: parts.length ? parts.join('\n\n') : simple(l), source: src(l), actions: follow() }];
}

/** Arriving on the prerequisite during a detour. */
export function detourArrive(d: Detour): Reply {
  const pre = byId.get(d.to)!;
  const cur = byId.get(d.fromLesson)!;
  return { msgs: [{ role: 'ai', text: `Here's **${pre.title}**. Read it with one question in mind: *how does this help with ${cur.title.replace(/\?$/, '')}?*\n\n${pre.beginner.remember ? `The key line: ${pre.beginner.remember}` : ''}`, source: src(pre) }] };
}
/** Coming back from a detour: connect the two, then offer the original explanation again. */
export function detourReturn(d: Detour, mem: Memory): Reply {
  const pre = byId.get(d.to)!;
  const cur = byId.get(d.fromLesson)!;
  return {
    msgs: [{ role: 'ai', text: `Welcome back to **${cur.title}**. Now that **${pre.title}** is clearer:\n\n${bridge(pre, cur)}\n\nWant me to explain **${cur.title}** again now?`, source: src(cur), actions: [{ label: 'Yes, explain it again', a: { k: 'again' }, primary: true }, { label: "I've got it now", a: { k: 'good' } }] }],
    memory: { ...mem, known: { ...mem.known, [pre.id]: 1 } },
  };
}

/** Free text: route simple intents to buttons, otherwise answer from the closest lesson. */
export function chat(text: string, ctx: TutorCtx, mem: Memory, detour: Detour | null): Reply {
  const t = text.toLowerCase();
  if (/simpl|easy|eli5|basic/.test(t)) return act({ k: 'simple' }, ctx, mem, detour);
  if (/deep|detail|technical|more/.test(t)) return act({ k: 'deep' }, ctx, mem, detour);
  if (/quiz|test me|question/.test(t)) return act({ k: 'quiz' }, ctx, mem, detour);
  if (/confus|don.?t (get|understand)|lost|stuck|no idea|not clicking/.test(t)) return act({ k: 'stuck' }, ctx, mem, detour);
  const hit = resolveLesson({ kind: '', label: text, text });
  if (hit) {
    const cur = resolveLesson(ctx);
    return {
      msgs: [{ role: 'ai', text: `${mem.style === 'deep' ? deep(hit) : simple(hit)}${cur && cur.id !== hit.id ? `\n\n${bridge(hit, cur)}` : ''}`, source: src(hit), actions: follow() }],
    };
  }
  return { msgs: [{ role: 'ai', text: "I couldn't match that to a lesson yet. Try naming the term (for example *trunk*, *ARP*, *subnet mask*), or tap one of the buttons." }] };
}
