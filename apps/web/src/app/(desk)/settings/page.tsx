'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useClients, useSettings } from '@/api/hooks';
import type { Settings } from '@/api/types';
import { resetLayout } from '@/components/dock/DockLayout';
import { awaitJob, errorText, useRuntime } from '@/components/providers';
import { Badge, Button, ConfirmDialog, Field, Input, Kbd, Pane, QueryView } from '@/components/ui';
import { DEMO_SPEED } from '@/mock/constants';
import { useLive, useUi } from '@/state/ui';

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-1.5">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="text-[13.5px]">{label}</span>
        {hint && <span className="block text-[12px] text-muted">{hint}</span>}
      </span>
    </label>
  );
}

function Form({ initial }: { initial: Settings }) {
  const { api, mock } = useRuntime();
  const qc = useQueryClient();
  const clients = useClients();
  const toast = useUi((s) => s.toast);
  const [s, setS] = useState(initial);
  useEffect(() => setS(initial), [initial]);
  const save = useMutation({
    mutationFn: () => api.putSettings(s),
    onSuccess: (r) => {
      qc.setQueryData(['settings'], r);
      toast({ tone: 'success', title: 'Settings saved' });
    },
    onError: (e) => toast({ tone: 'danger', title: 'Settings not saved', body: errorText(e) }),
  });
  const sch = s.schedule;
  const set = (patch: Partial<Settings['schedule']>) => setS({ ...s, schedule: { ...sch, ...patch } });
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  return (
    <div className="space-y-3">
      <Pane title="Ticket schedule">
        <div className="space-y-2 p-4">
          <Toggle checked={!!sch.enabled} onChange={(v) => set({ enabled: v })} label="Send tickets automatically" hint="The Job Simulation Engine injects faults and opens tickets on its own, weak skills first." />
          <div className="grid max-w-xl gap-3 sm:grid-cols-2">
            <Field label="Tickets per day" hint={mock ? `The simulated lab runs ${DEMO_SPEED}x faster than real time.` : undefined}>
              <Input type="number" min={0} max={50} value={sch.tickets_per_day ?? 12} onChange={(e) => set({ tickets_per_day: Number(e.target.value) })} />
            </Field>
            <Field label="Highest difficulty" hint="1 single clear fault … 9 sabotage">
              <Input type="number" min={1} max={9} value={sch.max_difficulty ?? 5} onChange={(e) => set({ max_difficulty: Number(e.target.value) })} />
            </Field>
          </div>
          <Toggle checked={!!sch.business_hours_only} onChange={(v) => set({ business_hours_only: v })} label="Business hours only (08:00 to 18:00)" />
          <Toggle checked={!!sch.exam_mode} onChange={(v) => set({ exam_mode: v })} label="Exam mode for scheduled tickets" hint="No hints, timed debriefs, model answers only at the end." />
          <fieldset className="pt-2">
            <legend className="text-[12.5px] font-medium text-muted">Clients that receive tickets</legend>
            {clients.data?.map((c) => (
              <Toggle
                key={c.id}
                checked={(sch.enabled_clients ?? []).includes(c.id)}
                onChange={(v) => set({ enabled_clients: v ? [...(sch.enabled_clients ?? []), c.id] : (sch.enabled_clients ?? []).filter((x) => x !== c.id) })}
                label={`${c.name}`}
                hint={`${c.sector.replace('_', ' ')} · ${c.sla_tier} SLA${c.status === 'onboarding' ? ' · onboarding: scenarios for this client arrive in a later release' : ''}`}
              />
            ))}
          </fieldset>
        </div>
      </Pane>
      <Pane title="Notifications and on-call">
        <div className="space-y-2 p-4">
          <Toggle checked={!!s.on_call} onChange={(v) => setS({ ...s, on_call: v })} label="I am on call" hint="P1 pages reach this device." />
          <Toggle checked={!!s.notifications.push_p1} onChange={(v) => setS({ ...s, notifications: { ...s.notifications, push_p1: v } })} label="Push P1 pages to this device" />
          <div className="flex items-center gap-2 pl-7 text-[12.5px] text-muted">
            Browser permission: <Badge>{typeof Notification === 'undefined' ? 'unsupported' : Notification.permission}</Badge>
            {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
              <Button size="sm" onClick={() => void Notification.requestPermission()}>
                Allow notifications
              </Button>
            )}
          </div>
          <Toggle checked={!!s.notifications.sound} onChange={(v) => setS({ ...s, notifications: { ...s.notifications, sound: v } })} label="Sound on new P1" />
          <div className="max-w-xs">
            <Field label="Quiet hours" hint="P2 and lower wait until morning. P1 always pages.">
              <Input value={s.notifications.quiet_hours ?? ''} onChange={(e) => setS({ ...s, notifications: { ...s.notifications, quiet_hours: e.target.value } })} placeholder="22:00-07:00" />
            </Field>
          </div>
        </div>
      </Pane>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-ink py-2">
        <Button variant="ghost" disabled={!dirty} onClick={() => setS(initial)}>
          Discard changes
        </Button>
        <Button variant="primary" disabled={!dirty} busy={save.isPending} onClick={() => save.mutate()}>
          Save settings
        </Button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const q = useSettings();
  const { api, mock } = useRuntime();
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const connection = useLive((s) => s.connection);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const restore = useMutation({
    mutationFn: async () => {
      const job = await api.restoreBaseline('RESTORE');
      await awaitJob(job.id);
    },
    onSuccess: () => {
      setRestoreOpen(false);
      qc.invalidateQueries();
      toast({ tone: 'success', title: 'Baseline restored', body: 'Every injected fault was removed and running scenarios were closed.' });
    },
    onError: (e) => toast({ tone: 'danger', title: 'Restore failed', body: errorText(e) }),
  });
  return (
    <div className="max-w-4xl space-y-3 p-4">
      <h1 className="text-[18px] font-semibold">Settings</h1>
      <QueryView q={q}>{(s) => <Form initial={s} />}</QueryView>
      <Pane title="Lab">
        <div className="space-y-3 p-4 text-[13px]" id="baseline">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <p className="font-medium">Restore the golden baseline</p>
              <p className="text-muted">Runs every scenario's cleanup, powers nodes back on and closes running scenarios without scoring them.</p>
            </div>
            <Button variant="danger" onClick={() => setRestoreOpen(true)}>
              Restore baseline…
            </Button>
          </div>
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <p className="font-medium">Reset panel layouts</p>
              <p className="text-muted">Puts the cockpit and ticket workspace panels back where they started.</p>
            </div>
            <Button onClick={() => { resetLayout('cockpit'); resetLayout('ticket'); toast({ tone: 'info', title: 'Layouts reset' }); }}>Reset layouts</Button>
          </div>
          {mock && (
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <p className="font-medium">Reset demo data</p>
                <p className="text-muted">Simulated lab only: wipes tickets, evidence and scores stored in this browser and starts a fresh shift.</p>
              </div>
              <Button variant="danger" onClick={() => setResetOpen(true)}>
                Reset demo data…
              </Button>
            </div>
          )}
        </div>
      </Pane>
      <Pane title="Connection">
        <dl className="grid grid-cols-[180px_1fr] gap-y-1.5 p-4 text-[13px]">
          <dt className="text-muted">Mode</dt>
          <dd>{api.mode === 'mock' ? 'Simulated lab in this browser (NEXT_PUBLIC_API_MODE=mock)' : 'Live platform'}</dd>
          <dt className="text-muted">REST base</dt>
          <dd className="font-mono">/api/v1</dd>
          <dt className="text-muted">Event stream</dt>
          <dd>{connection}</dd>
          <dt className="text-muted">Contracts</dt>
          <dd>openapi.yaml 1.0.0 · events.schema.json · scenario.schema.json</dd>
        </dl>
      </Pane>
      <Pane title="Keyboard">
        <ul className="space-y-1.5 p-4 text-[13px]">
          <li>
            <Kbd>Ctrl K</Kbd> Actions: open any ticket, console, scenario or replay by name
          </li>
          <li>
            <Kbd>Enter</Kbd> Send chat · <Kbd>Shift Enter</Kbd> New line
          </li>
          <li>
            <Kbd>Ctrl Enter</Kbd> Submit a debrief answer
          </li>
          <li>
            <Kbd>Up</Kbd> <Kbd>Down</Kbd> Command history in consoles · <Kbd>Ctrl L</Kbd> Clear · <Kbd>Ctrl C</Kbd> Cancel line
          </li>
          <li>
            <Kbd>Esc</Kbd> Close drawers and dialogs
          </li>
        </ul>
      </Pane>
      <ConfirmDialog open={restoreOpen} onClose={() => setRestoreOpen(false)} onConfirm={() => restore.mutate()} busy={restore.isPending} typed="RESTORE" title="Restore the golden baseline?" confirmLabel="Restore baseline" body="Every injected fault is removed, stopped nodes start, and running scenarios close unscored. Your evidence and scores stay." />
      <ConfirmDialog open={resetOpen} onClose={() => setResetOpen(false)} onConfirm={() => { mock?.resetAll(); window.location.assign('/'); }} typed="RESET" title="Reset demo data?" confirmLabel="Reset everything" body="All tickets, chat, evidence, debriefs and scores stored in this browser are deleted. This cannot be undone." />
    </div>
  );
}
