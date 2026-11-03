// POST /api/tutor: the live study tutor. GET /api/tutor: is a live AI configured, and which one.
// Runs on the server only. The ".api.ts" extension keeps it out of the static recruiter export.
import { NextResponse } from 'next/server';
import { complete, configured, type ChatMsg } from '@/server/ai';
import { tutorSystemPrompt, type TutorPayload } from '@/server/tutorPrompt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A small per-address limit so a stuck loop or a shared link cannot burn through credit.
const hits = new Map<string, number[]>();
const LIMIT = Number(process.env.AI_TUTOR_PER_MINUTE ?? 20);
function allowed(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length <= LIMIT;
}

export async function GET() {
  const list = configured();
  return NextResponse.json({ available: list.length > 0, providers: list.map((e) => e.label), model: list[0]?.model ?? null });
}

export async function POST(req: Request) {
  if (process.env.AI_TUTOR_DISABLED === '1') return NextResponse.json({ error: 'disabled' }, { status: 503 });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!allowed(ip)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  let body: TutorPayload;
  try {
    body = (await req.json()) as TutorPayload;
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const messages: ChatMsg[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  // Providers expect the conversation to start with the student and alternate.
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length) return NextResponse.json({ error: 'empty' }, { status: 400 });
  try {
    const r = await complete(tutorSystemPrompt(body), messages);
    return NextResponse.json(r);
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: msg.startsWith('no_provider') ? 'no_provider' : 'provider_failed', detail: msg.startsWith('all_failed') ? msg.slice(12) : undefined }, { status: 503 });
  }
}
