'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, MessageSquare, Phone, Send, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useChat } from '@/api/hooks';
import type { ChatMessage, ChatPost, IdentityVerificationRequest, TicketDetail } from '@/api/types';
import { errorText, useApi } from '@/components/providers';
import { Badge, Button, cx, Dialog, Field, QueryView, Textarea } from '@/components/ui';
import { useLive, useUi } from '@/state/ui';

const CHANNEL_ICON = { chat: MessageSquare, email: Mail, voice: Phone } as const;

function Bubble({ m, persona }: { m: ChatMessage; persona?: string }) {
  if (m.author === 'system')
    return (
      <li className="mx-auto max-w-[90%] rounded border border-line bg-pane-2 px-3 py-1.5 text-center text-[12.5px] text-muted" role="note">
        {m.body}
      </li>
    );
  const mine = m.author === 'operator';
  return (
    <li className={cx('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
      <span className="text-[11.5px] text-faint">
        {mine ? 'You' : persona} · {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        {m.channel !== 'chat' && ` · ${m.channel}`}
      </span>
      <div className={cx('max-w-[88%] rounded-[8px] px-3 py-2 text-[13.5px] whitespace-pre-wrap', mine ? 'bg-action text-white' : 'border border-line bg-pane-2')}>{m.body}</div>
      {m.attachments?.map((a, i) => (
        <pre key={i} className="max-h-56 max-w-[88%] overflow-auto rounded border border-line bg-ink p-2 font-mono text-[11.5px] text-muted">
          {a.content}
        </pre>
      ))}
    </li>
  );
}

export function ChatPanel({ t }: { t: TicketDetail }) {
  const api = useApi();
  const qc = useQueryClient();
  const q = useChat(t.id);
  const typing = useLive((s) => s.typing[t.id]);
  const toast = useUi((s) => s.toast);
  const [body, setBody] = useState('');
  const [verifyOpen, setVerifyOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const explaining = t.status === 'client_explanation';
  const automated = t.persona?.traits?.includes('automated');
  const channel = (q.data?.[0]?.channel ?? 'chat') as ChatPost['channel'] & keyof typeof CHANNEL_ICON;
  const Icon = CHANNEL_ICON[channel ?? 'chat'];

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [q.data?.length, typing]);

  const send = useMutation({
    mutationFn: (text: string) => api.postChat(t.id, { body: text, channel, intent: explaining ? 'explanation' : /\?\s*$/.test(text) ? 'question' : 'instruction' }),
    onSuccess: (m) => {
      qc.setQueryData<ChatMessage[]>(['chat', t.id], (old) => (old && !old.some((x) => x.id === m.id) ? [...old, m] : old));
      setBody('');
    },
    onError: (e) => toast({ tone: 'danger', title: 'Message not sent', body: errorText(e) }),
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[12.5px]">
        <div className="grid size-7 place-items-center rounded-full bg-pane-2 text-[11px] font-semibold">{t.persona?.avatar_initials ?? '?'}</div>
        <div className="min-w-0">
          <p className="truncate font-medium">{t.persona?.name ?? 'Client'}</p>
          <p className="truncate text-muted">{t.persona?.role}</p>
        </div>
        <Badge className="ml-auto">
          <Icon className="size-3" /> {channel}
        </Badge>
        {!automated && t.status !== 'closed' && (
          <Button size="sm" variant="ghost" onClick={() => setVerifyOpen(true)} title="Verify identity before sensitive actions such as password or MFA resets">
            <ShieldCheck className="size-3.5" /> Verify identity
          </Button>
        )}
      </div>
      {explaining && (
        <div className="border-b border-healthy/30 bg-healthy/5 px-3 py-2 text-[12.5px]">
          The fix is verified. Now explain to {t.persona?.name?.split(' ')[0] ?? 'the client'} in plain words: what was wrong, what you changed, and what they should do next time. Unexplained jargon gets sent back.
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <QueryView q={q}>
          {(msgs) => (
            <ul className="space-y-3" aria-live="polite" aria-label="Conversation">
              {msgs.map((m) => (
                <Bubble key={m.id} m={m} persona={t.persona?.name?.split(' ')[0]} />
              ))}
              {typing && <li className="text-[12.5px] text-muted">{t.persona?.name?.split(' ')[0]} is typing…</li>}
            </ul>
          )}
        </QueryView>
        <div ref={endRef} />
      </div>
      {automated ? (
        <p className="border-t border-line p-3 text-[12.5px] text-muted">This ticket came from monitoring. There is no person to reply to; investigate and document in work notes.</p>
      ) : t.status === 'closed' ? (
        <p className="border-t border-line p-3 text-[12.5px] text-muted">The ticket is closed.</p>
      ) : (
        <form
          className="flex items-end gap-2 border-t border-line p-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) send.mutate(body.trim());
          }}
        >
          <Textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (body.trim()) send.mutate(body.trim());
              }
            }}
            placeholder={explaining ? 'Explain it as you would to someone non-technical…' : 'Ask a question or tell them what to try. Enter sends, Shift+Enter for a new line.'}
            aria-label="Message to the client"
          />
          <Button type="submit" variant="primary" busy={send.isPending} disabled={!body.trim()} aria-label="Send">
            <Send className="size-4" />
          </Button>
        </form>
      )}
      <VerifyDialog t={t} open={verifyOpen} onClose={() => setVerifyOpen(false)} />
    </div>
  );
}

const METHODS: { v: IdentityVerificationRequest['method']; label: string; hint: string }[] = [
  { v: 'callback_known_number', label: 'Call back the number on file', hint: 'Out of band. Never use a number the requester gives you.' },
  { v: 'manager_confirmation', label: "Confirm with the requester's manager", hint: 'Through a channel you already trust.' },
  { v: 'security_questions', label: 'Ask the security questions', hint: 'Weaker: answers can be researched or phished.' },
  { v: 'in_person', label: 'Verify in person with staff ID', hint: 'Only if they are on site.' },
];

function VerifyDialog({ t, open, onClose }: { t: TicketDetail; open: boolean; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const [method, setMethod] = useState<IdentityVerificationRequest['method']>('callback_known_number');
  const [notes, setNotes] = useState('');
  const v = useMutation({
    mutationFn: () => api.verifyIdentity(t.id, { method, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evidence', t.id] });
      onClose();
    },
  });
  return (
    <Dialog open={open} onClose={onClose} title="Verify the requester's identity">
      <div className="space-y-3 text-[13px]">
        <p className="text-muted">Required before any password, MFA or access change requested over chat, email or phone. The result is recorded in the evidence.</p>
        <fieldset className="space-y-2">
          <legend className="sr-only">Method</legend>
          {METHODS.map((m) => (
            <label key={m.v} className={cx('flex cursor-pointer gap-2 rounded border p-2', method === m.v ? 'border-action' : 'border-line')}>
              <input type="radio" name="method" checked={method === m.v} onChange={() => setMethod(m.v)} className="mt-0.5" />
              <span>
                <span className="font-medium">{m.label}</span>
                <span className="block text-[12px] text-muted">{m.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <Field label="Notes (optional)">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {v.error && <p className="text-down">{errorText(v.error)}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" busy={v.isPending} onClick={() => v.mutate()}>
            Record check
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
