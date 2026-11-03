'use client';

// CCNA flashcard deck: Flip, Type it and Exam modes, spaced repetition, endless subnetting,
// pictures with credits, and a topic-strength panel. Progress stays in this browser.
import { ArrowLeft, ArrowRight, Check, ChevronRight, ClipboardCopy, Flag, Moon, Infinity as InfinityIcon, Keyboard, Layers, ListTree, PanelLeftClose, Play, RotateCcw, Timer, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button, cx } from '@/components/ui';
import deckJson from '@/content/flashcards/ccna.json';
import { AskAI, nudgeTutor, recordMiss } from '@/components/tutor/AskAI';

type Card = { t: string; q: string; a: string; k?: string[]; cli?: string; why?: string; img?: string; imgAlt?: string; imgKind?: string; imgCredit?: string; imgSource?: string; imgFallback?: string; gen?: boolean; d?: 'easy' | 'hard' };
type Mode = 'flip' | 'type' | 'exam';
type Stats = { box: Record<number, number>; next: Record<number, number>; /** last self-rating per card: 0 Again, 1 Hard, 2 Good, 3 Easy */ rated: Record<number, number>; /** cards reviewed per local day, yyyy-mm-dd */ days: Record<string, number>; /** card -> day it is buried until the end of */ bury: Record<number, string>; /** cards marked wrong or unclear */ flags: Record<number, 1>; seen: number; right: number; streak: number; best: number; topic: Record<string, { r: number; n: number }> };

const DECK = deckJson as Card[];
const KEY = 'aegis.flash.ccna.v1';
const GAP = [0, 60e3, 5 * 60e3, 30 * 60e3, 24 * 3600e3];
const HUE: Record<string, string> = { OSI: '#7c5cff', Switching: '#22b8cf', VLANs: '#cc5de8', IPv4: '#ff922b', IPv6: '#20c997', Routing: '#ff6b6b', Services: '#4c6ef5', Security: '#fa5252', Wireless: '#339af0', Automation: '#12b886', Hardware: '#fcc419', Interview: '#94d82d', Subnetting: '#f06595' };
const TOPICS = [...new Set(DECK.map((c) => c.t)), 'Subnetting'];
const empty = (): Stats => ({ box: {}, next: {}, rated: {}, days: {}, bury: {}, flags: {}, seen: 0, right: 0, streak: 0, best: 0, topic: {} });
/** The two review piles built from your own ratings. */
/** Question level: Easy = core definitions, Hard = commands, math and scenarios. */
export type Level = 'all' | 'easy' | 'hard';
const LEVEL_KEY = 'aegis.flash.level';
const atLevel = (i: number, lv: Level) => lv === 'all' || (DECK[i].d ?? 'easy') === lv;
const dayKey = (d = new Date()) => d.toLocaleDateString('en-CA');
/** How long until a card comes back for each rating, Anki style. */
const nextBox = (b: number, r: number) => (r === 0 ? 0 : r === 1 ? Math.max(1, b) : r === 2 ? Math.min(4, b + 1) : Math.min(4, b + 2));
const fmtGap = (ms: number) => (ms < 60e3 ? '<1m' : ms < 3600e3 ? `${Math.round(ms / 60e3)}m` : ms < 86400e3 ? `${Math.round(ms / 3600e3)}h` : `${Math.round(ms / 86400e3)}d`);
const gapFor = (b: number, r: number) => (r === 0 ? 20e3 : GAP[nextBox(b, r)]);
const SESSION = 20;
type Sess = { n: number; right: number; miss: number[]; topic: Record<string, { r: number; n: number }> };
const freshSess = (): Sess => ({ n: 0, right: 0, miss: [], topic: {} });
const LEVEL_N = { easy: DECK.filter((c) => (c.d ?? 'easy') === 'easy').length, hard: DECK.filter((c) => c.d === 'hard').length };
const load = (): Stats => {
  try {
    const v = { ...empty(), ...(JSON.parse(window.localStorage.getItem(KEY) ?? 'null') ?? {}) };
    v.rated ??= {};
    v.days ??= {};
    v.bury ??= {};
    v.flags ??= {};
    return v;
  } catch {
    return empty();
  }
};

// ---------- Endless subnetting ----------
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const n2ip = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
const maskN = (p: number) => (p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0);
function genSubnet(): Card & { wrong: () => string } {
  const pre = rnd(17, 30);
  const first = [10, 172, 192][rnd(0, 2)];
  const parts = [first, first === 172 ? rnd(16, 31) : first === 192 ? 168 : rnd(0, 255), rnd(0, 255), rnd(1, 254)];
  const ip = parts.reduce((n, o) => n * 256 + o, 0);
  const m = maskN(pre);
  const net = (ip & m) >>> 0;
  const bc = (net | (~m >>> 0)) >>> 0;
  const hosts = 2 ** (32 - pre) - 2;
  const addr = `${n2ip(ip)}/${pre}`;
  const why = `Network ${n2ip(net)} · broadcast ${n2ip(bc)} · mask ${n2ip(m)} · ${hosts} usable hosts`;
  const Q = [
    { q: `What is the network address of ${addr}?`, a: n2ip(net), wrong: () => n2ip((net + 2 ** (32 - pre) * rnd(1, 3)) >>> 0) },
    { q: `What is the broadcast address of ${addr}?`, a: n2ip(bc), wrong: () => n2ip((bc - 2 ** (32 - pre) * rnd(1, 2)) >>> 0) },
    { q: `How many usable hosts does a /${pre} give?`, a: String(hosts), wrong: () => String(Math.max(2, hosts + [2, -2, hosts + 2, -(hosts / 2)][rnd(0, 3)])) },
    { q: `What is the dotted-decimal mask for /${pre}?`, a: n2ip(m), wrong: () => n2ip(maskN(Math.min(30, Math.max(8, pre + [1, -1, 2, -2][rnd(0, 3)])))) },
  ][rnd(0, 3)];
  return { t: 'Subnetting', gen: true, q: Q.q, a: Q.a, k: [Q.a.toLowerCase()], why, wrong: Q.wrong };
}

const norm = (x: string) => x.toLowerCase().replace(/^0+(?=\d)/, '').replace(/[\s,.;:/-]+/g, ' ').replace(/\band\b/g, '').replace(/\s+/g, ' ').trim();
const matches = (c: Card, v: string) => (c.k ?? []).some((k) => norm(k) === norm(v) || k.toLowerCase().replace(/\s/g, '') === v.toLowerCase().replace(/\s/g, '') || ` ${norm(v)} `.includes(` ${norm(k)} `));
const refersToShown = (q: string) => /\b(this|these) (command|routing table|mac table|entry|output)|\bin this\b/i.test(q);
const shuffleArr = <T,>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = rnd(0, i);
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

/** A picture with its credit; a failed photo falls back to the built-in diagram. */
function Picture({ c, tall }: { c: Card; tall?: boolean }) {
  const [src, setSrc] = useState(c.img);
  const [fell, setFell] = useState(false);
  useEffect(() => {
    setSrc(c.img);
    setFell(false);
  }, [c.img]);
  if (!src) return null;
  const diagram = fell || /diagram/i.test(c.imgKind ?? '');
  return (
    <figure className={cx('relative overflow-hidden rounded-xl border border-line', diagram ? 'bg-[#0d1530]' : 'bg-white')}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={c.imgAlt ?? ''}
        className={cx('block w-full object-contain', tall ? 'h-56' : 'h-44')}
        onError={() => {
          if (c.imgFallback && src !== c.imgFallback) {
            setSrc(c.imgFallback);
            setFell(true);
          } else setSrc(undefined);
        }}
      />
      {(c.imgCredit || fell) && (
        <figcaption className="absolute right-2 bottom-1.5 max-w-[75%] truncate rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] text-white/85">
          {fell ? (
            'Labelled diagram (photo could not load)'
          ) : c.imgSource ? (
            <a href={c.imgSource} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="hover:underline">
              {c.imgCredit}
            </a>
          ) : (
            c.imgCredit
          )}
        </figcaption>
      )}
    </figure>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid size-[76px] shrink-0 place-items-center">
      <svg width={76} height={76} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={38} cy={38} r={r} fill="none" strokeWidth={7} className="stroke-pane-2" />
        <circle cx={38} cy={38} r={r} fill="none" strokeWidth={7} stroke="url(#fdg)" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.16,1,.3,1)' }} />
        <defs>
          <linearGradient id="fdg" x1="0" x2="1">
            <stop offset="0" stopColor="#7c5cff" />
            <stop offset="1" stopColor="#22b8cf" />
          </linearGradient>
        </defs>
      </svg>
      <span className="text-center leading-none">
        <b className="block text-[18px]">{pct}%</b>
        <span className="text-[9.5px] text-muted">mastered</span>
      </span>
    </span>
  );
}

export function FlashDeck() {
  const [S, setS] = useState<Stats>(empty);
  const [mode, setModeRaw] = useState<Mode>('flip');
  const [topic, setTopic] = useState('All');
  // Remember where you were for this visit, so a detour to another page brings you back to the same card.
  const restore = useRef<number | null>(null);
  useEffect(() => {
    try {
      const v = JSON.parse(window.sessionStorage.getItem('aegis.flash.pos') ?? 'null') as { topic?: string; cur?: number } | null;
      if (v?.topic && v.topic !== 'All') setTopic(v.topic);
      if (typeof v?.cur === 'number' && v.cur >= 0) restore.current = v.cur;
    } catch {
      /* optional */
    }
  }, []);
  const [order, setOrder] = useState(() => DECK.map((_, i) => i));
  const [cur, setCur] = useState<number>(-1);
  const [gen, setGen] = useState<(Card & { wrong: () => string }) | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState('');
  const [verdict, setVerdict] = useState<null | boolean>(null);
  const [fly, setFly] = useState<'left' | 'right' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [side, setSideRaw] = useState(true);
  const setSideP = (v: boolean) => {
    setSideRaw(v);
    try {
      window.localStorage.setItem('aegis.flash.side', v ? '1' : '0');
    } catch {
      /* optional */
    }
  };
  useEffect(() => {
    let v: string | null = null;
    try {
      v = window.localStorage.getItem('aegis.flash.side');
    } catch {
      /* optional */
    }
    setSideRaw(v === null ? window.innerWidth >= 1280 : v === '1');
  }, []);

  useEffect(() => setS(load()), []);
  const save = useCallback((next: Stats) => {
    setS(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage blocked: progress lasts for this visit */
    }
  }, []);

  const [level, setLevelRaw] = useState<Level>('all');
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(LEVEL_KEY);
      if (v === 'easy' || v === 'hard') setLevelRaw(v);
    } catch {}
  }, []);
  /** A hand-picked list (your misses, your flagged cards) that overrides topic and level. */
  const [custom, setCustom] = useState<null | { label: string; ids: number[] }>(null);
  const [sess, setSess] = useState<Sess>(freshSess);
  const [summary, setSummary] = useState(false);
  const today = dayKey();
  const setLevel = (v: Level) => {
    setCustom(null);
    setLevelRaw(v);
    try {
      window.localStorage.setItem(LEVEL_KEY, v);
    } catch {}
  };
  const pool = useMemo(
    () => (custom ? custom.ids : order.filter((i) => atLevel(i, level) && (topic === 'All' || DECK[i].t === topic) && S.bury[i] !== today)),
    [order, topic, level, custom, S.bury, today], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const dueList = useCallback(() => {
    const now = Date.now();
    return pool.filter((i) => (mode !== 'type' || DECK[i].k?.length) && (S.box[i] ?? 0) < 4 && (S.next[i] ?? 0) <= now);
  }, [pool, mode, S]);

  // The cards you step through with Back / Next: the chosen topic, in order.
  const seq = useMemo(() => (mode === 'type' ? pool.filter((i) => DECK[i].k?.length) : pool), [pool, mode]);
  const pos = seq.indexOf(cur);
  const resetFace = () => {
    setFlipped(false);
    setVerdict(null);
    setTyped('');
    setFly(null);
  };
  const go = (dir: 1 | -1) => {
    resetFace();
    if (topic === 'Subnetting') {
      setGen(genSubnet());
      setCur(-2);
      return;
    }
    setGen(null);
    if (!seq.length) return setCur(-1);
    const i = pos < 0 ? (dir > 0 ? 0 : seq.length - 1) : (pos + dir + seq.length) % seq.length;
    setCur(seq[i]);
  };
  /** Start a topic at its first card that is due and not yet mastered. */
  const pick = useCallback(() => {
    resetFace();
    if (topic === 'Subnetting') {
      setGen(genSubnet());
      setCur(-2);
      return;
    }
    setGen(null);
    const now = Date.now();
    const back = restore.current;
    restore.current = null;
    const first = back !== null && seq.includes(back) ? back : seq.find((i) => (S.box[i] ?? 0) < 4 && (S.next[i] ?? 0) <= now) ?? seq[0] ?? -1;
    setCur(first);
  }, [topic, seq, S]); // eslint-disable-line react-hooks/exhaustive-deps

  // New card whenever the topic or mode changes.
  useEffect(() => {
    if (mode !== 'exam') pick();
  }, [topic, mode, level, custom]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (mode === 'type' && (cur >= 0 || gen)) setTimeout(() => inputRef.current?.focus(), 60);
  }, [cur, gen, mode]);

  useEffect(() => {
    if (cur < 0 || restore.current !== null) return;
    try {
      window.sessionStorage.setItem('aegis.flash.pos', JSON.stringify({ topic, cur }));
    } catch {
      /* optional */
    }
  }, [cur, topic]);
  const card: Card | null = gen ?? (cur >= 0 ? DECK[cur] : null);
  /** Open one card from the topic list. */
  const openCard = (i: number) => {
    setSummary(false);
    if (i < 0) {
      setCustom(null);
      setTopic('Subnetting');
      return;
    }
    if (mode === 'exam') setModeRaw('flip');
    setGen(null);
    setCur(i);
    setFlipped(false);
    setVerdict(null);
    setTyped('');
    setFly(null);
  };

  const score = (t: string, ok: boolean, base: Stats = S): Stats => {
    const topicStat = { ...(base.topic[t] ?? { r: 0, n: 0 }) };
    topicStat.n++;
    if (ok) topicStat.r++;
    const dk = dayKey();
    return { ...base, days: { ...base.days, [dk]: (base.days[dk] ?? 0) + 1 }, seen: base.seen + 1, right: base.right + (ok ? 1 : 0), streak: ok ? base.streak + 1 : 0, topic: { ...base.topic, [t]: topicStat } };
  };
  const schedule = (r: number, base: Stats): Stats => {
    if (gen || cur < 0) return base;
    const b = base.box[cur] ?? 0;
    const nb = nextBox(b, r);
    return { ...base, box: { ...base.box, [cur]: nb }, rated: { ...base.rated, [cur]: r }, next: { ...base.next, [cur]: Date.now() + gapFor(b, r) } };
  };

  const againRun = useRef<string[]>([]);
  const [undo, setUndo] = useState<null | { S: Stats; cur: number; label: string; sess: Sess; summary: boolean }>(null);
  /** Count one answer toward the current session; after SESSION cards, show the recap. */
  const tally = (ok: boolean) => {
    if (gen || cur < 0) return;
    const t = DECK[cur].t;
    const ts = sess.topic[t] ?? { r: 0, n: 0 };
    const next: Sess = { n: sess.n + 1, right: sess.right + (ok ? 1 : 0), miss: ok || sess.miss.includes(cur) ? sess.miss : [...sess.miss, cur], topic: { ...sess.topic, [t]: { r: ts.r + (ok ? 1 : 0), n: ts.n + 1 } } };
    setSess(next);
    return next.n >= SESSION;
  };
  const toggleFlag = () => {
    if (cur < 0) return;
    const flags = { ...S.flags };
    if (flags[cur]) delete flags[cur];
    else flags[cur] = 1;
    save({ ...S, flags });
  };
  const buryCard = () => {
    if (cur < 0 || gen) return;
    const i = cur;
    go(1);
    save({ ...S, bury: { ...S.bury, [i]: today } });
  };
  const studyList = (label: string, ids: number[]) => {
    if (!ids.length) return;
    if (mode === 'exam') setModeRaw('flip');
    setSummary(false);
    setSess(freshSess());
    setCustom({ label, ids });
  };
  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(id);
  }, [undo]);
  const undoLast = () => {
    if (!undo) return;
    save(undo.S);
    setSess(undo.sess);
    setSummary(undo.summary);
    setGen(null);
    setCur(undo.cur);
    setFly(null);
    setVerdict(null);
    setFlipped(true);
    setUndo(null);
  };
  const rate = (r: number) => {
    if (mode !== 'flip' || !flipped || !card) return;
    if (!gen) setUndo({ S, cur, label: ['Again', 'Hard', 'Good', 'Easy'][r], sess, summary });
    // Two "Again" in a row on the same topic: offer help quietly, never a popup.
    if (r === 0 && !gen) recordMiss(card.t, `${card.q} ${card.a}`);
    againRun.current = r === 0 ? [...againRun.current, card.t].slice(-2) : [];
    if (againRun.current.length === 2 && againRun.current[0] === againRun.current[1]) nudgeTutor({ kind: 'Flashcard', label: card.t, text: card.q });
    save(score(card.t, r >= 2, schedule(r, S)));
    const done = tally(r >= 2);
    setFly(r >= 2 ? 'right' : 'left');
    setTimeout(() => {
      go(1);
      if (done) setSummary(true);
    }, 320);
  };
  const check = () => {
    if (!card) return;
    if (verdict !== null) {
      if (sess.n >= SESSION) setSummary(true);
      return go(1);
    }
    if (!typed.trim()) return;
    const ok = matches(card, typed.trim());
    setVerdict(ok);
    setFlipped(true);
    save(score(card.t, ok, schedule(ok ? 2 : 0, S)));
    tally(ok);
  };

  // ---------- Exam ----------
  type Q = Card & { opts: string[] };
  const [exam, setExam] = useState<null | { i: number; qs: Q[]; right: number; missed: Q[]; left: number; picked: number | null; done: boolean; prevBest: number }>(null);
  const examQ = (c?: Card): Q => {
    if (!c) {
      const g = genSubnet();
      const opts = new Set([g.a]);
      for (let guard = 0; opts.size < 4 && guard < 40; guard++) {
        const w = g.wrong();
        if (!w.startsWith('-') && !w.includes('NaN')) opts.add(w);
      }
      return { ...g, opts: shuffleArr([...opts]) };
    }
    const others = shuffleArr(DECK.filter((d) => d !== c && d.t === c.t)).concat(shuffleArr(DECK.filter((d) => d.t !== c.t))).slice(0, 3).map((d) => d.a);
    return { ...c, opts: shuffleArr([c.a, ...others]) };
  };
  const startExam = () => setExam({ i: 0, qs: shuffleArr([...shuffleArr(DECK.filter((_, i) => atLevel(i, level))).slice(0, level === 'easy' ? 20 : 14).map((c) => examQ(c)), ...Array.from({ length: level === 'easy' ? 0 : 6 }, () => examQ())]), right: 0, missed: [], left: 300, picked: null, done: false, prevBest: S.best });
  useEffect(() => {
    if (!exam || exam.done) return;
    const t = setInterval(() => setExam((e) => (e && !e.done ? (e.left <= 1 ? { ...e, left: 0, done: true } : { ...e, left: e.left - 1 }) : e)), 1000);
    return () => clearInterval(t);
  }, [exam?.done, !!exam]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (exam?.done) {
      const pct = Math.round((exam.right / exam.qs.length) * 100);
      if (pct > S.best) save({ ...S, best: pct });
    }
  }, [exam?.done]); // eslint-disable-line react-hooks/exhaustive-deps
  const answer = (k: number) => {
    if (!exam || exam.done || exam.picked !== null) return;
    const q = exam.qs[exam.i];
    const ok = q.opts[k] === q.a;
    save(score(q.t, ok));
    setExam({ ...exam, picked: k, right: exam.right + (ok ? 1 : 0), missed: ok ? exam.missed : [...exam.missed, q] });
    setTimeout(() => setExam((e) => (e ? (e.i + 1 >= e.qs.length ? { ...e, done: true } : { ...e, i: e.i + 1, picked: null }) : e)), ok ? 450 : 1100);
  };

  const setMode = (m: Mode) => {
    setModeRaw(m);
    if (m !== 'exam') setExam(null);
  };

  // ---------- Keyboard ----------
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (mode === 'exam') {
        if ('1234'.includes(e.key) && e.key) answer(+e.key - 1);
        return;
      }
      if (e.key === 'ArrowRight') return go(1);
      if (e.key === 'ArrowLeft') return go(-1);
      if ((e.key === 'z' || e.key === 'u') && undo) return undoLast();
      if (summary) return;
      if (e.key === 'f' && mode === 'flip') return toggleFlag();
      if (e.key === 'b' && mode === 'flip') return buryCard();
      if (mode === 'type') {
        if (e.key === 'Enter' && verdict !== null) go(1);
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (card) setFlipped((f) => !f);
      } else if ('1234'.includes(e.key) && e.key) rate(+e.key - 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const mastered = pool.filter((i) => (S.box[i] ?? 0) >= 4).length;
  const pct = pool.length ? Math.round((mastered / pool.length) * 100) : 0;
  const acc = S.seen ? Math.round((S.right / S.seen) * 100) : 0;
  const due = dueList().length;
  const hue = HUE[card?.t ?? topic] ?? '#7c5cff';
  const rev = false;
  const showCliFront = !!card?.cli && refersToShown(card.q);

  // ---------- Swipe (touch and pen) ----------
  const drag = useRef<null | { x: number; y: number; moved: boolean }>(null);
  const [dx, setDx] = useState(0);
  const swipeLabel = flipped && mode === 'flip' ? (dx > 0 ? 'Good' : 'Again') : dx > 0 ? 'Back' : 'Next';
  const swipe = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' || mode !== 'flip') return;
      drag.current = { x: e.clientX, y: e.clientY, moved: false };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const x = e.clientX - d.x;
      if (!d.moved && Math.abs(x) > 10 && Math.abs(x) > Math.abs(e.clientY - d.y)) d.moved = true;
      if (d.moved) setDx(x);
    },
    onPointerUp: () => {
      const d = drag.current;
      if (!d) return;
      if (d.moved && Math.abs(dx) > 90) {
        if (flipped) rate(dx > 0 ? 2 : 0);
        else go(dx > 0 ? -1 : 1);
      }
      setDx(0);
      setTimeout(() => (drag.current = null), 0);
    },
    onPointerCancel: () => {
      drag.current = null;
      setDx(0);
    },
  };
  const tools = !card?.gen && cur >= 0 && (
    <span className="flash-tools" onClick={(e) => e.stopPropagation()}>
      <AskAI compact ctx={{ kind: 'Flashcard', label: card?.t ?? '', text: `${card?.q ?? ''} ${card?.a ?? ''}` }} className="!size-7" />
      <button type="button" onClick={toggleFlag} className={cx(S.flags[cur] && 'is-on')} title={S.flags[cur] ? 'Unflag (F)' : 'Flag as wrong or unclear (F)'} aria-pressed={!!S.flags[cur]} data-testid="flash-flag">
        <Flag className="size-3.5" />
      </button>
      {!custom && (
        <button type="button" onClick={buryCard} title="Skip until tomorrow (B)" data-testid="flash-bury">
          <Moon className="size-3.5" />
        </button>
      )}
    </span>
  );

  return (
    <div className="flash-deck flex min-w-0 gap-8" data-testid="flash-deck">
      {side ? (
        <FlashTopics S={S} topic={topic} level={level} cur={gen ? -2 : cur} onTopic={(t) => { setCustom(null); setSummary(false); setTopic(t); if (mode === 'exam') setMode('flip'); }} onList={studyList} custom={custom?.label ?? null} onCard={openCard} onHide={() => setSideP(false)} />
      ) : (
        <button type="button" onClick={() => setSideP(true)} className="toc-open hidden h-fit items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1.5 text-[12px] text-muted hover:text-text md:inline-flex" data-testid="flash-topics-show">
          <ListTree className="size-4" /> Topics
        </button>
      )}
      {/* ---------- Main column ---------- */}
      <div className="mx-auto min-w-0 max-w-[820px] flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-line bg-pane p-1" role="radiogroup" aria-label="Study mode">
            {(
              [
                ['flip', 'Flip', Layers],
                ['type', 'Type it', Keyboard],
                ['exam', 'Exam', Timer],
              ] as const
            ).map(([k, label, Icon]) => (
              <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={cx('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors', mode === k ? 'bg-action text-white shadow-[0_0_16px_-4px_var(--action)]' : 'text-muted hover:text-text')} data-testid={`flash-mode-${k}`}>
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
          <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted">{mode === 'flip' ? 'Flip, then rate it. Misses come back sooner.' : mode === 'type' ? 'Type the answer. Subnetting questions are new every time.' : '20 questions, 5 minutes, scored at the end.'}</p>
          <div className="flex shrink-0 gap-1 rounded-xl border border-line bg-pane p-1" role="radiogroup" aria-label="Question level">
            {(
              [
                ['easy', 'Easy', 'Core terms', '#38d9a9'],
                ['hard', 'Hard', 'Commands, math, scenarios', '#ff6b81'],
              ] as const
            ).map(([key, label, sub, c]) => {
              const on = level === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setLevel(on ? 'all' : key)}
                  className={cx('flash-level-btn', on && 'is-on')}
                  style={{ '--c': c } as CSSProperties}
                  title={on ? 'Click again to show every question' : `${sub} only`}
                  data-testid={`flash-level-${key}`}
                >
                  <span className="dot" />
                  {label}
                  <span className="n">{LEVEL_N[key]}</span>
                </button>
              );
            })}
          </div>
        </div>


        {mode !== 'exam' && summary && <Recap sess={sess} onMisses={() => studyList('Your misses', sess.miss)} onMore={() => { setSess(freshSess()); setSummary(false); }} />}
        {mode !== 'exam' && !summary && card && (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[12.5px] text-muted" data-testid="flash-position">
                {card.gen ? (
                  <>
                    <span className="font-semibold text-text">Subnetting drill</span>
                    <span className="mx-1.5 text-faint">·</span>new numbers every time
                  </>
                ) : (
                  <>
                    Card <b className="text-text">{pos + 1}</b> of {seq.length}
                    <span className="mx-1.5 text-faint">·</span>
                    <span className="font-semibold text-text">{custom ? custom.label : topic === 'All' ? 'All topics' : topic}</span>
                    {custom && (
                      <button type="button" onClick={() => setCustom(null)} className="ml-1.5 rounded px-1 text-faint hover:text-text" title="Back to all cards" data-testid="flash-custom-clear">
                        ✕
                      </button>
                    )}
                    {level !== 'all' && (
                      <span className={cx('ml-2 rounded-full px-2 py-0.5 text-[10.5px] font-semibold', level === 'hard' ? 'bg-[#ff6b81]/15 text-[#ff6b81]' : 'bg-[#38d9a9]/15 text-[#38d9a9]')} data-testid="flash-level-tag">
                        {level === 'hard' ? 'Hard' : 'Easy'}
                      </span>
                    )}
                  </>
                )}
              </p>
              <p className="text-[11.5px] text-faint">
                {due} due · {mastered} mastered
              </p>
            </div>
            {!card.gen && (
              <div className="flash-track" aria-hidden>
                <span style={{ width: `${((pos + 1) / Math.max(1, seq.length)) * 100}%`, background: hue }} />
              </div>
            )}
            <div className={cx('flash-stage', pos >= 0 && seq.length - pos > 1 && 'has-stack')} style={{ '--hue': hue } as CSSProperties}>
              <div
                className={cx('flash-swipe', dx !== 0 && 'is-dragging')}
                style={{ '--dx': `${dx}px`, '--sw': Math.min(1, Math.abs(dx) / 110), '--swc': flipped && mode === 'flip' ? (dx > 0 ? '#38d9a9' : '#ff6b81') : 'var(--hue)' } as CSSProperties}
                {...swipe}
              >
                {dx !== 0 && <span className={cx('flash-swipe-label', dx > 0 ? 'is-right' : 'is-left')}>{swipeLabel}</span>}
              <div
                className="flash-tilt"
                onPointerMove={(e) => {
                  if (e.pointerType !== 'mouse') return;
                  const r = e.currentTarget.getBoundingClientRect();
                  const x = (e.clientX - r.left) / r.width;
                  const y = (e.clientY - r.top) / r.height;
                  const el = e.currentTarget.style;
                  el.setProperty('--mx', `${x * 100}%`);
                  el.setProperty('--my', `${y * 100}%`);
                  el.setProperty('--rx', `${(0.5 - y) * 6}deg`);
                  el.setProperty('--ry', `${(x - 0.5) * 8}deg`);
                  el.setProperty('--glare', '1');
                }}
                onPointerLeave={(e) => {
                  const el = e.currentTarget.style;
                  el.setProperty('--rx', '0deg');
                  el.setProperty('--ry', '0deg');
                  el.setProperty('--glare', '0');
                }}
              >
              <div
                role="button"
                tabIndex={0}
                aria-label="Flashcard. Press space to flip."
                onClick={() => mode === 'flip' && !drag.current?.moved && setFlipped((f) => !f)}
                className={cx('flash-card', flipped && 'is-flipped', fly && `fly-${fly}`, card.img && 'has-pic')}
                data-testid="flash-card"
              >
                <div className="flash-face front">
                  <div className="flex items-center justify-between">
                    <span className="flash-tag">{card.gen ? 'Subnetting · generated' : card.t}</span>
                    {!card.gen && cur >= 0 && (
                      <span className="flex items-center gap-3">
                        {tools}
                        <span className="flex gap-1" aria-label={`Box ${S.box[cur] ?? 0} of 4`}>
                          {[0, 1, 2, 3].map((k) => (
                            <i key={k} className={cx('size-2 rounded-[3px]', k < (S.box[cur] ?? 0) ? 'bg-white shadow-[0_0_6px_#fff]' : 'bg-white/20')} />
                          ))}
                        </span>
                      </span>
                    )}
                  </div>
                  {card.img && !rev && <div className="mt-3"><Picture c={card} /></div>}
                  <p className="flash-q">{card.q}</p>
                  {showCliFront && <pre className="flash-cli">{card.cli}</pre>}
                  {mode === 'type' ? (
                    <form
                      className="mt-auto flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        check();
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input ref={inputRef} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type your answer…" aria-label="Your answer" spellCheck={false} className="min-w-0 flex-1 rounded-xl border border-white/25 bg-black/35 px-3.5 py-2.5 font-mono text-[15px] text-white outline-none focus:border-[var(--hue)]" data-testid="flash-answer" />
                      <button type="submit" className="rounded-xl px-4 text-[13px] font-semibold text-[#0b1020]" style={{ background: 'linear-gradient(90deg, #22b8cf, #38d9a9)' }}>
                        Check
                      </button>
                    </form>
                  ) : (
                    <p className="mt-auto flex justify-between text-[12px] text-white/70">
                      <span>Click or press Space to flip</span>
                      <span>{card.t === 'Subnetting' ? 'Endless' : ''}</span>
                    </p>
                  )}
                </div>
                <div className="flash-face back">
                  <div className="flex items-center gap-2">
                    <span className="order-last ml-auto">{tools}</span>
                    <span className="flash-tag">{card.gen ? 'Subnetting' : card.t}</span>
                    {verdict !== null && (
                      <span className={cx('flex items-center gap-1 rounded-lg px-2 py-0.5 text-[12.5px] font-semibold', verdict ? 'bg-healthy/20 text-healthy' : 'bg-down/20 text-down')} data-testid="flash-verdict">
                        {verdict ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                        {verdict ? 'Correct' : `You typed "${typed}"`}
                      </span>
                    )}
                  </div>
                  <p className="flash-a">{card.a}</p>
                  {card.cli && !showCliFront && <pre className="flash-cli">{card.cli}</pre>}
                  {card.why && <p className="mt-auto border-t border-dashed border-white/15 pt-3 text-[13px] text-muted">💡 {card.why}</p>}
                </div>
              </div>
              </div>
              </div>
            </div>


            <div className="flash-controls">
              <Button onClick={() => go(-1)} disabled={!!card.gen} data-testid="flash-back">
                <ArrowLeft className="size-4" /> Back
              </Button>
              <div className="flex min-w-0 flex-1 justify-center">
                {mode === 'flip' ? (
                  !flipped ? (
                    <button type="button" onClick={() => setFlipped(true)} className="flash-show" data-testid="flash-show">
                      Show answer <kbd>Space</kbd>
                    </button>
                  ) : (
                    <div className="flash-rates" role="group" aria-label="How well did you know it?">
                      {(
                        [
                          ['Again', '#ff6b81'],
                          ['Hard', '#ffa94d'],
                          ['Good', '#38d9a9'],
                          ['Easy', '#4dabf7'],
                        ] as const
                      ).map(([l, c], r) => (
                        <button key={l} type="button" onClick={() => rate(r)} style={{ '--c': c } as CSSProperties} data-testid={`flash-rate-${r}`} title={`${l}: see it again in ${fmtGap(gapFor(S.box[cur] ?? 0, r))}`}>
                          <span className="flex flex-col items-start leading-none">
                            {l}
                            <small>{gen ? 'drill' : fmtGap(gapFor(S.box[cur] ?? 0, r))}</small>
                          </span>
                          <kbd>{r + 1}</kbd>
                        </button>
                      ))}
                    </div>
                  )
                ) : verdict === null ? (
                  <span className="text-[12px] text-faint">Type your answer, then press Enter</span>
                ) : null}
              </div>
              <Button variant="primary" onClick={() => go(1)} data-testid="flash-next">
                Next <ArrowRight className="size-4" />
              </Button>
            </div>
            {undo && (
              <div className="flash-toast" role="status" data-testid="flash-undo">
                Rated <b>{undo.label}</b>
                <button type="button" onClick={undoLast}>
                  Undo <kbd>Z</kbd>
                </button>
              </div>
            )}
            <p className="text-center text-[11.5px] text-faint">{mode === 'flip' ? 'Space flip · 1–4 rate · Z undo · F flag · B skip today · ← → move' : 'Enter to check, Enter again for the next card · ← → back and next'}</p>
          </>
        )}

        {mode !== 'exam' && !summary && !card && (
          <div className="rounded-2xl border border-line bg-pane p-10 text-center" data-testid="flash-done">
            <p className="text-[24px] font-semibold">Deck cleared 🎉</p>
            <p className="mt-1 text-muted">Every card here is mastered or scheduled for later. Pick another topic, or study them again.</p>
            <Button
              className="mt-4"
              onClick={() => {
                const next = { ...S, next: { ...S.next }, box: { ...S.box } };
                pool.forEach((i) => {
                  next.next[i] = 0;
                  next.box[i] = Math.min(next.box[i] ?? 0, 3);
                });
                save(next);
                setTimeout(pick, 0);
              }}
            >
              <RotateCcw className="size-4" /> Study these again
            </Button>
          </div>
        )}

        {mode === 'exam' && !exam && (
          <div className="rounded-2xl border border-line bg-pane p-10 text-center" data-testid="flash-exam-start">
            <p className="flash-score">20 · 5:00</p>
            <p className="mt-3 text-[18px] font-semibold">Exam sprint</p>
            <p className="mx-auto mt-1 max-w-md text-muted">20 multiple-choice questions in 5 minutes from every topic, plus fresh subnetting maths. Your score and every miss are shown at the end.</p>
            <Button variant="primary" className="mt-5" onClick={startExam} data-testid="flash-exam-go">
              Start the exam
            </Button>
          </div>
        )}

        {mode === 'exam' && exam && !exam.done && (() => {
          const q = exam.qs[exam.i];
          return (
            <div className="space-y-3" data-testid="flash-exam">
              <div className="flex items-center gap-3">
                <b className="text-[13px]">
                  {exam.i + 1} / {exam.qs.length}
                </b>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-pane-2">
                  <div className="h-full bg-gradient-to-r from-[#7c5cff] via-[#22b8cf] to-[#f06595] transition-[width]" style={{ width: `${(exam.i / exam.qs.length) * 100}%` }} />
                </div>
                <span className={cx('rounded-lg border px-2.5 py-1 font-mono text-[15px] font-bold', exam.left <= 30 ? 'animate-pulse border-down text-down' : 'border-line')}>
                  {Math.floor(exam.left / 60)}:{String(exam.left % 60).padStart(2, '0')}
                </span>
              </div>
              <div className="flash-qcard" style={{ '--hue': HUE[q.t] ?? '#7c5cff' } as CSSProperties}>
                <span className="flash-tag">{q.t}</span>
                {q.img && <div className="mt-3"><Picture c={q} tall /></div>}
                <p className="flash-q !my-4">{q.q}</p>
                {q.cli && refersToShown(q.q) && <pre className="flash-cli">{q.cli}</pre>}
                <div className="grid gap-2">
                  {q.opts.map((o, k) => {
                    const st = exam.picked === null ? '' : o === q.a ? 'right' : k === exam.picked ? 'wrong' : '';
                    return (
                      <button key={k} type="button" onClick={() => answer(k)} className={cx('flash-opt', st && `is-${st}`)} data-testid={`flash-opt-${k}`}>
                        <b>{k + 1}</b>
                        <span>{o}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-center text-[11.5px] text-faint">Press 1–4 to answer</p>
            </div>
          );
        })()}

        {mode === 'exam' && exam?.done && (() => {
          const p = Math.round((exam.right / exam.qs.length) * 100);
          const used = 300 - exam.left;
          return (
            <div className="rounded-2xl border border-line bg-pane p-8 text-center" data-testid="flash-exam-result">
              <p className="flash-score">{p}%</p>
              <p className="mt-2 text-[18px] font-semibold">
                {exam.right} of {exam.qs.length} correct · {Math.floor(used / 60)}:{String(used % 60).padStart(2, '0')}
              </p>
              <p className="text-muted">
                {p >= 85 ? 'Exam ready on these topics 🎯' : p >= 65 ? 'Close. Drill the misses below.' : 'Keep going. Start with your weakest topics.'}
                {p > exam.prevBest ? ' · New best!' : ` · Best ${Math.max(exam.prevBest, p)}%`}
              </p>
              {exam.missed.length > 0 && (
                <div className="mx-auto mt-5 grid max-w-2xl gap-2 text-left">
                  {exam.missed.map((m, i) => (
                    <div key={i} className="rounded-xl border border-down/30 bg-down/10 px-4 py-2.5 text-[13.5px]">
                      {m.q}
                      <span className="mt-1 block text-healthy">✓ {m.a}</span>
                    </div>
                  ))}
                </div>
              )}
              <Button variant="primary" className="mt-5" onClick={startExam}>
                Take another exam
              </Button>
            </div>
          );
        })()}
      </div>

    </div>
  );
}

/** A small progress ring, same as the book contents. */
function MiniRing({ pct, size, stroke, color, children }: { pct: number; size: number; stroke: number; color: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-line" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.16,1,.3,1)', filter: pct ? `drop-shadow(0 0 3px ${color})` : undefined }} />
      </svg>
      {children}
    </span>
  );
}

/**
 * Topic list for the deck, built like the Learn by topic contents: a progress header, a Continue
 * button, filter chips, and each topic as an accordion of its cards on a glowing timeline.
 */
function FlashTopics({ S, topic, level, custom, onList, cur, onTopic, onCard, onHide }: { S: Stats; topic: string; level: Level; custom: string | null; onList: (label: string, ids: number[]) => void; cur: number; onTopic: (t: string) => void; onCard: (i: number) => void; onHide: () => void }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set([topic === 'All' ? (cur >= 0 ? DECK[cur].t : TOPICS[0]) : topic]));
  const [filter, setFilter] = useState<'all' | 'todo' | 'done'>('all');
  const currentRef = useRef<HTMLButtonElement>(null);
  const isDone = (i: number) => (S.box[i] ?? 0) >= 4;
  const mastered = DECK.filter((_, i) => isDone(i)).length;
  const pct = Math.round((mastered / DECK.length) * 100);
  const now = Date.now();
  const nextUp = DECK.map((_, i) => i).find((i) => atLevel(i, level) && !isDone(i) && (S.next[i] ?? 0) <= now && i !== cur);
  useEffect(() => {
    if (cur < 0) return;
    const t = DECK[cur].t;
    setOpen((s) => (s.has(t) ? s : new Set([...s, t])));
    const id = setTimeout(() => currentRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 300);
    return () => clearTimeout(id);
  }, [cur]);
  return (
    <aside className="book-toc sticky top-0 hidden h-[calc(100dvh-96px)] w-[300px] shrink-0 flex-col self-start md:flex" aria-label="Flashcard topics" data-testid="flash-topics">
      <div className="toc-head relative mb-3 flex items-center gap-3 overflow-hidden rounded-2xl px-3 py-3">
        <MiniRing pct={pct} size={46} stroke={4} color="var(--action)">
          <span className="text-[11px] font-semibold">{pct}%</span>
        </MiniRing>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold tracking-[0.22em] text-faint uppercase">Flashcards</p>
          <p className="text-[12.5px] text-text">
            <b>{mastered}</b>
            <span className="text-muted"> / {DECK.length} mastered</span>
          </p>
        </div>
        <button type="button" onClick={onHide} className="grid size-7 place-items-center rounded-md text-muted hover:bg-pane-2 hover:text-text" title="Hide topics" aria-label="Hide topics" data-testid="flash-topics-hide">
          <PanelLeftClose className="size-4" />
        </button>
      </div>
      <Spectrum S={S} level={level} />
      {nextUp !== undefined && (
        <button type="button" onClick={() => onCard(nextUp)} className="toc-continue group mb-3 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left" data-testid="flash-continue">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-action text-white shadow-[0_0_14px_var(--action)]">
            <Play className="size-3.5 translate-x-px fill-current" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold tracking-[0.18em] text-action uppercase">Continue · {DECK[nextUp].t}</span>
            <span className="block truncate text-[12.5px] text-text">{DECK[nextUp].q}</span>
          </span>
          <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-1" />
        </button>
      )}
      <div className="mb-2 flex gap-1" role="radiogroup" aria-label="Show cards">
        {([['all', 'All'], ['todo', 'To learn'], ['done', 'Mastered']] as const).map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => setFilter(k)} className={cx('toc-chip rounded-full px-2.5 py-1 text-[11.5px]', filter === k ? 'is-on' : 'text-muted hover:text-text')} data-testid={`flash-filter-${k}`}>
            {label}
          </button>
        ))}
        <button type="button" onClick={() => onTopic('All')} className={cx('toc-chip ml-auto rounded-full px-2.5 py-1 text-[11.5px]', topic === 'All' ? 'is-on' : 'text-muted hover:text-text')} title="Study every topic together" data-testid="flash-topic-All">
          Mix all
        </button>
      </div>
      <nav className="toc-scroll min-h-0 flex-1 overflow-y-auto pr-1">
        <ol className="space-y-1">
          {TOPICS.filter((t) => t !== 'Subnetting').map((t, ti) => {
            const all = DECK.map((c, i) => ({ c, i })).filter((x) => x.c.t === t && atLevel(x.i, level));
            const doneN = all.filter((x) => isDone(x.i)).length;
            const shown = filter === 'all' ? all : all.filter((x) => (filter === 'done') === isDone(x.i));
            if (!shown.length) return null;
            const isOpen = filter !== 'all' || open.has(t);
            const isCurrent = topic === t || (cur >= 0 && DECK[cur].t === t);
            const hue = HUE[t] ?? 'var(--action)';
            const curIdx = shown.findIndex((x) => x.i === cur);
            const lastDone = shown.reduce((m, x, k) => (isDone(x.i) ? k : m), -1);
            const reach = Math.max(curIdx, lastDone);
            return (
              <li key={t} className={cx('toc-chapter rounded-xl', isCurrent && 'is-current')} style={{ '--hue': hue } as CSSProperties}>
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; })}
                    aria-expanded={isOpen}
                    className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-2 text-left"
                    data-testid={`flash-topic-row-${t}`}
                  >
                    <MiniRing pct={all.length ? (doneN / all.length) * 100 : 0} size={28} stroke={2.5} color={hue}>
                      <span className="text-[10.5px] font-semibold" style={{ color: isCurrent ? hue : undefined }}>{ti + 1}</span>
                    </MiniRing>
                    <span className="min-w-0 flex-1">
                      <span className={cx('block truncate text-[12.5px] leading-tight', isCurrent ? 'font-semibold text-text' : 'text-muted group-hover:text-text')}>{t}</span>
                      <span className="block text-[10.5px] text-faint">{doneN === all.length ? '✓ Mastered' : `${doneN}/${all.length} mastered`}</span>
                    </span>
                    <ChevronRight className={cx('size-3.5 text-faint transition-transform duration-300', isOpen && 'rotate-90')} />
                  </button>
                  <button type="button" onClick={() => onTopic(t)} className={cx('mr-1 rounded-md px-2 py-1 text-[10.5px] font-semibold tracking-wide uppercase', topic === t ? 'text-white' : 'text-faint hover:text-text')} style={topic === t ? { background: hue } : undefined} title={`Study only ${t}`} data-testid={`flash-topic-${t}`}>
                    Study
                  </button>
                </div>
                <div className={cx('grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(.16,1,.3,1)]', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                  <div className="min-h-0 overflow-hidden">
                    <ol className="toc-line relative mt-0.5 mb-2 ml-[46px] pl-4" style={{ '--reach': shown.length ? `${((reach + 0.5) / shown.length) * 100}%` : '0%' } as CSSProperties}>
                      {shown.map(({ c, i }) => {
                        const on = i === cur;
                        const fin = isDone(i);
                        return (
                          <li key={i} className="relative">
                            <span className={cx('toc-node', on ? 'is-on' : fin ? 'is-done' : '')} aria-hidden>
                              {fin && !on && <Check className="size-2 text-ink" strokeWidth={4} />}
                            </span>
                            <button ref={on ? currentRef : undefined} type="button" onClick={() => onCard(i)} aria-current={on ? 'page' : undefined} className={cx('toc-lesson flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-muted', on && 'is-on')} data-testid={`flash-card-row-${i}`}>
                              <span className="line-clamp-2 min-w-0 flex-1 leading-snug">{c.q}</span>
                              {c.img && <span className="mt-0.5 shrink-0 text-[10px] text-faint" title="Has a picture">▣</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </div>
              </li>
            );
          })}
          <li className={cx('toc-chapter rounded-xl', topic === 'Subnetting' && 'is-current')} style={{ '--hue': HUE.Subnetting } as CSSProperties}>
            <button type="button" onClick={() => onTopic('Subnetting')} className="group flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left" data-testid="flash-topic-Subnetting">
              <span className="grid size-7 place-items-center rounded-full border-2" style={{ borderColor: HUE.Subnetting, color: HUE.Subnetting }}>
                <InfinityIcon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx('block text-[12.5px] leading-tight', topic === 'Subnetting' ? 'font-semibold text-text' : 'text-muted group-hover:text-text')}>Subnetting drills</span>
                <span className="block text-[10.5px] text-faint">Endless, new numbers every time</span>
              </span>
            </button>
          </li>
        </ol>
      </nav>
      <Flagged S={S} on={custom === 'Flagged cards'} onList={onList} />
      <Heatmap S={S} />
    </aside>
  );
}

/** Where every card sits right now: new, learning, reviewing, mastered. */
function Spectrum({ S, level }: { S: Stats; level: Level }) {
  const ids = DECK.map((_, i) => i).filter((i) => atLevel(i, level));
  const seen = (i: number) => S.rated[i] !== undefined || S.box[i] !== undefined;
  const parts = [
    { k: 'New', c: '#5c6b85', n: ids.filter((i) => !seen(i)).length },
    { k: 'Learning', c: '#ffa94d', n: ids.filter((i) => seen(i) && (S.box[i] ?? 0) <= 1).length },
    { k: 'Review', c: '#4dabf7', n: ids.filter((i) => seen(i) && (S.box[i] ?? 0) >= 2 && (S.box[i] ?? 0) < 4).length },
    { k: 'Mastered', c: '#38d9a9', n: ids.filter((i) => (S.box[i] ?? 0) >= 4).length },
  ];
  return (
    <div className="mb-3 px-1" data-testid="flash-spectrum">
      <div className="flash-spectrum" role="img" aria-label={parts.map((p) => `${p.n} ${p.k}`).join(', ')}>
        {parts.map((p) => p.n > 0 && <span key={p.k} style={{ flexGrow: p.n, background: p.c, color: p.c }} title={`${p.k}: ${p.n}`} />)}
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] text-faint">
        {parts.map((p) => (
          <span key={p.k} className="flex items-center gap-1">
            <i className="size-1.5 rounded-full" style={{ background: p.c }} />
            {p.k} <b className="font-semibold text-muted">{p.n}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Last 20 weeks of study, one square per day. */
function Heatmap({ S }: { S: Stats }) {
  const WEEKS = 20;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() - (WEEKS - 1) * 7);
  const days: { k: string; n: number; future: boolean }[] = [];
  for (let d = new Date(start); days.length < WEEKS * 7; d.setDate(d.getDate() + 1)) days.push({ k: dayKey(d), n: S.days[dayKey(d)] ?? 0, future: d > today });
  let streak = 0;
  const d = new Date(today);
  if (!(S.days[dayKey(d)] ?? 0)) d.setDate(d.getDate() - 1);
  while ((S.days[dayKey(d)] ?? 0) > 0) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  const lvl = (n: number) => (n === 0 ? 0 : n < 10 ? 1 : n < 25 ? 2 : n < 50 ? 3 : 4);
  return (
    <div className="mt-2 border-t border-line pt-2.5" data-testid="flash-heatmap">
      <div className="mb-1.5 flex items-baseline justify-between text-[10.5px] text-faint">
        <span className="font-semibold tracking-[0.16em] uppercase">Study days</span>
        <span>
          🔥 <b className="text-muted">{streak}</b> day streak · {S.seen ? Math.round((S.right / S.seen) * 100) : 0}% right
        </span>
      </div>
      <div className="flash-heat">
        {days.map((d) => (
          <i key={d.k} data-l={d.future ? 'f' : lvl(d.n)} className={cx(d.k === dayKey(today) && 'is-today')} title={d.future ? '' : `${d.k}: ${d.n} card${d.n === 1 ? '' : 's'}`} />
        ))}
      </div>
    </div>
  );
}

/** End-of-session recap: score, weakest topics, and a one-click review of the misses. */
function Recap({ sess, onMisses, onMore }: { sess: Sess; onMisses: () => void; onMore: () => void }) {
  const pct = sess.n ? Math.round((sess.right / sess.n) * 100) : 0;
  const weak = Object.entries(sess.topic)
    .map(([t, v]) => ({ t, p: v.n ? v.r / v.n : 0, ...v }))
    .sort((a, b) => a.p - b.p || b.n - a.n)
    .slice(0, 3);
  const msg = pct >= 90 ? 'Sharp. You know this material.' : pct >= 70 ? 'Solid round. Clean up the misses and you are there.' : 'Good work showing up. The misses are where the points are.';
  return (
    <div className="flash-recap" data-testid="flash-recap">
      <div className="flex flex-wrap items-center gap-6">
        <MiniRing pct={pct} size={110} stroke={7} color={pct >= 70 ? '#38d9a9' : '#ffa94d'}>
          <span className="text-[26px] font-bold">{pct}%</span>
        </MiniRing>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-faint uppercase">Session complete</p>
          <p className="mt-1 text-[22px] font-semibold text-text">
            {sess.right} of {sess.n} right
          </p>
          <p className="mt-1 text-[13.5px] text-muted">{msg}</p>
        </div>
      </div>
      {weak.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.18em] text-faint uppercase">Weakest this round</p>
          <div className="space-y-2">
            {weak.map((w) => (
              <div key={w.t} className="flex items-center gap-3 text-[13px]">
                <span className="w-28 truncate text-text">{w.t}</span>
                <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${w.p * 100}%`, background: HUE[w.t] ?? 'var(--action)' }} />
                </span>
                <span className="w-12 text-right text-faint tabular-nums">
                  {w.r}/{w.n}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-7 flex flex-wrap gap-2">
        {sess.miss.length > 0 && (
          <Button variant="primary" onClick={onMisses} data-testid="flash-recap-misses">
            <RotateCcw className="size-4" /> Review your {sess.miss.length} miss{sess.miss.length === 1 ? '' : 'es'}
          </Button>
        )}
        <Button onClick={onMore} data-testid="flash-recap-more">
          Keep going <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Cards you flagged as wrong or unclear: study them, or copy the list to fix the content. */
function Flagged({ S, on, onList }: { S: Stats; on: boolean; onList: (label: string, ids: number[]) => void }) {
  const ids = Object.keys(S.flags).map(Number).filter((i) => DECK[i]);
  const [copied, setCopied] = useState(false);
  if (!ids.length) return null;
  const copy = () => {
    const text = JSON.stringify(ids.map((i) => ({ index: i, topic: DECK[i].t, q: DECK[i].q, a: DECK[i].a })), null, 2);
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }, () => {});
  };
  return (
    <div className={cx('flash-flagged mt-2 flex items-center gap-2 rounded-xl px-2.5 py-2', on && 'is-on')} data-testid="flash-flagged">
      <button type="button" onClick={() => onList('Flagged cards', ids)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-[12.5px]">
        <Flag className="size-3.5 shrink-0 text-[#ffa94d]" />
        <span className="truncate text-text">Flagged cards</span>
        <b className="text-[11.5px] text-muted">{ids.length}</b>
      </button>
      <button type="button" onClick={copy} className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted hover:bg-pane-2 hover:text-text" title="Copy the flagged cards as JSON to hand to Codex">
        {copied ? <Check className="size-3.5 text-healthy" /> : <ClipboardCopy className="size-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
