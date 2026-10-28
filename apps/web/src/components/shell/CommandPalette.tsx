'use client';

import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useScenarios, useTickets, useTopology } from '@/api/hooks';
import { useRuntime } from '@/components/providers';
import { useUi } from '@/state/ui';
import { NAV } from './NavRail';

/** Ctrl+K: every action in the cockpit, by name. */
export function CommandPalette() {
  const { paletteOpen, setPalette, openConsole, setTheme, theme, setNotifications, toast } = useUi();
  const router = useRouter();
  const rt = useRuntime();
  const topo = useTopology('all');
  const open = useTickets({ status: ['new', 'acknowledged', 'investigating', 'pending_verification', 'client_explanation', 'debrief'] });
  const closed = useTickets({ status: ['closed'], limit: 15 });
  const scenarios = useScenarios();

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(!useUi.getState().paletteOpen);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [setPalette]);

  const run = (f: () => void) => {
    setPalette(false);
    f();
  };
  const item = 'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] aria-selected:bg-pane-2';
  const group = '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:text-faint';

  return (
    <Command.Dialog open={paletteOpen} onOpenChange={setPalette} label="Command palette" className="fixed top-[12vh] left-1/2 z-50 w-[620px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-[8px] border border-line-strong bg-pane" overlayClassName="fixed inset-0 z-40 bg-black/50">
      <Command.Input placeholder="Type an action: open DC01 console, replay SM-1001, launch duplex…" className="h-11 w-full border-b border-line bg-transparent px-4 text-[14px] outline-none placeholder:text-faint" />
      <Command.List className="max-h-[60vh] overflow-auto p-2">
        <Command.Empty className="p-4 text-center text-[13px] text-muted">No matching action.</Command.Empty>
        <Command.Group heading="Open tickets" className={group}>
          {open.data?.items.map((t) => (
            <Command.Item key={t.id} value={`ticket ${t.number} ${t.title}`} className={item} onSelect={() => run(() => router.push(`/tickets/${t.id}`))}>
              <span className="font-medium">{t.number}</span> {t.title}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Consoles" className={group}>
          {topo.data?.nodes
            .filter((n) => n.consoles?.length)
            .map((n) => (
              <Command.Item key={n.id} value={`open console ${n.name} ${n.role}`} className={item} onSelect={() => run(() => openConsole(n.id))}>
                Open {n.name} console <span className="text-faint">{n.role}</span>
              </Command.Item>
            ))}
        </Command.Group>
        <Command.Group heading="Go to" className={group}>
          {NAV.map((n) => (
            <Command.Item key={n.href} value={`go to ${n.label}`} className={item} onSelect={() => run(() => router.push(n.href))}>
              Go to {n.label}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Scenarios" className={group}>
          {scenarios.data?.map((s) => (
            <Command.Item key={s.id} value={`launch scenario ${s.title} ${s.tags.join(' ')}`} className={item} onSelect={() => run(() => router.push(`/scenarios?launch=${s.id}`))}>
              Launch “{s.title}” <span className="text-faint">difficulty {s.difficulty}</span>
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Replay" className={group}>
          {closed.data?.items.map((t) => (
            <Command.Item key={t.id} value={`replay incident ${t.number} ${t.title}`} className={item} onSelect={() => run(() => router.push(`/replay/${t.id}`))}>
              Replay {t.number} <span className="text-faint">{t.title}</span>
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading="Cockpit" className={group}>
          <Command.Item value="toggle theme light dark" className={item} onSelect={() => run(() => setTheme(theme === 'dark' ? 'light' : 'dark'))}>
            Switch to {theme === 'dark' ? 'light' : 'dark'} theme
          </Command.Item>
          <Command.Item value="show notifications" className={item} onSelect={() => run(() => setNotifications(true))}>
            Show notifications
          </Command.Item>
          <Command.Item value="restore baseline lab reset" className={item} onSelect={() => run(() => router.push('/settings#baseline'))}>
            Restore the lab baseline…
          </Command.Item>
          {rt.mock && (
            <Command.Item value="send next ticket now scheduler" className={item} onSelect={() => run(() => { rt.mock!.triggerNow(); toast({ tone: 'info', title: 'Scheduler asked for the next ticket' }); })}>
              Send the next scheduled ticket now
            </Command.Item>
          )}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
