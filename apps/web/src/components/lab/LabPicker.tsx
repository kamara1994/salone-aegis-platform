'use client';

import { Clock, ListChecks, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, cx, Dialog } from '@/components/ui';
import { CHALLENGES } from '@/lab/challenges';
import { useLab } from '@/lab/store';
import { labCategory, LAB_CATEGORIES, WORKBOOKS, type LabCategory } from '@/lab/workbooks';

type Cat = LabCategory | 'Troubleshooting tickets';
const BLURB: Record<Cat, string> = {
  'Getting started': 'Cable devices, address them and ping. Start here if the lab is new to you.',
  Switching: 'VLANs, trunks, spanning tree, EtherChannel and VTP on Catalyst switches.',
  Routing: 'Inter-VLAN routing, static routes, OSPF, EIGRP and gateway redundancy.',
  'Enterprise builds': 'Build a whole site from parts: a small office, or a campus with core, access and an edge firewall.',
  Security: 'Firewall zones, ACLs, port security, DHCP snooping and STP protection.',
  'SOC and monitoring': 'Mirror traffic to a sensor, trace an alert to a switch port and contain the host.',
  Services: 'DHCP, relay and NAT.',
  Wireless: 'Power an access point over PoE, set up WPA2 and join clients.',
  'Troubleshooting tickets': 'A hidden fault is injected into your current design. Read the ticket, find it and fix it.',
};
const LEVEL_TONE: Record<string, 'neutral' | 'info' | 'warn' | 'good' | 'bad'> = { Foundations: 'good', CCNA: 'neutral', CCNP: 'warn', Security: 'bad', SOC: 'info', Enterprise: 'info', Ops: 'neutral' };

/** The Labs picker: every kind of lab, grouped the way people look for them. */
export function LabPicker({ open, onClose, onStart, onChallenge }: { open: boolean; onClose: () => void; onStart: (id: string) => void; onChallenge: (id: string) => void }) {
  const [cat, setCat] = useState<Cat>('Getting started');
  const [q, setQ] = useState('');
  const active = useLab((s) => s.doc?.workbook?.id);
  const needle = q.trim().toLowerCase();
  const cats: Cat[] = [...LAB_CATEGORIES, 'Troubleshooting tickets'];
  const counts = useMemo(() => Object.fromEntries(cats.map((c) => [c, c === 'Troubleshooting tickets' ? CHALLENGES.length : WORKBOOKS.filter((w) => labCategory(w) === c).length])), []); // eslint-disable-line react-hooks/exhaustive-deps
  const labs = WORKBOOKS.filter((w) => (needle ? `${w.title} ${w.topic} ${w.intro}`.toLowerCase().includes(needle) : labCategory(w) === cat));
  const tickets = needle ? CHALLENGES.filter((c) => c.title.toLowerCase().includes(needle)) : cat === 'Troubleshooting tickets' ? CHALLENGES : [];
  return (
    <Dialog open={open} onClose={onClose} title="Labs" wide>
      <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]" data-testid="lab-picker">
        <div className="space-y-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search labs: VLAN, OSPF, SOC…" aria-label="Search labs" className="h-9 w-full rounded-[5px] border border-line-strong bg-ink px-2 text-[13px] focus:border-action" data-testid="lab-picker-search" />
          <ul className="space-y-0.5" role="tablist" aria-label="Lab types">
            {cats.map((c) => (
              <li key={c}>
                <button role="tab" aria-selected={!needle && cat === c} onClick={() => (setCat(c), setQ(''))} className={cx('flex w-full items-center justify-between rounded-[5px] px-2 py-1.5 text-left text-[13px]', !needle && cat === c ? 'bg-action/15 text-text' : 'text-muted hover:bg-pane-2 hover:text-text')} data-testid={`lab-cat-${c.replace(/\W+/g, '-').toLowerCase()}`}>
                  {c}
                  <span className="text-[11px] tabular-nums text-faint">{counts[c]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-[13px] text-muted">{needle ? `Labs matching “${q}”` : BLURB[cat]}</p>
          <ul className="grid gap-2 lg:grid-cols-2">
            {labs.map((w) => (
              <li key={w.id}>
                <button className={cx('flex h-full w-full flex-col gap-1.5 rounded-[6px] border p-3 text-left hover:border-action', active === w.id ? 'border-action bg-action/10' : 'border-line')} onClick={() => onStart(w.id)} data-testid={`lab-card-${w.id}`}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={LEVEL_TONE[w.level]}>{w.level}</Badge>
                    <span className="text-[11.5px] text-muted">{w.topic}</span>
                    {active === w.id && <Badge tone="info">In progress</Badge>}
                  </span>
                  <span className="text-[14px] font-semibold">{w.title}</span>
                  <span className="line-clamp-3 text-[12.5px] text-muted">{w.intro}</span>
                  <span className="mt-auto flex gap-3 text-[11.5px] text-faint">
                    <span className="inline-flex items-center gap-1">
                      <ListChecks className="size-3.5" /> {w.tasks.length} graded tasks
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5" /> about {w.minutes} min
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {tickets.map((c) => (
              <li key={c.id}>
                <button className="flex h-full w-full flex-col gap-1.5 rounded-[6px] border border-line p-3 text-left hover:border-action" onClick={() => onChallenge(c.id)} data-testid={`lab-ticket-${c.id}`}>
                  <span className="flex items-center gap-1.5">
                    <Badge tone={LEVEL_TONE[c.level]}>{c.level}</Badge>
                    <span className="inline-flex items-center gap-1 text-[11.5px] text-muted">
                      <Wrench className="size-3" /> Troubleshooting ticket
                    </span>
                  </span>
                  <span className="text-[14px] font-semibold">{c.title}</span>
                  <span className="text-[12.5px] text-muted">A fault is hidden in your current design. Fix it, then check your answer.</span>
                </button>
              </li>
            ))}
          </ul>
          {!labs.length && !tickets.length && <p className="text-[13px] text-muted">No lab matches. Try another word, or pick a type on the left.</p>}
          <p className="pt-1 text-[11.5px] text-faint">Starting a lab saves your current design as a layout first, so you can return to it from Saved layouts. Labs are simulated: they grade the design, not real devices.</p>
        </div>
      </div>
    </Dialog>
  );
}
