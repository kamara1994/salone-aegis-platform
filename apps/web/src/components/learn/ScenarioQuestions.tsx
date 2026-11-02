'use client';

import { CheckCircle2, Gamepad2, RotateCcw, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, Button, cx } from '@/components/ui';
import { forTopic, scenarioQuestions, STAGE_LABEL } from '@/content/scenarioQuestions';
import type { Topic } from '@/content/topics';
import { ScenarioCases } from './ScenarioCases';

export function ScenarioQuestions({ gameIds, topic, ccnaFocus = false }: { gameIds: string[]; topic?: Topic; ccnaFocus?: boolean }) {
  const [focusView, setFocusView] = useState<'focus' | 'practice'>('focus');
  const [level, setLevel] = useState<'beginner' | 'technical'>('beginner');
  const [lessonStep, setLessonStep] = useState(0);
  const [seed, setSeed] = useState(0);
  const all = useMemo(() => scenarioQuestions(gameIds), [gameIds, seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const matched = useMemo(() => forTopic(all, topic), [all, topic]);
  const list = matched.length ? matched : all;
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const q = list[i];
  const vlanLesson = topic?.id === 'vlans';
  const lessonSteps = [
    { title: 'Why VLANs exist', beginner: 'Imagine an office with one big room. A VLAN is like adding walls to make separate rooms. Teams can share the same switches while their local network traffic stays separated. For example, staff computers and guest Wi-Fi can be placed in different VLANs.', technical: 'A VLAN is a Layer 2 broadcast domain. Switches learn and forward MAC addresses within VLAN context; frames are not bridged between VLANs by default. VLANs commonly map to distinct IP subnets. Inter-VLAN communication requires Layer 3 routing and, in production, policy enforcement at that boundary.' },
    { title: 'Access ports', beginner: 'An access port is a switch connection assigned to one room (one VLAN). A connected computer usually sends ordinary Ethernet traffic; the switch keeps track of which VLAN that traffic belongs to.', technical: 'An access interface associates ingress untagged frames with one configured access VLAN. Verify the port mode, VLAN assignment, VLAN existence, and operational state when an endpoint lands in the wrong segment.' },
    { title: 'Trunks and VLAN tags', beginner: 'A trunk is a shared connection between network devices that carries traffic for several rooms. Labels on the traffic tell the receiving switch which VLAN it belongs to.', technical: 'An IEEE 802.1Q trunk carries multiple VLANs using VLAN tags. Validate the allowed VLAN list and ensure both ends agree on trunk and native VLAN settings. A native VLAN mismatch can cause unexpected classification of untagged frames.' },
    { title: 'Inter-VLAN routing', beginner: 'The walls keep rooms separate. When a device in one room needs to reach another, traffic must pass through a controlled doorway: a router or Layer 3 switch.', technical: 'Hosts in different VLAN subnets require a Layer 3 gateway, commonly an SVI per VLAN or router subinterfaces over an 802.1Q trunk. Confirm gateway addressing, routing, ACL or firewall policy, and the return path.' },
    { title: 'Verify and troubleshoot', beginner: 'Check the path in order: is the device connected, in the right VLAN, and can that VLAN cross the switch links? If the destination is in another VLAN, check the gateway too.', technical: 'Check endpoint addressing and gateway; access VLAN and link state; VLAN presence; trunk state and allowed VLANs end to end; MAC learning in the expected VLAN; SVI state; routes and policy; then interface counters and neighbor discovery.' },
  ];
  const answered = Object.keys(picked).filter((k) => list.some((x) => x.id === k));
  const right = answered.filter((k) => list.find((x) => x.id === k)!.answer === picked[k]).length;
  const switcher = ccnaFocus && (
    <div className="flex shrink-0 gap-1 rounded-xl border border-line bg-pane p-1" role="tablist" aria-label="Scenario question set">
      {([['focus', 'CCNA cases'], ['practice', 'Ticket practice']] as const).map(([k, label]) => (
        <button key={k} type="button" role="tab" aria-selected={focusView === k} onClick={() => setFocusView(k)} className={cx('rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors', focusView === k ? 'bg-action text-white shadow-[0_0_16px_-4px_var(--action)]' : 'text-muted hover:text-text')} data-testid={`scenario-set-${k}`}>
          {label}
        </button>
      ))}
    </div>
  );
  if (ccnaFocus && focusView === 'focus') return <ScenarioCases switcher={switcher} />;
  if (!all.length) return <div className="max-w-[760px] space-y-3" data-testid="scenario-questions">
    {switcher && <div className="flex justify-end">{switcher}</div>}
    <p className="text-[13px] text-muted">No scenario cases are linked to this dashboard yet.</p>
  </div>;
  const done = i >= list.length;
  return (
    <div className="max-w-[760px] space-y-3" data-testid="scenario-questions">
      {switcher && <div className="flex justify-end">{switcher}</div>}
      {vlanLesson && (
        <section className="space-y-3 rounded-[6px] border border-line bg-pane p-4" data-testid="vlan-learning-lesson">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-[11px] uppercase tracking-wide text-muted">Networking · CCNA / CompTIA practice</p><h2 className="text-[17px] font-semibold">VLANs</h2></div>
            <div className="flex gap-1" role="group" aria-label="Explanation level">
              {(['beginner', 'technical'] as const).map((value) => <button key={value} onClick={() => setLevel(value)} aria-pressed={level === value} className={cx('rounded border px-2.5 py-1.5 text-[12px]', level === value ? 'border-action text-action' : 'border-line text-muted')}>{value === 'beginner' ? 'Beginner' : 'Technical / Advanced'}</button>)}
            </div>
          </div>
          <div className="space-y-2"><div className="flex items-center justify-between text-[12px] text-muted"><span>Step {lessonStep + 1} of {lessonSteps.length}</span><span>{lessonSteps[lessonStep].title}</span></div><div className="h-1 rounded bg-ink"><div className="h-1 rounded bg-action transition-all" style={{ width: `${((lessonStep + 1) / lessonSteps.length) * 100}%` }} /></div><p className="text-[13.5px] leading-relaxed" data-testid="vlan-lesson-explanation">{level === 'beginner' ? lessonSteps[lessonStep].beginner : lessonSteps[lessonStep].technical}</p><div className="flex justify-between"><Button size="sm" variant="ghost" disabled={lessonStep === 0} onClick={() => setLessonStep(lessonStep - 1)}>Previous</Button><Button size="sm" variant="primary" onClick={() => setLessonStep((lessonStep + 1) % lessonSteps.length)}>{lessonStep === lessonSteps.length - 1 ? 'Review again' : 'Next'}</Button></div></div>
          <p className="text-[11.5px] text-muted">After the lesson, answer the ticket questions below to practise diagnosis and fixes.</p>
        </section>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <Badge tone="info">{list.length} questions</Badge>
        <span className="text-muted">
          {right} of {answered.length} right
        </span>
        {topic && !matched.length && <span className="text-faint" data-testid="scenario-q-nomatch">No case mentions {topic.title} yet, so these cover the whole dashboard.</span>}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => {
            setSeed(seed + 1);
            setI(0);
            setPicked({});
          }}
        >
          <RotateCcw className="size-3.5" /> Shuffle and restart
        </Button>
      </div>
      {done ? (
        <div className="rounded-[6px] border border-line p-4" data-testid="scenario-q-done">
          <p className="text-[16px] font-semibold">
            {right} of {list.length} right
          </p>
          <p className="text-[13px] text-muted">Play the full tickets in Games to practise asking questions, gathering evidence and writing the note.</p>
        </div>
      ) : (
        <article className="space-y-3 rounded-[6px] border border-line bg-pane p-4">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <span>
              Question {i + 1} of {list.length}
            </span>
            <Badge>{STAGE_LABEL[q.stage]}</Badge>
            <span className="truncate">{q.game.title}</span>
          </div>
          <p className="text-[14px] leading-relaxed whitespace-pre-line" data-testid="scenario-q-stem">
            {q.stem}
          </p>
          <ul className="space-y-1.5">
            {q.options.map((o, k) => {
              const chosen = picked[q.id];
              const show = chosen !== undefined;
              return (
                <li key={k}>
                  <button
                    disabled={show}
                    onClick={() => setPicked({ ...picked, [q.id]: k })}
                    className={cx('flex w-full items-start gap-2 rounded-[5px] border px-3 py-2 text-left text-[13px]', !show && 'border-line hover:border-action', show && k === q.answer && 'border-healthy bg-healthy/10', show && k === chosen && k !== q.answer && 'border-down bg-down/10', show && k !== q.answer && k !== chosen && 'border-line opacity-60')}
                    data-testid={`scenario-q-option-${k}`}
                  >
                    {show && k === q.answer ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-healthy" /> : show && k === chosen ? <XCircle className="mt-0.5 size-4 shrink-0 text-down" /> : <span className="mt-0.5 size-4 shrink-0" />}
                    {o}
                  </button>
                </li>
              );
            })}
          </ul>
          {picked[q.id] !== undefined && (
            <div className="space-y-2">
              <p className="text-[13px] text-muted" data-testid="scenario-q-explain">
                {q.explain}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={() => setI(i + 1)} data-testid="scenario-q-next">
                  Next
                </Button>
                <Link href={`/games?template=${q.game.id}`} className="inline-flex h-8 items-center gap-1 rounded-[5px] border border-line px-2.5 text-[12.5px] hover:border-action">
                  <Gamepad2 className="size-3.5" /> Play this ticket
                </Link>
              </div>
            </div>
          )}
        </article>
      )}
    </div>
  );
}
