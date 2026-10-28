'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Command, LogOut, Moon, Sun } from 'lucide-react';
import Link from 'next/link';
import { signOut } from '@/api/auth';
import { useClients, useNotifications, useSettings, useTickets } from '@/api/hooks';
import { useApi, useRuntime } from '@/components/providers';
import { Badge, cx, fmtDuration, IconButton, Kbd, SlaClock, useNow } from '@/components/ui';
import { useLive, useUi } from '@/state/ui';

function NextTicketTimer() {
  const { mock } = useRuntime();
  const now = useNow(1000);
  const settings = useSettings();
  if (!mock || !settings.data?.schedule.enabled) return null;
  const at = mock.nextLaunchAt();
  return (
    <span className="hidden text-[12.5px] text-muted xl:inline" title="The scheduler opens the next ticket automatically">
      Next ticket in <span className="tabular-nums text-text">{fmtDuration(Math.max(0, at - now))}</span>
    </span>
  );
}

function MostUrgent() {
  const q = useTickets({ status: ['new', 'acknowledged', 'investigating', 'pending_verification'] });
  const t = q.data?.items[0];
  if (!t) return <span className="hidden text-[12.5px] text-muted md:inline">Queue clear</span>;
  return (
    <Link href={`/tickets/${t.id}`} className="hidden items-center gap-2 rounded-[5px] px-2 py-1 text-[12.5px] hover:bg-pane-2 md:flex" title={t.title}>
      <span className="text-muted">Most urgent</span>
      <span className="font-medium">{t.number}</span>
      <SlaClock due={t.sla_due_at} />
    </Link>
  );
}

export function TopBar() {
  const { theme, setTheme, clientId, setClient, setPalette, setNotifications } = useUi();
  const { api } = useRuntime();
  const clients = useClients();
  const notes = useNotifications();
  const connection = useLive((s) => s.connection);
  const unread = notes.data?.items.filter((n) => !n.read).length ?? 0;
  const settings = useSettings();
  const qc = useQueryClient();
  const apiCtx = useApi();
  const onCall = useMutation({
    mutationFn: async () => {
      const s = settings.data!;
      const next = { ...s, on_call: !s.on_call };
      if (next.on_call && typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission();
      return apiCtx.putSettings(next);
    },
    onSuccess: (s) => {
      qc.setQueryData(['settings'], s);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-pane px-3 sm:gap-3">
      <Link href="/" className="flex items-baseline gap-2 pr-2">
        <span className="text-[15px] font-semibold tracking-tight">AEGIS</span>
        <span className="hidden text-[12.5px] text-muted sm:inline">Operator cockpit</span>
      </Link>
      <label className="sr-only" htmlFor="client-switch">
        Client
      </label>
      <select id="client-switch" value={clientId} onChange={(e) => setClient(e.target.value)} className="h-8 max-w-[44vw] min-w-0 rounded-[5px] border border-line-strong bg-ink px-2 text-[13px] sm:max-w-none">
        <option value="all">All clients</option>
        {clients.data?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.status === 'onboarding' ? ' (onboarding)' : ''}
          </option>
        ))}
      </select>
      <MostUrgent />
      <div className="flex-1" />
      <NextTicketTimer />
      {connection !== 'open' && (
        <Badge tone={connection === 'reconnecting' ? 'warn' : 'neutral'} title="Live event stream">
          {connection === 'reconnecting' ? 'Reconnecting…' : connection}
        </Badge>
      )}
      <span className="hidden sm:inline-flex">
      <Badge tone={api.mode === 'mock' ? 'warn' : 'good'} title={api.mode === 'mock' ? 'Running the built-in simulated lab. Set NEXT_PUBLIC_API_MODE=live to use the real back end.' : 'Connected to the live platform'}>
        {api.mode === 'mock' ? 'Simulated lab' : 'Live'}
      </Badge>
      </span>
      <button
        onClick={() => onCall.mutate()}
        disabled={!settings.data}
        aria-pressed={!!settings.data?.on_call}
        className={cx('hidden h-8 items-center gap-1.5 rounded-[5px] border px-2.5 text-[12.5px] sm:flex', settings.data?.on_call ? 'border-healthy/60 text-healthy' : 'border-line-strong text-muted')}
        title="On call: P1 pages go to this device"
      >
        <span className={cx('size-1.5 rounded-full', settings.data?.on_call ? 'bg-healthy' : 'bg-faint')} />
        {settings.data?.on_call ? 'On call' : 'Off call'}
      </button>
      <button onClick={() => setPalette(true)} className="hidden h-8 items-center gap-2 rounded-[5px] border border-line-strong px-2 text-[12.5px] text-muted hover:text-text lg:flex">
        <Command className="size-3.5" aria-hidden /> Actions <Kbd>Ctrl K</Kbd>
      </button>
      <IconButton label={`Notifications, ${unread} unread`} onClick={() => setNotifications(true)} className="relative">
        <Bell className="size-4" />
        {unread > 0 && <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-p1 px-1 text-[10px] font-semibold text-white">{unread}</span>}
      </IconButton>
      <IconButton label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </IconButton>
      <IconButton label="Sign out" onClick={() => void signOut()}>
        <LogOut className="size-4" />
      </IconButton>
    </header>
  );
}
