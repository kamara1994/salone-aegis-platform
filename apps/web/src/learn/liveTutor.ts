// Browser side of the live tutor. Calls our own /api/tutor route (never a provider directly),
// so API keys stay on the server. If no AI is configured or it fails, the dock falls back to the
// offline tutor in tutorBrain.ts.
import { chapterOf, lessonById, prereqsOf, type BookLesson, type Memory, type Msg } from './tutorBrain';

export type LiveStatus = { available: boolean; providers: string[]; model: string | null };
let cached: Promise<LiveStatus> | null = null;

/** Is a live AI configured on the server? Checked once per page load. */
export function liveStatus(): Promise<LiveStatus> {
  if (!cached)
    cached = fetch('/api/tutor', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<LiveStatus>) : { available: false, providers: [], model: null }))
      .catch(() => ({ available: false, providers: [], model: null }));
  return cached;
}

/** What the server needs to ground the answer: the lesson, what it builds on, and what we know about the student. */
export function payloadFor(history: Msg[], lesson: BookLesson | undefined, mem: Memory, page: string | null) {
  const ch = chapterOf(lesson);
  return {
    messages: history
      .filter((m) => m.text.trim())
      .slice(-12)
      .map((m) => ({ role: m.role === 'me' ? ('user' as const) : ('assistant' as const), content: m.text })),
    page: page ?? undefined,
    lesson: lesson && {
      id: lesson.id,
      title: lesson.title,
      chapter: ch?.title,
      definition: lesson.beginner.definition,
      why: lesson.why,
      mechanism: lesson.teachingGuide?.mechanism,
      example: lesson.beginner.example,
      remember: lesson.beginner.remember,
      trap: lesson.teachingGuide?.commonTrap ?? lesson.commonMistake,
      technical: lesson.technical.explanation,
    },
    prereqs: lesson ? prereqsOf(lesson, mem).map((p) => ({ title: p.chapter.title, known: p.score })) : undefined,
    learner: {
      name: mem.name,
      style: mem.style,
      hard: Object.entries(mem.struggled).filter(([, n]) => n > 0).map(([id]) => lessonById(id)?.title).filter(Boolean) as string[],
      known: Object.keys(mem.known).map((id) => lessonById(id)?.title).filter(Boolean) as string[],
    },
  };
}

export async function askLive(payload: ReturnType<typeof payloadFor>): Promise<{ text: string; provider: string; model: string }> {
  const res = await fetch('/api/tutor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`tutor ${res.status}`);
  return res.json();
}

/** A ready-made question for the student's own ChatGPT or Claude, with the lesson as context. */
export function externalPrompt(question: string, lesson: BookLesson | undefined, mem: Memory) {
  const lines = [
    "I'm studying for the Cisco CCNA 200-301.",
    lesson ? `Topic: ${lesson.title}${chapterOf(lesson) ? ` (${chapterOf(lesson)!.title})` : ''}.` : '',
    lesson?.beginner.definition ? `What my course says: ${lesson.beginner.definition}` : '',
    mem.style === 'deep' ? 'Please explain with technical depth and real Cisco commands.' : 'Please explain simply with an everyday analogy first, then the real terms.',
    question ? `My question: ${question}` : `Help me understand this topic and check my understanding with one question at the end.`,
  ];
  return lines.filter(Boolean).join('\n');
}
export const chatgptUrl = (p: string) => `https://chatgpt.com/?q=${encodeURIComponent(p)}`;
export const claudeUrl = (p: string) => `https://claude.ai/new?q=${encodeURIComponent(p)}`;
