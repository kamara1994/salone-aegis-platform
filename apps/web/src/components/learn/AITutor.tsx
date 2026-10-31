'use client';

import { BookOpen, Bot, Check, ChevronRight, Mic, Send, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Badge, Button, Textarea, cx } from '@/components/ui';
import type { TeachLevel, Topic } from '@/content/topics';

type TutorContext = {
  bookId: string;
  bookTitle: string;
  topicId: string;
  topicTitle: string;
  mode: 'Beginner' | 'Technical / Expert';
  simple: string;
  technical: string;
  advanced: string;
  keyTerms: { term: string; definition: string }[];
  prerequisites: { id: string; title: string }[];
  ai: { commonConfusions: string[]; analogiesUsed: string[]; checkQuestions: string[] };
  tryCount: number;
};

type TutorMessage = { id: number; role: 'assistant' | 'user'; text: string };
type TutorHistoryEntry = { role: 'assistant' | 'user'; content: string };
type TutorReply = { text: string; question?: string; analogyKey?: string };

const ANALOGIES = [
  { key: 'house rooms', match: /vlan|virtual lan|broadcast domain/i, use: 'Imagine one house divided into rooms. People in the same room can speak directly; people in different rooms need to use the hallway and a doorway controlled by someone in charge.', breaks: 'A VLAN is a logical Layer 2 boundary, not a physical room, and network forwarding follows switch and router rules rather than people walking.' },
  { key: 'street addresses', match: /ip address|subnet|cidr|ipv4|ipv6/i, use: 'Imagine a city block: the street identifies the neighborhood, while the house number identifies one home on that street.', breaks: 'IP addresses and prefixes are binary values used by routers; they are not assigned by physical geography.' },
  { key: 'roads and intersections', match: /router|routing|route|default gateway|ospf|bgp/i, use: 'Imagine a delivery driver choosing roads and intersections to reach a destination in another town.', breaks: 'Routers choose paths from routing information and packet headers, not from a map or a driver’s judgment.' },
  { key: 'building reception', match: /switch|switching|mac address|ethernet|frame/i, use: 'Imagine a building receptionist who learns which office is at each door and sends a visitor toward the right office.', breaks: 'A switch forwards Ethernet frames using a learned MAC address table; it does not understand people or office names.' },
  { key: 'contact list', match: /dns|domain name/i, use: 'Imagine looking up a person’s name in a contact list to find the number needed to reach them.', breaks: 'DNS is a distributed, cached naming system; it can return multiple record types and does not always map one name to one address.' },
  { key: 'building directory', match: /dhcp|lease|address assignment/i, use: 'Imagine a front desk temporarily assigning a numbered room to each visitor and keeping track of when that assignment expires.', breaks: 'DHCP leases and options are protocol messages; devices can keep static addresses, renew leases, or use relays across subnets.' },
  { key: 'security checkpoint', match: /firewall|access control list|acl|security policy/i, use: 'Imagine a checkpoint checking each person against a list of rules before allowing them through.', breaks: 'Network filtering evaluates packet fields and state according to ordered rules; it does not identify a person’s intent.' },
  { key: 'shared road lanes', match: /trunk|802\.1q|tagged/i, use: 'Imagine one road carrying deliveries for several neighborhoods, with each parcel marked so it reaches the correct area.', breaks: 'An 802.1Q trunk carries tagged Ethernet frames for allowed VLANs; the tag is metadata in the frame, not a label on a physical cable.' },
  { key: 'water pressure', match: /nat|pat|translation/i, use: 'Imagine a building’s mailroom using one public mailing address while tracking which apartment should receive each reply.', breaks: 'NAT rewrites packet addresses and sometimes ports using translation state; it does not replace routing or act as a complete security policy.' },
];

function analogyFor(title: string, used: string[]) {
  return ANALOGIES.find((item) => item.match.test(title) && !used.includes(item.key))
    ?? ANALOGIES.find((item) => !used.includes(item.key))
    ?? ANALOGIES[0];
}

/** Local placeholder boundary. Replace this implementation with POST /api/tutor later; keep secrets server-side. */
export async function askTutor(context: TutorContext, history: TutorHistoryEntry[], userMessage: string): Promise<TutorReply> {
  const message = userMessage.trim();
  void history; // Kept in the call contract for the later server-backed tutor.
  const selectedTerm = context.keyTerms.find((item) => message.toLowerCase().includes(item.term.toLowerCase()));
  const confusion = context.ai.commonConfusions.find((item) => message.toLowerCase().includes(item.toLowerCase()));
  const chosenAnalogy = analogyFor(selectedTerm?.term ?? context.topicTitle, context.ai.analogiesUsed);
  const explanation = selectedTerm?.definition
    ?? (context.mode === 'Beginner' ? context.simple : [context.technical, context.advanced].filter(Boolean).join('\n\n'));
  const check = context.ai.checkQuestions[context.tryCount]
    ?? (selectedTerm ? `In this topic, what does “${selectedTerm.term}” help you identify or do?` : `In your own words, what is the main job of ${context.topicTitle}?`);

  return {
    text: `${confusion ? `A common mix-up is ${confusion}. ` : ''}${chosenAnalogy.use}\n\nConnect it to the topic: ${explanation}\n\nWhere the analogy stops: ${chosenAnalogy.breaks}`,
    question: check,
    analogyKey: chosenAnalogy.key,
  };
}

function isConfused(text: string) {
  return /still confused|still don.t understand|do not understand|didn.t understand|not sure|i don.t get|no,? i|nope|still stuck/i.test(text);
}

function speechRecognition() {
  if (typeof window === 'undefined') return undefined;
  const speechWindow = window as Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};

export function AITutor({ bookId, bookTitle, topic, mode, topics, onTopic }: {
  bookId: string;
  bookTitle: string;
  topic?: Topic;
  mode: TeachLevel;
  topics: Topic[];
  onTopic: (topicId: string) => void;
}) {
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [tryCount, setTryCount] = useState(0);
  const [phase, setPhase] = useState<'welcome' | 'check' | 'prerequisite' | 'done'>('welcome');
  const [busy, setBusy] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState('');
  const [returnTopicId, setReturnTopicId] = useState<string | null>(null);
  const [showPrerequisiteActions, setShowPrerequisiteActions] = useState(false);
  const [usedAnalogies, setUsedAnalogies] = useState<string[]>([]);
  const messageId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  const prerequisites = useMemo(() => (topic?.prerequisites ?? [])
    .map((id) => topics.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Topic => !!candidate)
    .map((candidate) => ({ id: candidate.id, title: candidate.title })), [topic, topics]);

  useEffect(() => {
    setMessages(topic ? [{ id: ++messageId.current, role: 'assistant', text: `Hi! What would you like me to simplify, or what part of “${topic.title}” don’t you understand?` }] : []);
    setDraft('');
    setTryCount(0);
    setPhase('welcome');
    setVoiceNotice('');
    setUsedAnalogies([]);
  }, [bookId, topic?.id, mode]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const addMessage = (role: TutorMessage['role'], text: string) => {
    setMessages((current) => [...current, { id: ++messageId.current, role, text }]);
  };

  const directAnswer = () => {
    if (!topic) return;
    const source = mode === 'simple'
      ? topic.simple
      : [topic.technical, topic.advanced].filter(Boolean).join('\n\n');
    const shortAnswer = source.match(/[^.!?]+(?:[.!?]+|$)/g)?.slice(0, 2).join('').trim();
    addMessage('assistant', shortAnswer || `I don’t have a direct explanation for “${topic.title}” in this topic yet.`);
    setPhase('done');
  };

  const send = async (override?: string) => {
    if (!topic || busy) return;
    const value = (override ?? draft).trim();
    if (!value) return;
    const history = messages.map(({ role, text }) => ({ role, content: text }));
    addMessage('user', value);
    setDraft('');
    setBusy(true);

    if (phase === 'prerequisite') {
      if (/^no\b|not yet|haven.t/i.test(value) && prerequisites[0]) {
        setReturnTopicId(topic.id);
        addMessage('assistant', `Please read “${prerequisites[0].title}” first, then come back here. I’ll be here.`);
        setShowPrerequisiteActions(true);
        setPhase('done');
      } else if (returnTopicId && topic.id === returnTopicId) {
        addMessage('assistant', 'Welcome back. Would you like to review the idea again or ask about a different part?');
        setShowPrerequisiteActions(false);
        setPhase('welcome');
      } else {
        addMessage('assistant', 'If it still feels unclear, review that prerequisite, switch explanation mode, or reread this topic. You can ask me about another part whenever you’re ready.');
        setPhase('done');
      }
      setBusy(false);
      return;
    }

    if (phase === 'check' && !isConfused(value)) {
      addMessage('assistant', 'Good. Keep that idea connected to the real term in the topic. You can ask about another part or use “Just tell me” for a direct explanation.');
      setPhase('done');
      setBusy(false);
      return;
    }

    if (phase === 'check' && tryCount >= 2) {
      if (prerequisites.length) {
        addMessage('assistant', `Have you read “${prerequisites[0].title}”?`);
        setPhase('prerequisite');
      } else {
        addMessage('assistant', 'This topic has no prerequisite listed. Try switching between Beginner and Technical / Expert, or reread the topic explanation, then ask about the part that remains unclear.');
        setPhase('done');
      }
      setBusy(false);
      return;
    }

    const context: TutorContext = {
      bookId,
      bookTitle,
      topicId: topic.id,
      topicTitle: topic.title,
      mode: mode === 'simple' ? 'Beginner' : 'Technical / Expert',
      simple: topic.simple,
      technical: topic.technical,
      advanced: topic.advanced,
      keyTerms: topic.terms.map(([term, definition]) => ({ term, definition })),
      prerequisites,
      ai: {
        commonConfusions: topic.ai?.commonConfusions ?? [],
        analogiesUsed: [...(topic.ai?.analogiesUsed ?? []), ...usedAnalogies],
        checkQuestions: topic.ai?.checkQuestions ?? [],
      },
      tryCount,
    };
    const response = await askTutor(context, history, value);
    if (response.analogyKey) setUsedAnalogies((used) => [...used, response.analogyKey!]);
    addMessage('assistant', response.text + (response.question ? `\n\nQuick check: ${response.question}` : ''));
    setTryCount((count) => count + 1);
    setPhase('check');
    setBusy(false);
  };

  const startVoice = () => {
    const Constructor = speechRecognition();
    if (!Constructor) {
      setVoiceNotice('Voice coming soon in this browser. You can type your question instead.');
      return;
    }
    setVoiceNotice('Listening…');
    const recognition = new Constructor();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) setDraft((current) => current ? `${current} ${transcript}` : transcript);
    };
    recognition.onerror = () => setVoiceNotice('Voice input did not start. You can type your question instead.');
    recognition.onend = () => setVoiceNotice('');
    try {
      recognition.start();
    } catch {
      setVoiceNotice('Voice input is unavailable right now. You can type your question instead.');
    }
  };

  if (!topic) {
    return (
      <div className="min-h-[50vh] rounded-xl border border-line-strong bg-pane p-6" data-testid="ai-tutor-no-topic">
        <div className="flex items-center gap-2 text-action"><Sparkles className="size-5" /><h2 className="text-lg font-semibold text-text">AI Tutor</h2></div>
        <p className="mt-2 text-sm text-muted">Choose a topic from the picker above. The tutor will stay focused on that topic and the selected certification.</p>
      </div>
    );
  }

  return (
    <section className="flex h-[min(760px,78vh)] min-h-[560px] flex-col overflow-hidden rounded-xl border border-line-strong bg-pane" data-testid="ai-tutor-view" aria-label="AI Tutor">
      <header className="border-b border-line p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-action"><Sparkles className="size-5" /><h2 className="text-xl font-semibold text-text">AI Tutor</h2></div>
            <p className="mt-1 text-[13px] text-muted">{bookTitle} <ChevronRight className="inline size-3" /> {topic.title}</p>
          </div>
          <Badge tone="warn"><Bot className="size-3.5" /> Sample tutor · AI not connected</Badge>
        </div>
        <p className="mt-3 rounded-lg border border-degraded/40 bg-degraded/10 px-3 py-2 text-[12.5px] text-muted" role="status">
          This is a local example tutor. It uses the selected topic and does not send your question to an AI service.
        </p>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5" role="log" aria-live="polite" aria-label="Tutor conversation">
        {messages.map((message) => (
          <article key={message.id} className={cx('max-w-[92%] whitespace-pre-wrap rounded-xl border px-3.5 py-3 text-[13.5px] leading-relaxed sm:max-w-[84%]', message.role === 'user' ? 'ml-auto border-action/40 bg-action/10 text-text' : 'border-line bg-pane-2 text-text')}>
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">{message.role === 'assistant' ? <><Bot className="size-3.5" /> Sample tutor</> : 'You'}</p>
            {message.text}
          </article>
        ))}
        {(phase === 'prerequisite' || showPrerequisiteActions) && prerequisites[0] && (
          <div className="flex flex-wrap gap-2">
            {phase === 'prerequisite' && <>
              <Button size="sm" variant="secondary" onClick={() => { addMessage('user', 'Yes, I have read it.'); addMessage('assistant', 'If it is still unclear, review the prerequisite, switch explanation mode, or reread this topic, then ask about the part that remains confusing.'); setPhase('done'); }}>I have read it</Button>
              <Button size="sm" onClick={() => { addMessage('user', 'No, not yet.'); addMessage('assistant', `Please read “${prerequisites[0].title}” first, then come back here. I’ll be here.`); setReturnTopicId(topic.id); setShowPrerequisiteActions(true); setPhase('done'); }}>Not yet</Button>
            </>}
            {showPrerequisiteActions && <Button size="sm" variant="primary" onClick={() => { onTopic(prerequisites[0].id); }}><BookOpen className="size-3.5" /> Open {prerequisites[0].title}</Button>}
            {returnTopicId && <Button size="sm" onClick={() => { const returnTo = returnTopicId; setReturnTopicId(null); setShowPrerequisiteActions(false); onTopic(returnTo); }}>Back to {topics.find((item) => item.id === returnTopicId)?.title ?? 'current topic'}</Button>}
          </div>
        )}
        {phase === 'check' && (
          <div className="flex flex-wrap gap-2 pl-1">
            <Button size="sm" variant="secondary" onClick={() => { addMessage('user', 'I understand.'); addMessage('assistant', 'Good. Keep that idea connected to the real term in the topic. You can ask about another part or use “Just tell me” for a direct explanation.'); setPhase('done'); }}><Check className="size-3.5" /> I understand</Button>
            <Button size="sm" onClick={() => { void send('I’m still confused. Please explain it another way.'); }}>Still confused</Button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form className="border-t border-line p-3 sm:p-4" onSubmit={(event: FormEvent) => { event.preventDefault(); void send(); }}>
        {voiceNotice && <p className="mb-2 text-[12px] text-muted" role="status">{voiceNotice}</p>}
        <label htmlFor="ai-tutor-message" className="sr-only">Ask about this topic</label>
        <Textarea id="ai-tutor-message" rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={`Ask about ${topic.title}…`} className="resize-y" data-testid="ai-tutor-input" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" disabled={!draft.trim() || busy} busy={busy}><Send className="size-3.5" /> Send</Button>
          <Button type="button" onClick={startVoice}><Mic className="size-3.5" /> Speak</Button>
          <Button type="button" variant="secondary" className="ml-auto" onClick={directAnswer}>Just tell me</Button>
        </div>
      </form>
    </section>
  );
}
