'use client';

import { Binary, Calculator, Clock, FileCode2, Fingerprint, Hash, NotebookPen, Pause, Play, RotateCcw, ShieldOff, Square, TimerReset, Volume2, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, cx, Dialog } from '@/components/ui';
import type { TeachLevel, Topic } from '@/content/topics';
import { teachingText } from '@/content/topics';
import { decode, defang, describeHash, encode, epochInfo, PORTS, refang, subnet, toBases, type Codec } from '@/learn/tools';

export type ToolId = 'notes' | 'read' | 'timer' | 'subnet' | 'bases' | 'ports' | 'codec' | 'hash' | 'epoch' | 'defang';

export const TOOLS: Record<ToolId, { label: string; hint: string; icon: LucideIcon; needsTopic?: boolean }> = {
  notes: { label: 'My notes', hint: 'Saved on this computer, per topic', icon: NotebookPen, needsTopic: true },
  read: { label: 'Read aloud', hint: 'Hear the topic at your mode', icon: Volume2, needsTopic: true },
  timer: { label: 'Study timer', hint: '25 minutes on, 5 off', icon: TimerReset },
  subnet: { label: 'Subnet calculator', hint: 'Network, broadcast, hosts', icon: Calculator },
  bases: { label: 'Binary / hex converter', hint: 'Numbers and IPv4 octets', icon: Binary },
  ports: { label: 'Port lookup', hint: 'Well-known ports and services', icon: Hash },
  codec: { label: 'Encode / decode', hint: 'Base64, URL, hex', icon: FileCode2 },
  hash: { label: 'Hash identifier', hint: 'Guess a hash type from its shape', icon: Fingerprint },
  epoch: { label: 'Timestamp converter', hint: 'Epoch to date and back', icon: Clock },
  defang: { label: 'Defang / refang', hint: 'Make links and IPs safe to share', icon: ShieldOff },
};

/** Which reference tools suit each dashboard (study tools come first everywhere). */
const BY_DASH: Record<string, ToolId[]> = {
  networking: ['subnet', 'bases', 'ports'],
  'it-support': ['subnet', 'bases', 'ports'],
  cloud: ['subnet', 'ports', 'codec'],
  linux: ['subnet', 'bases', 'ports', 'epoch'],
  security: ['ports', 'codec', 'hash', 'defang'],
  soc: ['epoch', 'defang', 'codec', 'hash', 'ports'],
  pentest: ['ports', 'codec', 'hash', 'subnet'],
  leadership: ['ports', 'hash'],
};

export function toolsFor(dashId: string): { study: ToolId[]; reference: ToolId[] } {
  return { study: ['notes', 'read', 'timer'], reference: BY_DASH[dashId] ?? ['ports', 'codec'] };
}

const input = 'h-9 w-full rounded-[5px] border border-line-strong bg-ink px-2 font-mono text-[13px]';

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="font-mono break-all">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ToolDialog({ tool, topic, mode, onClose }: { tool: ToolId | null; topic?: Topic; mode: TeachLevel; onClose: () => void }) {
  const meta = tool ? TOOLS[tool] : null;
  return (
    <Dialog open={!!tool} onClose={onClose} title={meta ? `${meta.label}${meta.needsTopic && topic ? `: ${topic.title}` : ''}` : ''}>
      <div className="space-y-3" data-testid={tool ? `tool-${tool}` : undefined}>
        {tool === 'notes' && topic && <Notes topic={topic} />}
        {tool === 'read' && topic && <ReadAloud text={teachingText(topic, mode)} />}
        {tool === 'timer' && <StudyTimer />}
        {tool === 'subnet' && <SubnetTool />}
        {tool === 'bases' && <BasesTool />}
        {tool === 'ports' && <PortsTool />}
        {tool === 'codec' && <CodecTool />}
        {tool === 'hash' && <HashTool />}
        {tool === 'epoch' && <EpochTool />}
        {tool === 'defang' && <DefangTool />}
      </div>
    </Dialog>
  );
}

function Notes({ topic }: { topic: Topic }) {
  const key = `aegis.notes.${topic.id}`;
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    try {
      setText(window.localStorage.getItem(key) ?? '');
    } catch {
      /* storage blocked */
    }
  }, [key]);
  useEffect(() => {
    if (saved) return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(key, text);
      } catch {
        /* storage blocked */
      }
      setSaved(true);
    }, 400);
    return () => clearTimeout(t);
  }, [text, saved, key]);
  return (
    <>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        rows={10}
        placeholder={`What do you want to remember about ${topic.title}?`}
        className="w-full rounded-[5px] border border-line-strong bg-ink p-2 text-[13.5px]"
        aria-label="Notes"
        data-testid="notes-text"
      />
      <p className="text-[12px] text-faint">{saved ? 'Saved on this computer.' : 'Saving…'}</p>
    </>
  );
}

function ReadAloud({ text }: { text: string }) {
  const can = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => (can ? window.speechSynthesis.cancel() : undefined), [can]);
  if (!can) return <p className="text-[13px] text-muted">This browser cannot read text aloud.</p>;
  return (
    <>
      <p className="max-h-48 overflow-auto rounded-[5px] border border-line p-3 text-[13.5px] leading-relaxed text-muted">{text}</p>
      <div className="flex gap-2">
        <Button
          variant="primary"
          onClick={() => {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.rate = 0.95;
            u.onend = () => setSpeaking(false);
            window.speechSynthesis.speak(u);
            setSpeaking(true);
          }}
        >
          <Play className="size-4" /> {speaking ? 'Start again' : 'Read it'}
        </Button>
        <Button
          disabled={!speaking}
          onClick={() => {
            window.speechSynthesis.cancel();
            setSpeaking(false);
          }}
        >
          <Square className="size-4" /> Stop
        </Button>
      </div>
    </>
  );
}

function StudyTimer() {
  const [phase, setPhase] = useState<'focus' | 'break'>('focus');
  const [left, setLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const ref = useRef(phase);
  ref.current = phase;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(
      () =>
        setLeft((s) => {
          if (s > 1) return s - 1;
          const next = ref.current === 'focus' ? 'break' : 'focus';
          setPhase(next);
          return next === 'focus' ? 25 * 60 : 5 * 60;
        }),
      1000,
    );
    return () => clearInterval(id);
  }, [running]);
  return (
    <div className="space-y-3 text-center">
      <p className="text-[13px] text-muted">{phase === 'focus' ? 'Focus' : 'Break'}</p>
      <p className="font-mono text-[44px] tabular-nums" data-testid="timer-left">
        {String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}
      </p>
      <div className="flex justify-center gap-2">
        <Button variant="primary" onClick={() => setRunning(!running)}>
          {running ? <Pause className="size-4" /> : <Play className="size-4" />} {running ? 'Pause' : 'Start'}
        </Button>
        <Button
          onClick={() => {
            setRunning(false);
            setPhase('focus');
            setLeft(25 * 60);
          }}
        >
          <RotateCcw className="size-4" /> Reset
        </Button>
      </div>
    </div>
  );
}

function SubnetTool() {
  const [v, setV] = useState('192.168.10.37/26');
  const r = subnet(v);
  return (
    <>
      <input value={v} onChange={(e) => setV(e.target.value)} className={input} aria-label="Address with prefix" placeholder="10.0.0.1/24" data-testid="subnet-input" />
      {r ? (
        <Rows
          rows={[
            ['Network', `${r.network}/${r.prefix}`],
            ['Subnet mask', r.mask],
            ['Wildcard', r.wildcard],
            ['First host', r.first],
            ['Last host', r.last],
            ['Broadcast', r.broadcast],
            ['Usable hosts', r.hosts.toLocaleString()],
          ]}
        />
      ) : (
        <p className="text-[13px] text-muted">Type an IPv4 address and prefix, for example 10.1.2.3/20.</p>
      )}
    </>
  );
}

function BasesTool() {
  const [v, setV] = useState('192.168.1.10');
  const r = toBases(v);
  return (
    <>
      <input value={v} onChange={(e) => setV(e.target.value)} className={input} aria-label="Number or IPv4 address" data-testid="bases-input" />
      <p className="text-[12px] text-faint">A decimal number, 0b binary, 0x hex, or a dotted IPv4 address.</p>
      {r ? <Rows rows={r} /> : <p className="text-[13px] text-muted">Not a number this converter understands.</p>}
    </>
  );
}

function PortsTool() {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = PORTS.filter(([port, proto, name, what]) => !needle || `${port} ${proto} ${name} ${what}`.toLowerCase().includes(needle));
  return (
    <>
      <input value={q} onChange={(e) => setQ(e.target.value)} className={input} placeholder="Port number or service, e.g. 443 or ssh" aria-label="Search ports" data-testid="ports-input" />
      <ul className="max-h-72 divide-y divide-line overflow-auto rounded-[5px] border border-line text-[13px]">
        {list.map(([port, proto, name, what]) => (
          <li key={`${port}${proto}${name}`} className="flex gap-3 px-3 py-1.5">
            <span className="w-16 font-mono">{port}</span>
            <span className="w-14 text-muted">{proto}</span>
            <span className="w-24 font-medium">{name}</span>
            <span className="text-muted">{what}</span>
          </li>
        ))}
        {!list.length && <li className="px-3 py-2 text-muted">No match.</li>}
      </ul>
    </>
  );
}

function CodecTool() {
  const [codec, setCodec] = useState<Codec>('base64');
  const [v, setV] = useState('');
  const enc = encode(codec, v);
  const dec = decode(codec, v);
  return (
    <>
      <div className="flex gap-1" role="radiogroup" aria-label="Format">
        {(['base64', 'url', 'hex'] as const).map((c) => (
          <button key={c} role="radio" aria-checked={codec === c} onClick={() => setCodec(c)} className={cx('rounded-[5px] border px-2.5 py-1 text-[12.5px]', codec === c ? 'border-action bg-action/15' : 'border-line')}>
            {c === 'url' ? 'URL' : c === 'hex' ? 'Hex' : 'Base64'}
          </button>
        ))}
      </div>
      <textarea value={v} onChange={(e) => setV(e.target.value)} rows={3} className="w-full rounded-[5px] border border-line-strong bg-ink p-2 font-mono text-[13px]" aria-label="Text" data-testid="codec-input" />
      <Rows rows={[['Encoded', enc], ['Decoded', dec ?? 'Not valid for this format']]} />
    </>
  );
}

function HashTool() {
  const [v, setV] = useState('');
  return (
    <>
      <input value={v} onChange={(e) => setV(e.target.value)} className={input} placeholder="Paste a hash" aria-label="Hash" data-testid="hash-input" />
      <p className="text-[13px]" data-testid="hash-result">
        {v.trim() ? describeHash(v) : 'Identifies by length and format only; it never cracks anything.'}
      </p>
    </>
  );
}

function EpochTool() {
  const [v, setV] = useState(String(Math.floor(Date.now() / 1000)));
  const r = epochInfo(v);
  return (
    <>
      <input value={v} onChange={(e) => setV(e.target.value)} className={input} aria-label="Timestamp or date" data-testid="epoch-input" />
      <p className="text-[12px] text-faint">Epoch seconds or milliseconds, or a date like 2026-10-29 14:30.</p>
      {r ? <Rows rows={r} /> : <p className="text-[13px] text-muted">Not a timestamp or date.</p>}
    </>
  );
}

function DefangTool() {
  const [v, setV] = useState('');
  return (
    <>
      <textarea value={v} onChange={(e) => setV(e.target.value)} rows={3} placeholder="http://bad.example.com/payload 203.0.113.9" className="w-full rounded-[5px] border border-line-strong bg-ink p-2 font-mono text-[13px]" aria-label="Indicators" data-testid="defang-input" />
      <Rows rows={[['Defanged', defang(v)], ['Refanged', refang(v)]]} />
    </>
  );
}
