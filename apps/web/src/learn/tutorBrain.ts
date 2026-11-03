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
  | { k: 'start'; lesson: string }
  | { k: 'map' }
  | { k: 'teach' }
  | { k: 'job' }
  | { k: 'jobAnswer'; ch: number }
  | { k: 'compare'; pair: number }
  | { k: 'warm'; lesson: string }
  | { k: 'open'; lesson: string };
export type MapNode = { id: string; title: string; score: number | null; here?: boolean };
export type Msg = { id: number; role: 'ai' | 'me'; text: string; source?: { id: string; title: string }; actions?: { label: string; a: Action; primary?: boolean }[]; tone?: 'ok' | 'bad'; map?: MapNode[]; table?: { head: string[]; rows: string[][] } };
/** A missed question somewhere in AEGIS (flashcard, exam, tutor), kept short. */
export type Miss = { label: string; text: string; at: string };
export type Memory = { struggled: Record<string, number>; known: Record<string, 1>; style?: 'simple' | 'deep'; visits: number; last?: { lesson: string; at: string }; name?: string; misses?: Miss[]; warmDay?: string };
export type Detour = { from: TutorCtx; fromLesson: string; to: string };
export type Reply = { msgs: Omit<Msg, 'id'>[]; memory?: Memory; go?: string; detour?: Detour | null; /** The next thing the student types is a teach-back for this lesson. */ await?: string | null };

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
  // Actions that carry everything they need, so they work even without a current topic.
  if (a.k === 'compare') return compareReply(a.pair);
  if (a.k === 'jobAnswer') return jobAnswer(a.ch);
  if (a.k === 'answer' && !a.then) {
    const target = byId.get(a.lesson);
    const q = target && checkQ(target);
    if (target && q) {
      const ok = a.pick === q.answerIndex;
      const m: Memory = ok ? { ...mem, known: { ...mem.known, [target.id]: 1 } } : { ...mem, struggled: { ...mem.struggled, [target.id]: (mem.struggled[target.id] ?? 0) + 1 } };
      return { msgs: [{ role: 'ai', tone: ok ? 'ok' : 'bad', text: `${ok ? 'Correct! ' : 'Not quite. '}${q.explanation}`, source: src(target), actions: ok ? undefined : [{ label: `Open ${target.title}`, a: { k: 'open', lesson: target.id }, primary: true }] }], memory: m };
    }
  }
  if (a.k === 'good' && !resolveLesson(ctx)) return { msgs: [{ role: 'ai', text: 'Okay. Tap ✦ next to anything you study whenever you want help.' }] };
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
    case 'map':
      return mapReply(l, mem);
    case 'teach':
      return { msgs: [{ role: 'ai', text: `Teach it back to me. In one or two sentences, explain **${l.title}** as if to a new teammate. Type it below and I'll tell you what you covered and what you missed.`, source: src(l) }], await: l.id };
    case 'job':
      return jobReply(l);
    case 'jobAnswer':
      return jobAnswer(a.ch);
    case 'compare':
      return compareReply(a.pair);
    case 'warm':
    case 'open':
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
export function chat(text: string, ctx: TutorCtx, mem: Memory, detour: Detour | null, awaiting?: string | null): Reply {
  if (awaiting && byId.has(awaiting)) return gradeTeach(text, byId.get(awaiting)!, mem);
  const t = text.toLowerCase();
  const vs = text.match(/(?:difference between\s+)?(.+?)\s+(?:vs\.?|versus|and|or)\s+(.+?)\??$/i);
  if (vs && /\bvs\.?\b|versus|difference/i.test(text)) {
    const pi = findPair(`${vs[1]} | ${vs[2]}`);
    if (pi >= 0) return compareReply(pi);
    const a = resolveLesson({ kind: '', label: vs[1], text: vs[1] });
    const b = resolveLesson({ kind: '', label: vs[2], text: vs[2] });
    if (a && b && a.id !== b.id) return compareLessons(a, b);
  }
  if (/map|path|connect|builds on|prereq/.test(t)) return act({ k: 'map' }, ctx, mem, detour);
  if (/ticket|real (life|job|world)|on the job/.test(t)) return act({ k: 'job' }, ctx, mem, detour);
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


// ======================================================================
// Upgrades: topic map, teach-back, warm-up, mistake patterns, compare, job tickets
// ======================================================================

/** Chapters that build on this one (the reverse of PREREQ). */
const dependents = (n: number) => Object.entries(PREREQ).filter(([, v]) => v.includes(n)).map(([k]) => Number(k));
const node = (c: Chapter, mem: Memory, here = false): MapNode => ({ id: c.lessonIds[0], title: c.title, score: chapterScore(c.number, mem), here });

/** "Why this topic": what it builds on, where you are, and what comes after. */
export function mapReply(l: BookLesson, mem: Memory): Reply {
  const ch = chapterOf(l);
  if (!ch) return { msgs: [] };
  const before = (PREREQ[ch.number] ?? []).map((n) => CHAPTERS.find((c) => c.number === n)!).filter(Boolean);
  const after = dependents(ch.number).map((n) => CHAPTERS.find((c) => c.number === n)!).filter(Boolean).slice(0, 3);
  const nodes = [...before.map((c) => node(c, mem)), { ...node(ch, mem, true), id: l.id, title: `${ch.title}: ${l.title}` }, ...after.map((c) => node(c, mem))];
  const weak = before.find((c) => (chapterScore(c.number, mem) ?? 1) < 0.55);
  return {
    msgs: [
      {
        role: 'ai',
        text: `Here's where **${l.title}** sits. It builds on ${before.length ? before.map((c) => `**${c.title}**`).join(' and ') : 'the basics'}${after.length ? `, and it unlocks ${after.map((c) => `**${c.title}**`).join(', ')}` : ''}. Tap any step to open it.${weak ? `\n\nThe weak link is **${weak.title}**. Fix that and this gets easier.` : ''}`,
        map: nodes,
        actions: weak ? [{ label: `Explain ${weak.title} here`, a: { k: 'here', pre: weak.lessonIds[0] }, primary: true }] : undefined,
      },
    ],
  };
}

// ---------- teach-back ----------
const KEYSTOP = new Set('also only same each other more most such than then when where while they them their there these those even form over without between through about make makes made help helps need needs allow allows keep keeps still just like very many much both into onto upon within across able will would could should must have has been being does done using used uses use when what which whose your'.split(' '));
const VERBS = new Set('builds build creates create carries carry adapt adapts connects connect sends send receives receive learns learn forwards forward stores store keeps chooses choose decides decide moves move gives give takes take finds find shows show runs run reads read separates separate assigns assign provides provide reduces reduce prevents prevent'.split(' '));
const ACR = new Set('mac ip ipv4 ipv6 arp vlan stp tcp udp dns nat pat acl ospf dhcp ssh poe lan wan qos hsrp vrrp cdp lldp ttl mtu crc'.split(' '));
/** The handful of ideas a good one-line explanation should mention, taken from the lesson's core idea. */
export function keyIdeas(l: BookLesson): string[] {
  const text = l.teachingGuide?.concept ?? l.beginner.remember ?? l.beginner.definition ?? '';
  const title = new Set(words(l.title));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words(text)) {
    const k = w.replace(/[.]+$/, '');
    if (seen.has(k) || title.has(k) || KEYSTOP.has(k) || !(k.length > 3 || ACR.has(k))) continue;
    if (/ing$/.test(k) || VERBS.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  // Acronyms and technical nouns first: they are what a good explanation must name.
  return [...out.filter((w) => ACR.has(w)), ...out.filter((w) => !ACR.has(w))].slice(0, 4);
}
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, '');
export function gradeTeach(answer: string, l: BookLesson, mem: Memory): Reply {
  const ideas = keyIdeas(l);
  const got = new Set(words(answer).map(stem));
  const hit = ideas.filter((w) => got.has(stem(w)));
  const miss = ideas.filter((w) => !got.has(stem(w)));
  const pct = ideas.length ? hit.length / ideas.length : 0;
  const ok = pct >= 0.6 && words(answer).length >= 5;
  const m: Memory = ok ? { ...mem, known: { ...mem.known, [l.id]: 1 } } : { ...mem, struggled: { ...mem.struggled, [l.id]: (mem.struggled[l.id] ?? 0) + (pct < 0.3 ? 1 : 0) } };
  return {
    msgs: [
      {
        role: 'ai',
        tone: ok ? 'ok' : 'bad',
        text: `${ok ? 'Strong explanation.' : pct >= 0.3 ? "You're close." : "Let's tighten that up."} You covered ${hit.length} of ${ideas.length} key ideas.${hit.length ? `\n\n✓ Covered: ${hit.join(', ')}` : ''}${miss.length ? `\n\n○ Missing: ${miss.join(', ')}` : ''}\n\n**A model answer:** ${l.beginner.remember ?? l.beginner.definition ?? ''}`,
        source: src(l),
        actions: ok ? [{ label: 'Quiz me', a: { k: 'quiz' } }, { label: 'Show the map', a: { k: 'map' } }] : [{ label: 'Try again', a: { k: 'teach' }, primary: true }, { label: 'Explain it simply', a: { k: 'simple' } }],
      },
    ],
    memory: m,
    await: null,
  };
}

// ---------- warm-up and mistake patterns ----------
/** Pairs students mix up, with a side-by-side that is accurate for the CCNA. */
export const PAIRS: { a: string; b: string; match: [RegExp, RegExp]; rows: [string, string, string][] }[] = [
  { a: 'Access port', b: 'Trunk port', match: [/access/i, /trunk|802\.1q/i], rows: [['Carries', 'One VLAN', 'Many VLANs'], ['Frames', 'Untagged', 'Tagged with 802.1Q (except the native VLAN)'], ['Connects to', 'End devices: PCs, printers, phones', 'Switches, routers (router-on-a-stick), APs'], ['Command', 'switchport mode access', 'switchport mode trunk'], ['Classic mistake', 'Port left in VLAN 1 after a desk move', 'VLAN missing from the allowed list']] },
  { a: 'TCP', b: 'UDP', match: [/\btcp\b/i, /\budp\b/i], rows: [['Connection', 'Yes: three-way handshake', 'No: connectionless'], ['Reliability', 'Sequencing, acknowledgments, retransmission', 'Best effort, no retransmission'], ['Overhead', 'Higher (20-byte header)', 'Lower (8-byte header)'], ['Used by', 'HTTP/HTTPS, SSH, SMTP, FTP', 'DNS queries, DHCP, VoIP, SNMP, TFTP']] },
  { a: 'VLAN', b: 'Subnet', match: [/vlan/i, /subnet/i], rows: [['Layer', 'Layer 2 (switching)', 'Layer 3 (IP addressing)'], ['Defines', 'A broadcast domain on switches', 'A range of IP addresses'], ['Set on', 'Switch ports', 'Host and router interfaces'], ['How they meet', 'Usually one subnet per VLAN', 'Routing is needed between subnets']] },
  { a: 'Collision domain', b: 'Broadcast domain', match: [/collision/i, /broadcast domain/i], rows: [['Bounded by', 'Each switch port (and router port)', 'Router interfaces and VLANs'], ['Matters for', 'Half-duplex shared media', 'ARP, DHCP and other broadcasts'], ['A hub', 'One big collision domain', 'One broadcast domain'], ['A switch', 'One collision domain per port', 'One broadcast domain per VLAN']] },
  { a: 'NAT', b: 'PAT', match: [/\bnat\b|static nat|dynamic nat/i, /\bpat\b|overload/i], rows: [['Mapping', 'One private to one public address', 'Many private to one public address'], ['Tells sessions apart by', 'The address', 'Source port numbers'], ['Command hint', 'ip nat inside source static …', 'ip nat inside source list … overload'], ['Typical use', 'Publishing a server', 'Home and office internet access']] },
  { a: 'Standard ACL', b: 'Extended ACL', match: [/standard acl|standard access/i, /extended acl|extended access/i], rows: [['Matches on', 'Source IP only', 'Source, destination, protocol and ports'], ['Numbers', '1–99, 1300–1999', '100–199, 2000–2699'], ['Place it', 'Close to the destination', 'Close to the source'], ['Ends with', 'An implicit deny any', 'An implicit deny any']] },
  { a: 'Hub', b: 'Switch', match: [/\bhub/i, /switch/i], rows: [['Layer', 'Layer 1', 'Layer 2'], ['Forwards by', 'Repeating to every port', 'MAC address table'], ['Duplex', 'Half only', 'Full per port'], ['Collisions', 'Shared across all ports', 'Separated per port']] },
  { a: 'DHCP', b: 'DNS', match: [/dhcp/i, /\bdns\b/i], rows: [['Job', 'Hands out IP settings', 'Turns names into addresses'], ['Port', 'UDP 67/68', 'UDP 53 (TCP 53 for large answers)'], ['When it breaks', 'APIPA 169.254.x.x address', 'Ping by IP works, by name fails'], ['Messages', 'Discover, Offer, Request, Acknowledge', 'Query and response']] },
  { a: 'SSH', b: 'Telnet', match: [/\bssh\b/i, /telnet/i], rows: [['Port', 'TCP 22', 'TCP 23'], ['Encryption', 'Yes', 'No: passwords in clear text'], ['Needs', 'Hostname, domain name, RSA key, local user', 'Just a vty password'], ['Use it?', 'Always', 'Never on production gear']] },
  { a: 'Root port', b: 'Designated port', match: [/root port/i, /designated port/i], rows: [['Where', 'On every non-root switch, exactly one', 'One per segment'], ['Points', 'Toward the root bridge (lowest cost)', 'Away from the root, onto the segment'], ['On the root bridge', 'None', 'All of its ports'], ['State', 'Forwarding', 'Forwarding']] },
  { a: 'Static route', b: 'OSPF', match: [/static route/i, /\bospf/i], rows: [['Set up by', 'An admin, route by route', 'Routers sharing link-state information'], ['Adapts to failures', 'No (unless a floating static)', 'Yes, recalculates automatically'], ['Administrative distance', '1', '110'], ['Best for', 'Small or stub networks, defaults', 'Growing networks with redundancy']] },
  { a: 'Unicast', b: 'Broadcast', match: [/unicast/i, /broadcast(?! domain)/i], rows: [['Sent to', 'One host', 'Every host in the broadcast domain'], ['MAC address', "The host's MAC", 'FF:FF:FF:FF:FF:FF'], ['Crosses routers', 'Yes, if routed', 'No'], ['Example', 'A web request', 'An ARP request, DHCP Discover']] },
];
export const findPair = (text: string) => PAIRS.findIndex((p) => p.match[0].test(text) && p.match[1].test(text));
export function compareReply(i: number): Reply {
  const p = PAIRS[i];
  if (!p) return { msgs: [] };
  return { msgs: [{ role: 'ai', text: `**${p.a} vs ${p.b}**, side by side:`, table: { head: ['', p.a, p.b], rows: p.rows } }] };
}
function compareLessons(a: BookLesson, b: BookLesson): Reply {
  const row = (label: string, f: (l: BookLesson) => string | undefined): [string, string, string] => [label, f(a) ?? '–', f(b) ?? '–'];
  return {
    msgs: [
      {
        role: 'ai',
        text: `**${a.title} vs ${b.title}**, from the AEGIS lessons:`,
        table: { head: ['', a.title, b.title], rows: [row('What it is', (l) => l.beginner.definition), row('Why it matters', (l) => l.why), row('Remember', (l) => l.beginner.remember), row('Watch out', (l) => l.teachingGuide?.commonTrap ?? l.commonMistake)] },
      },
    ],
  };
}
/** Pairs that keep showing up in your missed questions (3 or more). */
export function patterns(mem: Memory): { pair: number; n: number }[] {
  const out: { pair: number; n: number }[] = [];
  PAIRS.forEach((p, i) => {
    const n = (mem.misses ?? []).filter((m) => p.match[0].test(`${m.label} ${m.text}`) || p.match[1].test(`${m.label} ${m.text}`)).length;
    if (n >= 3) out.push({ pair: i, n });
  });
  return out.sort((a, b) => b.n - a.n);
}

/** Opening the tutor without a topic: a warm-up on what was hard, or a spotted mistake pattern. */
export function welcome(mem: Memory): Reply {
  const name = mem.name ? ` ${mem.name}` : '';
  const pat = patterns(mem)[0];
  const today = new Date().toDateString();
  const hard = Object.entries(mem.struggled).filter(([id, n]) => n > 0 && !mem.known[id]).sort((a, b) => b[1] - a[1]).map(([id]) => byId.get(id)).filter(Boolean) as BookLesson[];
  if (pat) {
    const p = PAIRS[pat.pair];
    return { msgs: [{ role: 'ai', text: `Welcome back${name} 👋 I spotted a pattern: **${pat.n} of your missed questions** involve **${p.a}** and **${p.b}**. Want the 1-minute difference?`, actions: [{ label: `${p.a} vs ${p.b}`, a: { k: 'compare', pair: pat.pair }, primary: true }, { label: 'Not now', a: { k: 'good' } }] }] };
  }
  if (hard.length && mem.warmDay !== today) {
    const l = hard[0];
    const q = checkQ(l);
    return {
      msgs: [{ role: 'ai', text: `Welcome back${name} 👋 Quick 2-minute warm-up? Last time **${l.title}** was hard, so let's check it stuck.${q ? `\n\n${q.prompt}` : ''}`, source: src(l), actions: q ? q.options.map((o, i) => ({ label: o, a: { k: 'answer', lesson: l.id, q: 0, pick: i } as Action })) : [{ label: 'Explain it simply', a: { k: 'simple' } }] }],
      memory: { ...mem, warmDay: today },
    };
  }
  return { msgs: [{ role: 'ai', text: `Hi${name} 👋 Tap ✦ next to anything you study, highlight a sentence you don't get, or ask me here. Try *"VLAN vs subnet"* or *"trunk ports"*.` }] };
}
export const warmLesson = (mem: Memory) => Object.entries(mem.struggled).filter(([id, n]) => n > 0 && !mem.known[id]).sort((a, b) => b[1] - a[1])[0]?.[0];

// ---------- explain it like the job ----------
/** One realistic ticket per chapter: the situation, then what a good technician does. */
const TICKETS: Record<number, { ticket: string; answer: string }> = {
  1: { ticket: 'A new office manager asks why the network needs both a switch and a router, since "the internet box already has ports". Explain it to them in plain words.', answer: 'The switch connects devices inside the office (same network, MAC addresses). The router connects the office network to other networks, including the internet (IP routing). Many home boxes combine both, but they are still two jobs.' },
  2: { ticket: 'A user plugged their PC into the wall jack at a new desk and gets no link light. The jack worked yesterday for someone else.', answer: 'Check the physical path first: patch cable seated and undamaged, the patch panel port for that jack is patched to a switch port, and the switch port is not shut down or err-disabled (show interfaces status).' },
  3: { ticket: 'You get a brand-new switch on your desk with no IP address. Your manager wants it managed over SSH by the end of the day.', answer: 'Console in with a rollover cable (9600 8N1). Set a hostname and ip domain-name, generate an RSA key, create a local user, give a management SVI an IP and a default gateway, set the vty lines to transport input ssh and login local, then copy run start.' },
  4: { ticket: 'Two PCs on the same switch and VLAN can see each other, but one is very slow and shows many CRC errors.', answer: 'Look at that port: show interfaces for CRC and late collisions points to a duplex mismatch or a bad cable. Fix the speed and duplex settings (or set both sides to auto), then replace the cable if errors continue.' },
  5: { ticket: 'A laptop has the address 169.254.12.7 and cannot reach anything.', answer: 'That is an APIPA address: the laptop got no reply from DHCP. Check that the port is in the right VLAN, that the DHCP server or ip helper-address on the gateway is reachable, and that the scope still has free addresses.' },
  6: { ticket: 'Users can reach servers in their own building but not the branch office. The branch is up.', answer: 'Check routing: show ip route on the gateway for a route to the branch network (static or learned), then the return route at the branch. Missing either direction breaks the conversation. Traceroute shows where it stops.' },
  7: { ticket: 'The team wants a new subnet for 50 cameras with room to grow a little. You have 10.20.30.0/24 to carve from.', answer: '50 hosts need 6 host bits (62 usable), so a /26: 10.20.30.0/26 gives .1–.62 with .63 as broadcast. If growth beyond 62 is likely, use a /25 instead.' },
  8: { ticket: 'A user moved to desk 14 in Finance and now cannot print. The Finance printer is on VLAN 20.', answer: 'The new desk port is probably still in the default VLAN. Check show vlan brief or show interfaces switchport for that port, then set switchport access vlan 20 and confirm the user gets a Finance address.' },
  9: { ticket: 'After someone added a second cable between two switches, one link shows as blocking and they think it is broken.', answer: 'That is spanning tree doing its job: it blocks the redundant link to prevent a loop. If they wanted both links active, bundle them with EtherChannel (LACP) instead of plain parallel links.' },
  10: { ticket: 'Two routers are cabled and OSPF is configured, but show ip ospf neighbor is empty.', answer: 'Compare both sides: same subnet and mask on the link, same area, matching hello and dead timers, no passive-interface on that link, and matching authentication. Any mismatch stops the adjacency.' },
  11: { ticket: 'When the main gateway router reboots, every PC in the office loses the internet until it comes back.', answer: 'There is no first-hop redundancy. Add HSRP (or VRRP) on both gateway routers with a shared virtual IP, point the DHCP default gateway at that virtual IP, and the standby takes over when the active router fails.' },
  12: { ticket: 'A user says the website works by IP address but "the name doesn\'t work".', answer: 'That points to DNS, not the network path. Check the DNS server setting on the PC (ipconfig /all), test with nslookup, and make sure UDP/TCP 53 to the DNS server is allowed.' },
  13: { ticket: 'A server team asks why their IPv6 hosts have two addresses each, one starting with fe80.', answer: 'Every IPv6 interface always has a link-local address (fe80::/10) for local communication such as neighbor discovery. The second one is the global unicast address used to reach other networks. Both are normal.' },
  14: { ticket: 'After you added an ACL to block guests from the server network, nobody can reach anything at all.', answer: 'Every ACL ends with an implicit deny any. If the list only has deny statements, all other traffic is dropped too. Add a permit for the traffic that should pass, and check the ACL is applied in the right direction on the right interface.' },
  15: { ticket: 'Logs from the switches show the wrong times, and the security team cannot match events.', answer: 'Configure NTP on every device pointing to the same reliable time source, set the time zone, and check show ntp status. Syslog timestamps are only useful when the clocks agree.' },
  16: { ticket: 'Inside PCs can reach the internet, but the new web server inside cannot be reached from outside.', answer: 'PAT only allows connections that start from inside. Publish the server with a static NAT (or port forward) mapping its private address to a public one, and allow the traffic in on the edge ACL or firewall.' },
  17: { ticket: 'Someone plugged a home router into an office wall port and users started getting the wrong IP addresses.', answer: 'A rogue DHCP server. Enable DHCP snooping on the access VLANs, trust only the uplink toward the real DHCP server, and consider port security to limit what can be plugged in.' },
  18: { ticket: 'Guests on Wi-Fi can see the office printers. They should only reach the internet.', answer: 'Put the guest SSID on its own VLAN, give it its own subnet, and block that subnet from internal networks with an ACL or firewall rules, allowing only internet-bound traffic.' },
  19: { ticket: 'Your manager asks whether moving the file server to the cloud changes anything for the network team.', answer: 'Yes: traffic now leaves through the internet edge, so bandwidth, latency and redundancy of that link matter. Plan for VPN or direct cloud connections, security controls at the edge, and DNS changes.' },
  20: { ticket: 'You need to change the SNMP community string on 40 switches tonight.', answer: 'Do it with automation instead of 40 manual logins: a tool such as Ansible with an inventory of the switches, one playbook for the change, a dry run first, and a verification step that reads the setting back.' },
};
function jobReply(l: BookLesson): Reply {
  const ch = chapterOf(l);
  const t = TICKETS[ch?.number ?? 0];
  if (!t) return { msgs: [{ role: 'ai', text: 'I do not have a ticket for this one yet.' }] };
  return { msgs: [{ role: 'ai', text: `**Ticket, ${ch!.title}**\n\n${t.ticket}\n\nWhat would you check first, and what is the fix? Think it through, then reveal.`, actions: [{ label: 'Show how a technician solves it', a: { k: 'jobAnswer', ch: ch!.number }, primary: true }] }] };
}
function jobAnswer(ch: number): Reply {
  const t = TICKETS[ch];
  return { msgs: [{ role: 'ai', tone: 'ok', text: `**How a technician solves it:** ${t?.answer ?? ''}`, actions: [{ label: 'Another way to learn it: teach it back', a: { k: 'teach' } }] }] };
}
