'use client';

import { useMutation } from '@tanstack/react-query';
import { Power, RotateCw } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useNode } from '@/api/hooks';
import type { ConsoleProtocol, ConsoleSession } from '@/api/types';
import { awaitJob, errorText, useRuntime } from '@/components/providers';
import { Button, cx, ErrorState, Loading } from '@/components/ui';
import type { MockConsole } from '@/mock/engine';
import { useUi } from '@/state/ui';

const XtermMock = dynamic(() => import('./XtermMock').then((m) => m.XtermMock), { ssr: false, loading: () => <Loading rows={3} /> });
const GuacConsole = dynamic(() => import('./GuacConsole').then((m) => m.GuacConsole), { ssr: false, loading: () => <Loading rows={3} /> });

export function ConsoleView({ nodeId, ticketId, compact }: { nodeId: string; ticketId?: string; compact?: boolean }) {
  const rt = useRuntime();
  const theme = useUi((s) => s.theme);
  const node = useNode(nodeId);
  const [protocol, setProtocol] = useState<ConsoleProtocol | null>(null);
  const [session, setSession] = useState<ConsoleSession | null>(null);
  const [mockCon, setMockCon] = useState<MockConsole | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (node.data && !protocol) setProtocol(node.data.consoles?.includes('ssh') ? 'ssh' : node.data.consoles?.[0] ?? null);
  }, [node.data, protocol]);

  useEffect(() => {
    if (!protocol || node.data?.power === 'stopped') return;
    let cancelled = false;
    setError(null);
    setSession(null);
    setMockCon(null);
    rt.api
      .createConsoleSession(nodeId, protocol, ticketId)
      .then((s) => {
        if (cancelled) return;
        if (s.tunnel_url.startsWith('mock://') && rt.mock) setMockCon(rt.mock.openConsole(nodeId, ticketId));
        else setSession(s);
      })
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [rt, nodeId, ticketId, protocol, attempt, node.data?.power]);

  const start = useMutation({
    mutationFn: async () => {
      const job = await rt.api.nodeAction(nodeId, { action: 'start' });
      await awaitJob(job.id);
    },
    onSuccess: () => setAttempt((a) => a + 1),
  });

  if (node.isLoading) return <Loading rows={3} />;
  if (node.error) return <ErrorState error={node.error} retry={() => node.refetch()} />;
  const n = node.data!;
  if (!n.consoles?.length) return <p className="p-4 text-[13px] text-muted">{n.name} is a managed service with no interactive console. Use its provider console.</p>;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {!compact && (
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-2 text-[12px] text-muted">
          <span className="font-medium text-text">{n.name}</span>
          <span>{n.mgmt_ip}</span>
          <div className="ml-2 flex gap-0.5" role="radiogroup" aria-label="Console protocol">
            {n.consoles.map((p) => (
              <button key={p} role="radio" aria-checked={protocol === p} onClick={() => setProtocol(p)} className={cx('rounded px-1.5 py-0.5 uppercase', protocol === p ? 'bg-pane-2 text-text' : 'hover:text-text')}>
                {p}
              </button>
            ))}
          </div>
          {rt.mock && <span className="text-faint">simulated {n.os === 'windows' ? 'PowerShell' : n.os === 'ios' ? 'IOS CLI' : n.os === 'opnsense' ? 'OPNsense shell' : 'shell'}</span>}
          <button className="ml-auto inline-flex items-center gap-1 hover:text-text" onClick={() => setAttempt((a) => a + 1)} title="Reconnect">
            <RotateCw className="size-3.5" /> Reconnect
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {n.power === 'stopped' ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-[13px]">
            <p>{n.name} is powered off.</p>
            <Button variant="primary" size="sm" busy={start.isPending} onClick={() => start.mutate()}>
              <Power className="size-3.5" /> Start {n.name}
            </Button>
            {start.error && <p className="text-down">{errorText(start.error)}</p>}
          </div>
        ) : error ? (
          <ErrorState error={error} retry={() => setAttempt((a) => a + 1)} />
        ) : mockCon ? (
          <XtermMock con={mockCon} theme={theme} />
        ) : session ? (
          <GuacConsole session={session} />
        ) : (
          <Loading rows={3} />
        )}
      </div>
    </div>
  );
}
