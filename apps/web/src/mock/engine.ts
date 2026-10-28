// MockEngine: a complete in-browser implementation of the AEGIS contract (REST + events),
// backed by the simulated lab. Lets the cockpit run end to end before the real back end exists.
import { ApiRequestError, type AegisApi } from '@/api/client';
import { EventHub, type ConnectionState, type EventHandler, type EventStream } from '@/api/events';
import type * as T from '@/api/types';
import { buildQuestions, GLOSSARY, INTERVIEWER_IDS, scoreAnswer, studyList } from './interviewer';
import {
  anyLogonServer, CLIENTS, clientIdBySlug, duplexMismatch, evalFirewall, initialLab, ipConfig, isServiceUp, LINKS, nodeById, nodeByName, nodeHealth, nodeId, reach, renewLease, resolveName, SITES, STATIC_NODES, uuidFor, type LabState, type NodeState,
} from './lab';
import { isSensitiveRequest, personaRespond } from './persona';
import { BEHAVIOURS, PACKS, packById, restoreAllBaselines, type RunCtx, type ScenarioPack } from './scenarios';
import { createShell } from './shells';
import { DEMO_SPEED } from './constants';

export { DEMO_SPEED };

const STORE_KEY = 'aegis.mock.v2';
const TICK_MS = 2000;
export const OPERATOR = { sam: 'adm-jkamara', name: 'Joseph Kamara' };

interface TicketRec extends T.TicketDetail {
  pack_id: string;
  run_id: string | null;
  reopen_count: number;
  first_command?: string;
  explanation_attempts: number;
  explanation_score?: number;
  closed_at?: string;
  resolution_note?: string;
  verified_at?: string;
}
interface RunRec extends T.ScenarioRun {
  ctx: RunCtx;
}
interface AlertRec extends T.Alert {
  truth: T.AlertVerdict;
  rationale?: string;
  run_id?: string;
}
interface DebriefRec extends T.Debrief {
  answers: string[];
  started_at: string;
  scored_at?: string;
}
interface SnapshotRec {
  name: string;
  taken_at: string;
  state: NodeState;
}
interface State {
  version: 2;
  seq: number;
  lab: LabState;
  tickets: TicketRec[];
  chat: Record<string, T.ChatMessage[]>;
  notifications: T.Notification[];
  alerts: AlertRec[];
  runs: RunRec[];
  debriefs: DebriefRec[];
  evidence: Record<string, T.EvidenceRecord[]>;
  frames: Record<string, T.AegisEvent[]>;
  settings: T.Settings;
  nextLaunchAt: number;
  nextNoiseAt: number;
  counters: Record<string, number>;
  snapshots: Record<string, SnapshotRec[]>;
  trend: { week: string; sla_met_pct: number; mttr_minutes: number; avg_debrief_score: number }[];
}

export interface MockConsole {
  node: string;
  banner(): string;
  prompt(): string;
  exec(line: string): string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const iso = (t = Date.now()) => new Date(t).toISOString();
const uid = () => crypto.randomUUID();
const durMs = (d: string) => Number(d.slice(0, -1)) * ({ m: 60e3, h: 3.6e6, d: 8.64e7 }[d.slice(-1) as 'm' | 'h' | 'd'] ?? 3.6e6);

function fnv(s: string): string {
  let h1 = 0x811c9dc5,
    h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ s.charCodeAt(i), 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

const PERSONA_INITIALS = (name: string) =>
  name
    .replace(/\(.*\)/, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

const SKILLS: { skill: string; domain: T.SkillScore['domain']; frameworks: string[]; packs: string[] }[] = [
  { skill: 'VLANs and access ports', domain: 'networking', frameworks: ['CCNA'], packs: ['net-access-port-vlan'] },
  { skill: 'IP addressing and default gateways', domain: 'networking', frameworks: ['CCNA'], packs: ['net-gateway-wrong'] },
  { skill: 'DHCP and DNS', domain: 'networking', frameworks: ['CCNA', 'Network+'], packs: ['net-dhcp-dns-option'] },
  { skill: 'Layer 1-2 troubleshooting (duplex, errors)', domain: 'networking', frameworks: ['CCNA', 'CCNP'], packs: ['net-duplex-mismatch'] },
  { skill: 'Routing: OSPF and BGP', domain: 'networking', frameworks: ['CCNP', 'CCIE'], packs: [] },
  { skill: 'Firewall segmentation', domain: 'security_ops', frameworks: ['Security+', 'CCNP Security'], packs: ['sec-db-firewall-rule'] },
  { skill: 'Active Directory administration', domain: 'identity', frameworks: ['Microsoft', 'Interview'], packs: ['onb-new-hire-finance', 'id-finance-share-access'] },
  { skill: 'Account lockout investigation', domain: 'identity', frameworks: ['Interview', 'Security+'], packs: ['id-lockout-stale-device'] },
  { skill: 'Alert triage', domain: 'security_ops', frameworks: ['Security+', 'SOC'], packs: ['soc-password-spray-triage'] },
  { skill: 'Social engineering defence', domain: 'security_ops', frameworks: ['Security+'], packs: ['se-cfo-mfa-reset'] },
  { skill: 'Outage triage and incident command', domain: 'endpoint', frameworks: ['CCNP', 'ITIL'], packs: ['svc-dc-outage-cascade'] },
  { skill: 'AWS networking and IAM', domain: 'cloud', frameworks: ['AWS'], packs: [] },
  { skill: 'Explaining fixes to clients', domain: 'communication', frameworks: ['Interview'], packs: ['*explain'] },
  { skill: 'Defending your work in interviews', domain: 'interview', frameworks: ['Interview'], packs: ['*debrief'] },
];

const NOISE_ALERTS: { rule: string; rule_id: string; technique: string; sev: T.Priority; node: string; fields: Record<string, string>; truth: T.AlertVerdict }[] = [
  { rule: 'Encoded PowerShell command executed', rule_id: '100230', technique: 'T1059.001', sev: 'P3', node: 'WS-OPS-03', fields: { user: 'CORP\\mkanu', parent: 'C:\\IT\\inventory\\collect.cmd', command_line: 'powershell -enc SQBuAHYAZQBuAHQAbwByAHkA...', signed_script: 'yes (IT inventory)' }, truth: 'benign_true_positive' },
  { rule: 'Impossible travel: sign-in from two countries', rule_id: '100511', technique: 'T1078', sev: 'P2', node: 'DC01', fields: { user: 'mturay', locations: 'Freetown SL, Frankfurt DE', gap_minutes: '6', frankfurt_ip_owner: 'Salone Mutual VPN egress (AWS eu-central-1)' }, truth: 'false_positive' },
  { rule: 'LSASS memory read by unsigned process', rule_id: '100602', technique: 'T1003.001', sev: 'P1', node: 'WS-BO-01', fields: { process: 'C:\\Users\\Public\\upd.exe', signed: 'no', parent: 'outlook.exe', hash_reputation: 'unknown, first seen today' }, truth: 'true_positive' },
  { rule: 'New service installed', rule_id: '100344', technique: 'T1543.003', sev: 'P3', node: 'BKP01', fields: { service: 'BackupAgentUpdater', change_ticket: 'CHG-0412 (approved)', installed_by: 'CORP\\adm-jkamara' }, truth: 'benign_true_positive' },
  { rule: 'Port scan from guest network', rule_id: '100120', technique: 'T1046', sev: 'P3', node: 'FW01', fields: { source: '10.10.80.37 (guest Wi-Fi)', ports_tried: '22,80,443,445,3389', blocked: 'all (rule 99)' }, truth: 'insufficient_evidence' },
];

export class MockEngine implements AegisApi, EventStream {
  readonly mode = 'mock' as const;
  private hub = new EventHub();
  private s: State;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastHealth: Record<string, T.Health> = {};
  private flowState: Record<string, { bytes: number; allowed: number; denied: number; top_app: string }> = {};
  private flowRecords: T.Flow[] = [];
  private consoles = new Map<string, MockConsole>();
  private dirty = false;
  private lastSave = 0;
  private started = false;

  constructor() {
    this.s = this.load() ?? this.seed();
  }

  // ---------------- persistence ----------------
  private load(): State | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as State;
      return s.version === 2 ? s : null;
    } catch {
      return null;
    }
  }
  private save(force = false) {
    if (typeof window === 'undefined') return;
    if (!force && (!this.dirty || Date.now() - this.lastSave < 4000)) return;
    try {
      for (const k of Object.keys(this.s.frames)) if (this.s.frames[k].length > 1500) this.s.frames[k] = this.s.frames[k].slice(-1500);
      window.localStorage.setItem(STORE_KEY, JSON.stringify(this.s));
      this.dirty = false;
      this.lastSave = Date.now();
    } catch {
      /* storage full or blocked: keep running in memory */
    }
  }
  /** Settings > Reset demo data */
  resetAll() {
    if (typeof window !== 'undefined') window.localStorage.removeItem(STORE_KEY);
    this.s = this.seed();
    this.lastHealth = {};
    this.consoles.clear();
    this.save(true);
  }

  // ---------------- EventStream ----------------
  get lastSeq() {
    return this.hub.lastSeq;
  }
  get state(): ConnectionState {
    return this.hub.state;
  }
  on(h: EventHandler) {
    return this.hub.on(h);
  }
  onState(h: (s: ConnectionState) => void) {
    return this.hub.onState(h);
  }
  connect() {
    if (this.started) return;
    this.started = true;
    this.hub.lastSeq = this.s.seq;
    this.hub.setState('open');
    for (const n of STATIC_NODES) this.lastHealth[n.name] = nodeHealth(this.s.lab, n.name);
    // Deferred debriefs reopen at the start of the next session.
    for (const d of this.s.debriefs.filter((x) => x.state === 'deferred')) {
      d.state = 'running';
      setTimeout(() => {
        this.emit('debrief.started', { kind: 'debrief', id: d.id }, { debrief_id: d.id, ticket_id: d.ticket_id, interviewer: d.interviewer }, this.ticket(d.ticket_id)?.client_id, d.ticket_id);
      }, 1500);
    }
    this.timer = setInterval(() => this.tick(), TICK_MS);
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => this.save(true));
    this.tick();
  }
  close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.started = false;
    this.save(true);
    this.hub.setState('closed');
  }

  private emit(type: T.EventType, subject: T.AegisEvent['subject'], data: Record<string, unknown>, clientId?: string | null, ticketId?: string) {
    const e: T.AegisEvent = { seq: ++this.s.seq, type, occurred_at: iso(), client_id: clientId ?? null, subject, data };
    if (ticketId) (this.s.frames[ticketId] ??= []).push(e);
    if (type === 'node.health_changed' || type === 'flow.batch') {
      for (const t of this.openTickets()) {
        const affected = t.affected_node_ids ?? [];
        if (type === 'flow.batch' || affected.includes(subject.id)) (this.s.frames[t.id] ??= []).push(e);
      }
    }
    this.dirty = true;
    this.hub.emit(e);
    return e;
  }

  private evidence(ticketId: string, kind: T.EvidenceRecord['kind'], payload: Record<string, unknown>) {
    const list = (this.s.evidence[ticketId] ??= []);
    const prev = list.at(-1)?.hash ?? '0'.repeat(16);
    const rec: T.EvidenceRecord = { id: uid(), ticket_id: ticketId, kind, payload, created_at: iso() };
    rec.hash = fnv(prev + JSON.stringify(rec));
    list.push(rec);
    this.dirty = true;
  }

  // ---------------- helpers ----------------
  private ticket(id: string) {
    return this.s.tickets.find((t) => t.id === id);
  }
  private openTickets() {
    return this.s.tickets.filter((t) => t.status !== 'closed');
  }
  private run(id: string | null | undefined) {
    return id ? this.s.runs.find((r) => r.id === id) : undefined;
  }
  private packOf(t: TicketRec): ScenarioPack {
    return packById(t.pack_id) ?? this.genericPack(t);
  }
  private notFound(op: string, what: string): never {
    throw new ApiRequestError(404, 'not_found', `${what} not found`, op);
  }
  private async net<R>(f: () => R): Promise<R> {
    await sleep(40 + Math.random() * 120);
    return f();
  }
  private job(kind: string, subject: T.Subject): T.Job {
    return { id: uid(), kind, status: 'running', subject, created_at: iso() };
  }
  private finishJob(job: T.Job, result: Record<string, unknown> = {}, error?: string) {
    this.emit(error ? 'job.failed' : 'job.completed', { kind: 'job', id: job.id }, { job_id: job.id, kind: job.kind, result, ...(error ? { error } : {}) });
  }

  private genericPack(t: TicketRec): ScenarioPack {
    return {
      id: 'soc-alert-investigation', version: 1, title: t.title, client: 'salone-mutual', category: 'security', tags: ['soc', 'interview'], difficulty: 3,
      sla: { priority: t.priority, resolve_within: '4h' },
      notification: { channel: 'chat', persona: 'soc-bot', opening: t.description ?? t.title },
      persona: { name: 'Wazuh SIEM', role: 'Automated alert', traits: ['automated'] },
      affected_nodes: (t.affected_node_ids ?? []).map((id) => nodeById(id)?.name ?? '').filter(Boolean),
      hints: ['Scope first: which hosts and accounts are involved?', 'Collect evidence before containing.', 'Contain, eradicate, recover, then document.'],
      checks: [{ id: 'documented', label: 'Investigation documented in work notes', target: 'WAZUH01', run: '-' }],
      debrief: { interviewer: 'soc-lead', root_cause: 'Alert investigated, scoped, contained and documented.', must_cover: ['scope', 'containment', 'evidence', 'false positive vs benign true positive'], what_ifs: ['The same alert fires on 20 hosts at once. What changes?', 'What would make you escalate to incident response?'], rubric: { root_cause: 30, safe_fix: 20, verification: 20, documentation: 20, client_explanation: 10 } },
    };
  }

  // ---------------- seeding ----------------
  private seed(): State {
    const now = Date.now();
    const s: State = {
      version: 2, seq: 0, lab: initialLab(), tickets: [], chat: {}, notifications: [], alerts: [], runs: [], debriefs: [], evidence: {}, frames: {},
      settings: {
        schedule: { enabled: true, tickets_per_day: 12, max_difficulty: 5, business_hours_only: false, exam_mode: false, enabled_clients: [clientIdBySlug('salone-mutual')] },
        notifications: { push_p1: true, sound: false, quiet_hours: '22:00-07:00' },
        on_call: true,
      },
      nextLaunchAt: now + 90_000, nextNoiseAt: now + 150_000, counters: { 'salone-mutual': 1000, 'kamara-logistics': 200 }, snapshots: {}, trend: [],
    };
    this.s = s;
    this.seedHistory(now);
    // Two noise alerts already waiting in the SOC queue
    for (const a of NOISE_ALERTS.slice(0, 2)) this.raiseNoise(a, now - 30 * 60e3, false);
    const ad = (kind: T.Notification['kind'], sev: T.Priority, title: string, body: string, source: T.Notification['source'], ago: number, client = 'salone-mutual') =>
      s.notifications.push({ id: uid(), client_id: clientIdBySlug(client), kind, severity: sev, title, body, source, read: false, created_at: iso(now - ago) });
    ad('growth', 'P4', 'Kamara Logistics signed: onboarding starts', 'New client: small logistics business on Microsoft 365, one office firewall, 2 laptops. Silver SLA. Onboarding checklist opens when you enable the client in Settings.', 'client', 3.2 * 3.6e6, 'kamara-logistics');
    ad('advisory', 'P2', 'Sample feed: CISA KEV adds an exploited VPN appliance flaw', 'In live mode this comes from the CISA Known Exploited Vulnerabilities feed and is matched against client inventory. 1 client runs an affected product family. Patch or mitigate within 48 hours.', 'cisa_kev', 5.5 * 3.6e6);
    ad('advisory', 'P3', 'Sample feed: Patch Tuesday, 3 critical Windows updates', 'In live mode this comes from Microsoft\'s monthly release. Ring 1 (test) is due Wednesday, ring 2 (pilot) Thursday.', 'patch_tuesday', 26 * 3.6e6);
    // Work waiting at the start of the shift
    this.launch('net-gateway-wrong', 'practice', now - 14 * 60e3, true);
    this.launch('soc-password-spray-triage', 'practice', now - 6 * 60e3, true);
    return s;
  }

  private seedHistory(now: number) {
    const order = ['net-access-port-vlan', 'onb-new-hire-finance', 'net-dhcp-dns-option', 'id-finance-share-access', 'net-gateway-wrong', 'sec-db-firewall-rule', 'id-lockout-stale-device', 'net-duplex-mismatch', 'soc-password-spray-triage', 'net-access-port-vlan', 'svc-dc-outage-cascade', 'id-lockout-stale-device', 'net-dhcp-dns-option', 'se-cfo-mfa-reset'];
    const weeks: Record<string, { n: number; sla: number; mttr: number; score: number }> = {};
    order.forEach((pid, i) => {
      const pack = packById(pid)!;
      const created = now - (22 - i * 1.5) * 8.64e7 - 3.6e6;
      const mttrMin = Math.round(55 - i * 2.6 + (i % 3) * 7);
      const closed = created + mttrMin * 60e3 + 12 * 60e3;
      const score = Math.min(94, Math.round(56 + i * 2.4 + (i % 2 ? 4 : -3)));
      const slaMet = !(i === 2 || i === 6);
      const id = uuidFor(`hist:${i}:${pid}`);
      const num = `SM-${940 + i}`;
      const persona = pack.persona ?? {};
      const t: TicketRec = {
        id, client_id: clientIdBySlug('salone-mutual'), number: num, title: pack.title, priority: pack.sla.priority, status: 'closed', category: pack.category, assignee: OPERATOR.name,
        reporter_persona_id: uuidFor(`persona:${pack.notification.persona}`), scenario_run_id: uuidFor(`hrun:${i}`),
        affected_node_ids: pack.affected_nodes.map(nodeId), tags: pack.tags, sla_due_at: iso(created + durMs(pack.sla.resolve_within)), sla_breached: !slaMet,
        created_at: iso(created), updated_at: iso(closed), description: pack.notification.opening,
        persona: { id: uuidFor(`persona:${pack.notification.persona}`), client_id: clientIdBySlug('salone-mutual'), name: persona.name ?? 'User', role: persona.role ?? '', traits: persona.traits, avatar_initials: PERSONA_INITIALS(persona.name ?? 'U') },
        work_notes: [{ id: uid(), author: OPERATOR.name, body: `Root cause: ${pack.debrief.root_cause}`, created_at: iso(closed - 20 * 60e3) }],
        checks: pack.checks.map((c) => ({ id: uid(), check_id: c.id, label: c.label, passed: true, output: 'passed', ran_at: iso(closed - 15 * 60e3) })),
        hints_used: i < 5 ? 1 : 0, hints_available: pack.hints.length, mode: 'practice', debrief_id: uuidFor(`hdeb:${i}`),
        timeline: [], pack_id: pid, run_id: null, reopen_count: i === 3 || i === 8 ? 1 : 0, explanation_attempts: 1, explanation_score: Math.min(95, 60 + i * 2), closed_at: iso(closed), resolution_note: pack.debrief.root_cause, verified_at: iso(closed - 14 * 60e3),
      };
      t.timeline = this.timelineFrom(t, [
        [created, 'created', `Ticket opened by ${persona.name ?? 'monitoring'}`],
        [created + 4 * 60e3, 'status', 'Acknowledged and claimed'],
        [created + 6 * 60e3, 'status', 'Investigating'],
        [closed - 16 * 60e3, 'status', 'Resolved: checks running'],
        [closed - 14 * 60e3, 'check', 'All checks passed'],
        [closed - 10 * 60e3, 'chat', 'Explained the fix to the client'],
        [closed, 'debrief', `Debrief scored ${score}`],
      ]);
      this.s.tickets.push(t);
      const deb: DebriefRec = {
        id: t.debrief_id!, ticket_id: id, interviewer: INTERVIEWER_IDS[pack.debrief.interviewer], state: 'scored', current_question_id: null, overall_score: score, answers: [], started_at: iso(closed - 9 * 60e3), scored_at: iso(closed),
        questions: buildQuestions(pack, { ticketNumber: num, hintsUsed: t.hints_used ?? 0, long: false }).map((q, qi) => ({ ...q, answer: '(answer recorded in the session)', score: { total: Math.max(40, score + (qi - 1) * 4), feedback: 'Recorded in an earlier session.' } })),
        study_list: score < 70 ? pack.debrief.must_cover.slice(-2) : [], assigned_scenarios: [],
      };
      this.s.debriefs.push(deb);
      // Evidence and replay frames for the closed ticket
      const ev = (at: number, kind: T.EvidenceRecord['kind'], payload: Record<string, unknown>) => {
        const list = (this.s.evidence[id] ??= []);
        const prev = list.at(-1)?.hash ?? '0'.repeat(16);
        const r: T.EvidenceRecord = { id: uid(), ticket_id: id, kind, payload, created_at: iso(at) };
        r.hash = fnv(prev + JSON.stringify(r));
        list.push(r);
      };
      ev(created, 'status_change', { from: null, to: 'new' });
      ev(created + 4 * 60e3, 'status_change', { from: 'new', to: 'acknowledged' });
      ev(created + 6 * 60e3, 'status_change', { from: 'acknowledged', to: 'investigating' });
      ev(created + 7 * 60e3, 'chat', { author: 'client', body: pack.notification.opening });
      ev(created + 9 * 60e3, 'command', { node: pack.affected_nodes[0], command: pack.category === 'network' ? 'ipconfig /all' : 'Get-ADUser -Properties *', output: '(recorded)' });
      ev(closed - 16 * 60e3, 'status_change', { from: 'investigating', to: 'pending_verification' });
      for (const c of pack.checks) ev(closed - 15 * 60e3, 'check', { check_id: c.id, label: c.label, passed: true });
      ev(closed - 10 * 60e3, 'chat', { author: 'operator', body: 'Explained the cause and fix in plain words.' });
      ev(closed, 'debrief_answer', { overall_score: score, final: true });
      this.s.frames[id] = (this.s.evidence[id] ?? []).map((r, k) => ({
        seq: k + 1, occurred_at: r.created_at, client_id: t.client_id, subject: { kind: 'ticket' as const, id },
        type: (r.kind === 'status_change' ? 'ticket.status_changed' : r.kind === 'chat' ? 'chat.message' : r.kind === 'check' ? 'check.result' : r.kind === 'debrief_answer' ? 'debrief.scored' : 'ticket.updated') as T.EventType,
        data: r.kind === 'chat' ? { id: uid(), ticket_id: id, author: r.payload.author, channel: 'chat', body: r.payload.body } : r.kind === 'status_change' ? { from: r.payload.from, to: r.payload.to } : r.kind === 'command' ? { command: r.payload.command, node: r.payload.node } : r.payload,
      }));
      const wk = weekLabel(new Date(created));
      const w = (weeks[wk] ??= { n: 0, sla: 0, mttr: 0, score: 0 });
      w.n++;
      w.sla += slaMet ? 1 : 0;
      w.mttr += mttrMin;
      w.score += score;
    });
    this.s.trend = Object.entries(weeks).map(([week, w]) => ({ week, sla_met_pct: Math.round((w.sla / w.n) * 100), mttr_minutes: Math.round(w.mttr / w.n), avg_debrief_score: Math.round(w.score / w.n) }));
  }

  private timelineFrom(_t: TicketRec, rows: [number, string, string][]) {
    return rows.map(([at, kind, summary]) => ({ at: iso(at), kind, summary }));
  }

  // ---------------- scenario lifecycle ----------------
  private launch(packId: string, mode: T.ScenarioMode, at = Date.now(), silent = false): { ticket: TicketRec; run: RunRec } {
    const pack = packById(packId);
    if (!pack) this.notFound('createScenarioRun', `Scenario ${packId}`);
    const behaviour = BEHAVIOURS[packId];
    const clientId = clientIdBySlug(pack.client);
    const runId = uid();
    const ticketId = uid();
    const run: RunRec = { id: runId, scenario_id: packId, client_id: clientId, ticket_id: ticketId, state: 'injecting', mode, injected_at: iso(at), hints_used: 0, ctx: { startedAt: iso(at), identityChecks: [] } };
    this.s.runs.push(run);
    behaviour?.inject(this.s.lab);
    run.state = 'running';
    const prefix = pack.client === 'kamara-logistics' ? 'KL' : 'SM';
    const num = `${prefix}-${++this.s.counters[pack.client]}`;
    const persona = pack.persona ?? {};
    const t: TicketRec = {
      id: ticketId, client_id: clientId, number: num, title: pack.notification.title ?? pack.title, priority: pack.sla.priority, status: 'new', category: pack.category, assignee: null,
      reporter_persona_id: uuidFor(`persona:${pack.notification.persona}`), scenario_run_id: runId, affected_node_ids: pack.affected_nodes.map(nodeId), tags: pack.tags,
      sla_due_at: iso(at + durMs(pack.sla.resolve_within)), sla_breached: false, created_at: iso(at), updated_at: iso(at), description: pack.notification.opening,
      persona: { id: uuidFor(`persona:${pack.notification.persona}`), client_id: clientId, name: persona.name ?? 'User', role: persona.role ?? '', traits: persona.traits, avatar_initials: PERSONA_INITIALS(persona.name ?? 'U') },
      work_notes: [], checks: pack.checks.map((c) => ({ id: uid(), check_id: c.id, label: c.label, passed: null })), hints_used: 0, hints_available: pack.hints.length, mode,
      timeline: [{ at: iso(at), kind: 'created', summary: `${pack.notification.channel === 'email' ? 'Email' : 'Chat'} from ${persona.name ?? 'monitoring'}` }],
      pack_id: packId, run_id: runId, reopen_count: 0, explanation_attempts: 0,
    };
    this.s.tickets.push(t);
    const opening: T.ChatMessage = { id: uid(), ticket_id: ticketId, author: 'client', channel: pack.notification.channel, body: pack.notification.opening, created_at: iso(at) };
    this.s.chat[ticketId] = [opening];
    this.evidence(ticketId, 'status_change', { from: null, to: 'new', scenario: packId, version: pack.version, mode });
    this.evidence(ticketId, 'chat', { author: 'client', body: opening.body });
    const note: T.Notification = {
      id: uid(), client_id: clientId, kind: (pack.notification.kind as T.Notification['kind']) ?? 'break_fix', severity: pack.sla.priority, title: `${num}: ${t.title}`,
      body: pack.notification.opening, source: pack.notification.persona === 'soc-bot' ? 'monitor' : 'client', ticket_id: ticketId, read: false, created_at: iso(at),
    };
    this.s.notifications.push(note);
    if (packId === 'soc-password-spray-triage') {
      const a: AlertRec = {
        id: uid(), client_id: clientId, rule: 'Possible password spray (Kerberos pre-auth failures)', rule_id: '100410', attack_technique: 'T1110.003', severity: 'P2', node_id: nodeId('DC01'),
        fields: { failures: '52 in 5 min', event_id: '4771', accounts: 'svc-backup, svc-sql', source_ip: '10.10.70.15 (BKP01)', failure_code: '0x18 (bad password)' },
        state: 'new', claimed_by: null, linked_ticket_id: ticketId, created_at: iso(at), truth: 'benign_true_positive', run_id: runId,
      };
      this.s.alerts.push(a);
      run.ctx.alertId = a.id;
      if (!silent) this.emit('alert.fired', { kind: 'alert', id: a.id }, { id: a.id, rule: a.rule, severity: a.severity, node_id: a.node_id, state: a.state }, clientId, ticketId);
    }
    if (!silent) {
      this.emit('scenario.state_changed', { kind: 'scenario_run', id: runId }, { scenario_id: packId, state: 'running', ticket_id: ticketId, affected_node_ids: t.affected_node_ids }, clientId, ticketId);
      this.emit('ticket.created', { kind: 'ticket', id: ticketId }, this.ticketData(t), clientId, ticketId);
      this.emit('chat.message', { kind: 'ticket', id: ticketId }, { ...opening }, clientId, ticketId);
      this.emit('notification.created', { kind: 'notification', id: note.id }, { id: note.id, kind: note.kind, severity: note.severity, title: note.title, body: note.body, source: note.source, ticket_id: ticketId, push: note.severity === 'P1' && !!this.s.settings.notifications.push_p1 }, clientId, ticketId);
      this.healthTick();
    }
    return { ticket: t, run };
  }

  private ticketData(t: TicketRec) {
    return { id: t.id, number: t.number, title: t.title, priority: t.priority, status: t.status, sla_due_at: t.sla_due_at, affected_node_ids: t.affected_node_ids };
  }

  private setStatus(t: TicketRec, to: T.TicketStatus, reason?: string) {
    const from = t.status;
    if (from === to) return;
    t.status = to;
    t.updated_at = iso();
    t.timeline.push({ at: iso(), kind: 'status', summary: `${label(from)} → ${label(to)}${reason ? `: ${reason}` : ''}` });
    this.evidence(t.id, 'status_change', { from, to, reason });
    this.emit('ticket.status_changed', { kind: 'ticket', id: t.id }, { from, to, ...(reason ? { reason } : {}) }, t.client_id, t.id);
  }

  private finishRun(t: TicketRec, state: 'resolved' | 'aborted') {
    const run = this.run(t.run_id);
    if (!run) return;
    if (run.state !== 'resolved' && run.state !== 'aborted') {
      run.state = state;
      run.resolved_at = iso();
      this.emit('scenario.state_changed', { kind: 'scenario_run', id: run.id }, { scenario_id: run.scenario_id, state, ticket_id: t.id }, t.client_id, t.id);
    }
  }

  // ---------------- tick ----------------
  private tick() {
    const now = Date.now();
    const lab = this.s.lab;
    for (const r of this.s.runs.filter((x) => x.state === 'running')) BEHAVIOURS[r.scenario_id]?.tick?.(lab, r.ctx, now);
    this.ghostTraffic();
    this.healthTick();
    this.emit('flow.batch', { kind: 'link', id: 'all' }, { window_s: 2, edges: Object.entries(this.flowState).map(([edge_id, f]) => ({ edge_id, bytes_per_s: Math.round(f.bytes), allowed: f.allowed, denied: f.denied, top_app: f.top_app })) });
    for (const t of this.openTickets()) {
      const breached = now > Date.parse(t.sla_due_at);
      if (breached !== !!t.sla_breached) {
        t.sla_breached = breached;
        this.emit('ticket.updated', { kind: 'ticket', id: t.id }, this.ticketData(t), t.client_id, t.id);
      }
    }
    this.scheduler(now);
    if (now > this.s.nextNoiseAt) {
      this.s.nextNoiseAt = now + (4 + Math.random() * 5) * 60e3;
      const open = this.s.alerts.filter((a) => a.state !== 'classified').map((a) => a.rule);
      const pick = NOISE_ALERTS.find((a) => !open.includes(a.rule));
      if (pick && open.length < 4) this.raiseNoise(pick, now, true);
    }
    this.save();
  }

  private raiseNoise(a: (typeof NOISE_ALERTS)[number], at: number, live: boolean) {
    const n = nodeByName(a.node)!;
    const rec: AlertRec = { id: uid(), client_id: clientIdBySlug(n.client), rule: a.rule, rule_id: a.rule_id, attack_technique: a.technique, severity: a.sev, node_id: nodeId(a.node), fields: a.fields, state: 'new', claimed_by: null, created_at: iso(at), truth: a.truth };
    this.s.alerts.push(rec);
    if (live) {
      this.emit('alert.fired', { kind: 'alert', id: rec.id }, { id: rec.id, rule: rec.rule, severity: rec.severity, node_id: rec.node_id, state: 'new' }, rec.client_id);
      if (a.sev === 'P1') {
        const note: T.Notification = { id: uid(), client_id: rec.client_id, kind: 'security', severity: 'P1', title: `SIEM: ${a.rule} on ${a.node}`, body: Object.entries(a.fields).map(([k, v]) => `${k}: ${v}`).join(' · '), source: 'monitor', read: false, created_at: iso(at) };
        this.s.notifications.push(note);
        this.emit('notification.created', { kind: 'notification', id: note.id }, { id: note.id, kind: note.kind, severity: note.severity, title: note.title, body: note.body, source: note.source, push: !!this.s.settings.notifications.push_p1 }, rec.client_id);
      }
    }
  }

  private scheduler(now: number) {
    const sch = this.s.settings.schedule;
    if (!sch.enabled || now < this.s.nextLaunchAt) return;
    const per = (8.64e7 / Math.max(1, sch.tickets_per_day ?? 12)) / DEMO_SPEED;
    this.s.nextLaunchAt = now + per * (0.7 + Math.random() * 0.6);
    if (sch.business_hours_only) {
      const h = new Date(now).getHours();
      if (h < 8 || h >= 18) return;
    }
    const active = this.s.runs.filter((r) => r.state === 'running');
    if (active.length >= 3) return;
    const busy = new Set(active.flatMap((r) => packById(r.scenario_id)?.affected_nodes ?? []));
    const enabled = new Set((sch.enabled_clients ?? []).length ? sch.enabled_clients : [clientIdBySlug('salone-mutual')]);
    const recent = new Set(this.s.tickets.slice(-4).map((t) => t.pack_id));
    const candidates = PACKS.filter((p) => p.difficulty <= (sch.max_difficulty ?? 5) && enabled.has(clientIdBySlug(p.client)) && !p.affected_nodes.some((n) => busy.has(n)) && !recent.has(p.id) && !active.some((r) => r.scenario_id === p.id));
    // Weak skills from debriefs get scheduled first
    const assigned = new Set(this.s.debriefs.flatMap((d) => d.assigned_scenarios ?? []));
    const pick = candidates.find((p) => assigned.has(p.id)) ?? candidates[Math.floor(Math.random() * candidates.length)];
    if (pick) this.launch(pick.id, sch.exam_mode ? 'exam' : 'practice');
  }

  /** Simulated employees (GHOSTS-style) generate traffic; the result of each attempt drives the live map. */
  private ghostTraffic() {
    const lab = this.s.lab;
    const fs: typeof this.flowState = {};
    const recs: T.Flow[] = [];
    const add = (edge: string, bytes: number, app: string, allowed: boolean) => {
      const f = (fs[edge] ??= { bytes: 0, allowed: 0, denied: 0, top_app: app });
      if (allowed) {
        f.bytes += bytes;
        f.allowed += 1;
        if (bytes > 0 && (!f.top_app || bytes > f.bytes / 2)) f.top_app = app;
      } else f.denied += 1;
    };
    const jitter = (b: number) => b * (0.75 + Math.random() * 0.5);
    const swLink = (n: string) => `link:SW-ACC-01--${n}`;
    const trunk = 'link:FW01--SW-ACC-01';
    const rec = (edge: string, src: string, dst: string, port: number, app: string, bytes: number, verdict: 'allowed' | 'denied', proto: 'tcp' | 'udp' = 'tcp') =>
      recs.push({ edge_id: edge, src, dst, port, proto, app, bytes_per_s: Math.round(bytes), packets: Math.round(bytes / 900) + 1, verdict, source: verdict === 'denied' ? 'firewall' : 'zeek', observed_at: iso() });
    const attempt = (src: string, srcEdge: string, dstName: string, dstIp: string, port: number, app: string, bytes: number, byName?: string, proto: 'tcp' | 'udp' = 'tcp') => {
      if (lab.nodes[src].power !== 'running') return;
      if (byName && !resolveName(lab, src, byName).ok) return;
      const r = reach(lab, src, dstIp, port, proto);
      const srcIp = ipConfig(lab, src).ip;
      const cross = ipConfig(lab, src).vlan !== nodeByName(dstName)?.vlan;
      if (r.ok) {
        let b = jitter(bytes);
        if (dstName === 'FS01' && duplexMismatch(lab, 'Gi0/3')) b *= 0.06;
        add(srcEdge, b, app, true);
        if (lab.nodes[dstName]?.switchPort === undefined && LINKS.some((l) => l.id === swLink(dstName))) add(swLink(dstName), b, app, true);
        if (cross && srcEdge !== trunk) add(trunk, b, app, true);
        rec(srcEdge, srcIp, dstIp, port, app, b, 'allowed', proto);
      } else if (r.reason === 'filtered') {
        add(srcEdge, 0, app, false);
        add(trunk, 0, app, false);
        rec(trunk, srcIp, dstIp, port, app, 0, 'denied', proto);
      }
    };
    for (const ws of ['WS-FIN-02', 'WS-FIN-07', 'WS-OPS-03']) {
      if (ws === 'WS-FIN-07' && Math.random() < 0.5) continue;
      attempt(ws, swLink(ws), 'APP01', '10.10.30.20', 443, 'https', 180e3, 'salonepay');
      attempt(ws, swLink(ws), 'FS01', '10.10.30.15', 445, 'smb', 420e3, 'fs01');
      attempt(ws, swLink(ws), 'DC01', '10.10.10.10', 389, 'ldap', 12e3);
      attempt(ws, swLink(ws), 'DC01', '10.10.10.10', 53, 'dns', 3e3, undefined, 'udp');
    }
    // A legacy Finance report tool still tries to talk to the database directly.
    if (Math.random() < 0.35) attempt('WS-FIN-02', swLink('WS-FIN-02'), 'DB01', '10.10.40.10', 5432, 'postgres', 40e3);
    attempt('APP01', swLink('APP01'), 'DB01', '10.10.40.10', 5432, 'postgres', 620e3);
    const bkStale = (lab.nodes.BKP01.serviceCredVersion?.BackupAgent ?? 0) !== lab.ad.users['svc-backup'].passwordVersion;
    attempt('BKP01', swLink('BKP01'), 'FS01', '10.10.30.15', 445, 'smb', bkStale ? 4e3 : 2.4e6);
    if (bkStale) attempt('BKP01', swLink('BKP01'), 'DC01', '10.10.10.10', 88, 'kerberos', 9e3);
    for (const n of ['DC01', 'DC02', 'FS01', 'APP01', 'DB01', 'BKP01', 'WS-FIN-02', 'WS-OPS-03', 'FW01']) {
      if (lab.nodes[n].power === 'running' && lab.nodes.WAZUH01.power === 'running') {
        add(swLink('WAZUH01'), jitter(8e3), 'syslog', true);
        add(n === 'FW01' ? trunk : swLink(n), jitter(8e3), 'syslog', true);
      }
    }
    // Guest Wi-Fi noise blocked by the default deny
    if (Math.random() < 0.15) {
      evalFirewall(lab, '10.10.80.37', '10.10.10.10', 445, 'tcp');
      add(trunk, 0, 'smb', false);
      rec(trunk, '10.10.80.37', '10.10.10.10', 445, 'smb', 0, 'denied');
    }
    // Branch and cloud
    if (lab.nodes['WS-BO-01'].power === 'running' && isServiceUp(lab, 'APP01', 'nginx')) {
      const b = jitter(90e3);
      for (const e of ['link:BO-RTR01--WS-BO-01', 'link:FW01--BO-RTR01', trunk, swLink('APP01')]) add(e, b, 'https', true);
      rec('link:FW01--BO-RTR01', '10.20.20.31', '10.10.30.20', 443, 'https', b, 'allowed');
    }
    if (isServiceUp(lab, 'APP01', 'salonepay')) {
      const b = jitter(300e3);
      for (const e of ['link:FW01--AWS-ALB', 'link:AWS-ALB--AWS-APP', trunk]) add(e, b, 'postgres-repl', true);
      rec('link:FW01--AWS-ALB', '10.10.40.10', '10.30.10.20', 5432, 'postgres-repl', b, 'allowed');
    }
    for (const ws of ['KL-WS-01', 'KL-WS-02']) {
      const b = jitter(120e3);
      add(`link:KL-FW--${ws}`, b, 'https', true);
      add('link:KL-FW--KL-M365', b, 'https', true);
      rec(`link:KL-FW--${ws}`, ws === 'KL-WS-01' ? '10.50.20.11' : '10.50.20.12', '52.97.0.0 (M365)', 443, 'https', b, 'allowed');
    }
    for (const l of LINKS) fs[l.id] ??= { bytes: 0, allowed: 0, denied: 0, top_app: '' };
    this.flowState = fs;
    this.flowRecords = [...recs, ...this.flowRecords].slice(0, 400);
  }

  private healthTick() {
    for (const n of STATIC_NODES) {
      const h = nodeHealth(this.s.lab, n.name);
      if (this.lastHealth[n.name] !== h) {
        this.lastHealth[n.name] = h;
        const m = this.metrics(n.name);
        this.emit('node.health_changed', { kind: 'node', id: nodeId(n.name) }, { health: h, power: this.s.lab.nodes[n.name].power, cpu_pct: m.cpu_pct, ram_pct: m.ram_pct }, clientIdBySlug(n.client));
      }
    }
  }

  private metrics(name: string) {
    const seed = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
    const t = Date.now() / 60000;
    const h = nodeHealth(this.s.lab, name);
    const base = 18 + (seed % 30) + Math.sin(t / 7 + seed) * 6;
    return { cpu_pct: Math.round(h === 'down' ? 0 : Math.min(97, base + (h === 'degraded' ? 25 : 0))), ram_pct: Math.round(h === 'down' ? 0 : 40 + (seed % 35)), disk_pct: 30 + (seed % 50) };
  }

  // ---------------- consoles (mock transport) ----------------
  openConsole(nodeIdArg: string, ticketId?: string): MockConsole {
    const sn = nodeById(nodeIdArg);
    if (!sn) this.notFound('createConsoleSession', 'Node');
    const st = this.s.lab.nodes[sn.name];
    if (st.power !== 'running') throw new ApiRequestError(409, 'node_stopped', `${sn.name} is powered off. Start it first.`, 'createConsoleSession');
    const key = `${sn.name}:${ticketId ?? ''}`;
    const existing = this.consoles.get(key);
    if (existing) return existing;
    const shell = createShell(
      { lab: this.s.lab, node: sn.name, operator: OPERATOR.sam, changed: (what) => this.labChanged(sn.name, what, ticketId) },
      () => this.s.alerts.slice(-20).map((a) => ({ at: a.created_at, rule: a.rule, level: a.severity === 'P1' ? 12 : a.severity === 'P2' ? 10 : 7, agent: nodeById(a.node_id ?? '')?.name ?? '?' })),
    );
    if (!shell) throw new ApiRequestError(409, 'no_console', `${sn.name} has no interactive console`, 'createConsoleSession');
    const con: MockConsole = {
      node: sn.name,
      banner: () => shell.banner(),
      prompt: () => shell.prompt(),
      exec: (line: string) => {
        if (this.s.lab.nodes[sn.name].power !== 'running') return `Connection to ${sn.name} lost: host is powered off.`;
        const out = shell.exec(line).output;
        this.recordCommand(sn.name, line, out, ticketId);
        this.dirty = true;
        return out;
      },
    };
    this.consoles.set(key, con);
    return con;
  }

  private ticketsFor(node: string, ticketId?: string): TicketRec[] {
    if (ticketId) {
      const t = this.ticket(ticketId);
      return t && t.status !== 'closed' ? [t] : [];
    }
    const id = nodeId(node);
    return this.openTickets().filter((t) => (t.affected_node_ids ?? []).includes(id));
  }

  private recordCommand(node: string, command: string, output: string, ticketId?: string) {
    if (!command.trim()) return;
    for (const t of this.ticketsFor(node, ticketId)) {
      if (!t.first_command) t.first_command = command.trim();
      this.evidence(t.id, 'command', { node, command: command.trim(), output: output.slice(0, 2000) });
      (this.s.frames[t.id] ??= []).push({ seq: this.s.seq, type: 'ticket.updated', occurred_at: iso(), client_id: t.client_id, subject: { kind: 'ticket', id: t.id }, data: { command: command.trim(), node } });
    }
  }

  private labChanged(node: string, what: string, ticketId?: string) {
    for (const t of this.ticketsFor(node, ticketId)) {
      t.timeline.push({ at: iso(), kind: 'change', summary: `${node}: ${what}` });
      this.evidence(t.id, 'note', { node, change: what });
    }
    this.dirty = true;
    this.healthTick();
  }

  // ================= AegisApi =================
  getMe = () => this.net<T.Me>(() => ({ id: uuidFor('operator'), name: OPERATOR.name, email: 'operator@aegis.lab', roles: ['operator', 'admin'], on_call: !!this.s.settings.on_call, preferences: { theme: 'dark', default_client_id: clientIdBySlug('salone-mutual') } }));

  private clientOut(c: (typeof CLIENTS)[number]): T.Client {
    const nodes = STATIC_NODES.filter((n) => n.client === c.slug).map((n) => nodeHealth(this.s.lab, n.name));
    return { ...c, health_summary: { healthy: nodes.filter((h) => h === 'healthy').length, degraded: nodes.filter((h) => h === 'degraded').length, down: nodes.filter((h) => h === 'down').length, open_tickets: this.openTickets().filter((t) => t.client_id === c.id).length } };
  }
  listClients = () => this.net(() => CLIENTS.map((c) => this.clientOut(c)));
  getClient = (id: string) => this.net(() => this.clientOut(CLIENTS.find((c) => c.id === id) ?? this.notFound('getClient', 'Client')));

  private nodeOut(n: (typeof STATIC_NODES)[number]): T.Node {
    const lab = this.s.lab;
    const c = ipConfig(lab, n.name);
    return {
      id: nodeId(n.name), client_id: clientIdBySlug(n.client), site_id: SITES.find((s) => s.id === uuidFor(`site:${n.site}`))!.id, kind: n.kind, os: n.os, name: n.name, role: n.role,
      mgmt_ip: n.ip === 'dhcp' ? c.ip : n.ip, vlan: n.vlan, platform_ref: n.kind === 'cloud_resource' ? `aws:${n.name.toLowerCase()}` : `pve/qemu/${100 + STATIC_NODES.indexOf(n)}`,
      power: lab.nodes[n.name].power, health: nodeHealth(lab, n.name), consoles: n.consoles, tags: [...(n.tags ?? []), `x:${n.x}`, `y:${n.y}`],
    };
  }
  getTopology = (clientId?: string) =>
    this.net<T.Topology>(() => {
      const nodes = STATIC_NODES.filter((n) => !clientId || clientIdBySlug(n.client) === clientId).map((n) => this.nodeOut(n));
      const ids = new Set(nodes.map((n) => n.id));
      return {
        sites: SITES.filter((s) => !clientId || s.client_id === clientId).map(({ client_slug: _c, ...s }) => s),
        nodes,
        links: LINKS.filter((l) => ids.has(l.a_node_id) && ids.has(l.b_node_id)).map(({ a, b, ...l }) => ({ ...l, state: this.linkState(a, b) })),
        generated_at: iso(),
      };
    });
  private linkState(a: string, b: string): T.Link['state'] {
    const lab = this.s.lab;
    if (lab.nodes[a].power !== 'running' || lab.nodes[b].power !== 'running') return 'down';
    const port = lab.nodes[b].switchPort ?? (a === 'SW-ACC-01' ? Object.values(lab.switchPorts).find((p) => p.peer === b)?.name : undefined);
    if (port && lab.switchPorts[port]?.shutdown) return 'down';
    if (port && duplexMismatch(lab, port)) return 'degraded';
    if (b === 'WS-OPS-03' && ipConfig(lab, b).apipa) return 'degraded';
    return 'up';
  }
  getNode = (id: string) =>
    this.net<T.NodeDetail>(() => {
      const n = nodeById(id) ?? this.notFound('getNode', 'Node');
      const c = ipConfig(this.s.lab, n.name);
      return {
        ...this.nodeOut(n), specs: n.specs, ips: [c.ip], metrics: this.metrics(n.name),
        open_ticket_ids: this.openTickets().filter((t) => (t.affected_node_ids ?? []).includes(id)).map((t) => t.id),
        recent_alert_ids: this.s.alerts.filter((a) => a.node_id === id).slice(-5).map((a) => a.id),
        snapshots: (this.s.snapshots[n.name] ?? []).map(({ name, taken_at }) => ({ name, taken_at })),
      };
    });

  nodeAction = (id: string, body: T.NodeActionRequest) =>
    this.net<T.Job>(() => {
      const n = nodeById(id) ?? this.notFound('nodeAction', 'Node');
      if ((body.action === 'stop' || body.action === 'revert') && !body.confirm) throw new ApiRequestError(400, 'confirmation_required', `${body.action} needs confirm: true`, 'nodeAction');
      if (n.kind === 'cloud_resource' && n.os === 'cloud') throw new ApiRequestError(409, 'not_supported', `${n.name} is a managed cloud service`, 'nodeAction');
      const job = this.job('node.action', { kind: 'node', id });
      const st = this.s.lab.nodes[n.name];
      setTimeout(() => {
        const snaps = (this.s.snapshots[n.name] ??= []);
        switch (body.action) {
          case 'start':
            st.power = 'running';
            break;
          case 'stop':
            st.power = 'stopped';
            break;
          case 'reboot':
            if (st.dhcp && !st.staticIp) renewLease(this.s.lab, n.name);
            st.tokenStale = false;
            for (const k of Object.keys(st.services ?? {})) if (n.name !== 'DC01' || this.s.runs.every((r) => r.scenario_id !== 'svc-dc-outage-cascade' || r.state !== 'running')) st.services![k] = 'Running';
            break;
          case 'snapshot':
            snaps.push({ name: body.snapshot_name || `snap-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`, taken_at: iso(), state: structuredClone(st) });
            break;
          case 'revert': {
            const snap = snaps.find((s) => s.name === body.snapshot_name) ?? snaps.at(-1);
            if (!snap) return this.finishJob(job, {}, `${n.name} has no snapshots`);
            this.s.lab.nodes[n.name] = structuredClone(snap.state);
            break;
          }
        }
        for (const t of this.openTickets().filter((x) => (x.affected_node_ids ?? []).includes(id))) {
          this.evidence(t.id, 'node_action', { node: n.name, action: body.action, snapshot: body.snapshot_name });
          t.timeline.push({ at: iso(), kind: 'change', summary: `${n.name}: ${body.action}` });
        }
        this.consoles.forEach((c, k) => {
          if (k.startsWith(`${n.name}:`) && body.action !== 'snapshot') this.consoles.delete(k);
        });
        this.dirty = true;
        this.healthTick();
        this.finishJob(job, { node: n.name, action: body.action, power: this.s.lab.nodes[n.name].power });
      }, body.action === 'snapshot' ? 900 : 1800 + Math.random() * 1200);
      return job;
    });

  createConsoleSession = (id: string, protocol: T.ConsoleProtocol, ticketId?: string) =>
    this.net<T.ConsoleSession>(() => {
      this.openConsole(id, ticketId);
      return { id: uid(), protocol, tunnel_url: `mock://console/${id}${ticketId ? `?ticket=${ticketId}` : ''}`, token: uid(), expires_at: iso(Date.now() + 5 * 60e3) };
    });

  listNotifications = (q: { unread?: boolean; cursor?: string; limit?: number } = {}) =>
    this.net<T.NotificationPage>(() => {
      const all = [...this.s.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at)).filter((n) => !q.unread || !n.read);
      const start = q.cursor ? Number(q.cursor) : 0;
      const lim = q.limit ?? 50;
      return { items: all.slice(start, start + lim), next_cursor: start + lim < all.length ? String(start + lim) : null };
    });
  ackNotification = (id: string) =>
    this.net(() => {
      const n = this.s.notifications.find((x) => x.id === id) ?? this.notFound('ackNotification', 'Notification');
      n.read = true;
      this.dirty = true;
      return n;
    });

  private ticketOut(t: TicketRec): T.TicketDetail {
    const { pack_id: _p, run_id: _r, reopen_count: _rc, first_command: _f, explanation_attempts: _e, explanation_score: _es, closed_at: _c, resolution_note: _rn, verified_at: _v, ...out } = t;
    return structuredClone(out);
  }
  listTickets = (q: T.ListTicketsQuery = {}) =>
    this.net<T.TicketPage>(() => {
      const pr = { P1: 0, P2: 1, P3: 2, P4: 3 };
      const items = this.s.tickets
        .filter((t) => (!q.client_id || t.client_id === q.client_id) && (!q.status?.length || q.status.includes(t.status)) && (!q.priority?.length || q.priority.includes(t.priority)) && (q.sla_breached === undefined || !!t.sla_breached === q.sla_breached))
        .sort((a, b) => (a.status === 'closed') !== (b.status === 'closed') ? (a.status === 'closed' ? 1 : -1) : a.status === 'closed' ? b.updated_at!.localeCompare(a.updated_at!) : pr[a.priority] - pr[b.priority] || a.sla_due_at.localeCompare(b.sla_due_at))
        .map((t) => this.ticketOut(t));
      const start = q.cursor ? Number(q.cursor) : 0;
      const lim = q.limit ?? 50;
      return { items: items.slice(start, start + lim), next_cursor: start + lim < items.length ? String(start + lim) : null };
    });
  getTicket = (id: string) => this.net(() => this.ticketOut(this.ticket(id) ?? this.notFound('getTicket', 'Ticket')));

  updateTicket = (id: string, patch: T.TicketPatch) =>
    this.net(() => {
      const t = this.ticket(id) ?? this.notFound('updateTicket', 'Ticket');
      if (patch.status && patch.status !== t.status) {
        const allowed: Partial<Record<T.TicketStatus, T.TicketStatus[]>> = { new: ['acknowledged'], acknowledged: ['investigating'] };
        if (!allowed[t.status]?.includes(patch.status)) throw new ApiRequestError(409, 'invalid_transition', `Cannot move ${t.number} from ${label(t.status)} to ${label(patch.status)}. Use Resolve to run the checks.`, 'updateTicket');
        if (patch.status === 'acknowledged' && !t.assignee) t.assignee = OPERATOR.name;
        this.setStatus(t, patch.status);
      }
      if (patch.assignee !== undefined) t.assignee = patch.assignee;
      if (patch.add_work_note?.trim()) {
        const note = { id: uid(), author: OPERATOR.name, body: patch.add_work_note.trim(), created_at: iso() };
        t.work_notes.push(note);
        this.evidence(t.id, 'note', { work_note: note.body });
        t.timeline.push({ at: iso(), kind: 'note', summary: 'Work note added' });
      }
      t.updated_at = iso();
      this.emit('ticket.updated', { kind: 'ticket', id: t.id }, this.ticketData(t), t.client_id, t.id);
      return this.ticketOut(t);
    });

  resolveTicket = (id: string, resolutionNote: string) =>
    this.net<T.Job>(() => {
      const t = this.ticket(id) ?? this.notFound('resolveTicket', 'Ticket');
      if (t.status !== 'investigating' && t.status !== 'acknowledged') throw new ApiRequestError(409, 'invalid_transition', `${t.number} is ${label(t.status)}; only an open investigation can be resolved.`, 'resolveTicket');
      if (!t.work_notes.length) throw new ApiRequestError(409, 'work_notes_required', 'Add a work note describing what you found and changed before resolving.', 'resolveTicket');
      if ((resolutionNote ?? '').trim().length < 10) throw new ApiRequestError(400, 'validation_failed', 'Resolution note must be at least 10 characters.', 'resolveTicket');
      t.resolution_note = resolutionNote.trim();
      this.setStatus(t, 'pending_verification', 'checks running');
      const job = this.job('ticket.resolve', { kind: 'ticket', id });
      void this.runChecks(t, job);
      return job;
    });

  private async runChecks(t: TicketRec, job: T.Job) {
    const pack = this.packOf(t);
    const run = this.run(t.run_id);
    const fns = BEHAVIOURS[pack.id]?.checks ?? { documented: () => ({ passed: t.work_notes.length > 0, output: t.work_notes.length ? 'Work notes present' : 'No work notes' }) };
    for (const c of t.checks) c.passed = null;
    this.emit('ticket.updated', { kind: 'ticket', id: t.id }, this.ticketData(t), t.client_id, t.id);
    let allOk = true;
    for (const c of t.checks) {
      this.emit('check.result', { kind: 'ticket', id: t.id }, { ticket_id: t.id, check_id: c.check_id, label: c.label, passed: null }, t.client_id, t.id);
      await sleep(650 + Math.random() * 500);
      const res = fns[c.check_id]?.(this.s.lab, run?.ctx ?? { startedAt: t.created_at, identityChecks: [] }) ?? { passed: false, output: 'Check not implemented' };
      c.passed = res.passed;
      c.output = res.output;
      c.ran_at = iso();
      allOk &&= res.passed;
      this.evidence(t.id, 'check', { check_id: c.check_id, label: c.label, passed: res.passed, output: res.output });
      this.emit('check.result', { kind: 'ticket', id: t.id }, { ticket_id: t.id, check_id: c.check_id, label: c.label, passed: res.passed, output: res.output }, t.client_id, t.id);
    }
    if (!allOk) {
      t.reopen_count += 1;
      this.setStatus(t, 'investigating', 'a check failed, the ticket reopened');
      this.finishJob(job, { passed: false });
      this.dirty = true;
      return;
    }
    t.verified_at = iso();
    this.setStatus(t, 'verified', 'all checks passed');
    this.finishRun(t, 'resolved');
    this.finishJob(job, { passed: true });
    await sleep(900);
    const automated = (pack.persona?.traits ?? []).includes('automated') || pack.notification.persona === 'soc-bot';
    if (automated || pack.persona?.impostor) {
      if (pack.persona?.impostor) this.systemChat(t, 'The caller has gone quiet. The real Abu Bangura has been informed through his number on file. Security has been notified of the attempt.');
      this.startDebrief(t);
      return;
    }
    this.setStatus(t, 'client_explanation');
    const ask = (pack.persona?.traits ?? []).includes('formal') ? 'Thank you. For my audit file, please explain in plain terms what was wrong, what you changed, and how we know it will not recur.' : "Thanks, it's working now! So what was actually wrong? And is there anything I should do differently?";
    this.clientSay(t, ask, 1200);
  }

  private systemChat(t: TicketRec, body: string) {
    const m: T.ChatMessage = { id: uid(), ticket_id: t.id, author: 'system', channel: 'chat', body, created_at: iso() };
    (this.s.chat[t.id] ??= []).push(m);
    this.emit('chat.message', { kind: 'ticket', id: t.id }, { ...m }, t.client_id, t.id);
  }

  private clientSay(t: TicketRec, body: string, delay: number, attachments?: T.ChatMessage['attachments']) {
    this.emit('chat.typing', { kind: 'ticket', id: t.id }, { ticket_id: t.id, typing: true }, t.client_id);
    setTimeout(() => {
      const m: T.ChatMessage = { id: uid(), ticket_id: t.id, author: 'client', channel: this.s.chat[t.id]?.[0]?.channel ?? 'chat', body, attachments, created_at: iso() };
      (this.s.chat[t.id] ??= []).push(m);
      this.evidence(t.id, 'chat', { author: 'client', body, attachments });
      this.emit('chat.typing', { kind: 'ticket', id: t.id }, { ticket_id: t.id, typing: false }, t.client_id);
      this.emit('chat.message', { kind: 'ticket', id: t.id }, { ...m }, t.client_id, t.id);
    }, delay);
  }

  listChat = (ticketId: string) => this.net(() => structuredClone(this.s.chat[ticketId] ?? []));

  postChat = (ticketId: string, body: T.ChatPost) =>
    this.net(() => {
      const t = this.ticket(ticketId) ?? this.notFound('postChat', 'Ticket');
      if (!body.body?.trim()) throw new ApiRequestError(400, 'validation_failed', 'Message is empty', 'postChat');
      if (t.status === 'closed') throw new ApiRequestError(409, 'ticket_closed', 'This ticket is closed', 'postChat');
      const m: T.ChatMessage = { id: uid(), ticket_id: ticketId, author: 'operator', channel: body.channel ?? this.s.chat[ticketId]?.[0]?.channel ?? 'chat', body: body.body.trim(), created_at: iso() };
      (this.s.chat[ticketId] ??= []).push(m);
      this.evidence(ticketId, 'chat', { author: 'operator', body: m.body, intent: body.intent });
      this.emit('chat.message', { kind: 'ticket', id: ticketId }, { ...m }, t.client_id, ticketId);
      const pack = this.packOf(t);
      const run = this.run(t.run_id);
      if ((pack.persona?.traits ?? []).includes('automated')) return m;
      if (t.status === 'debrief') return m;
      const reply = personaRespond({ pack, status: t.status, message: m.body, lab: this.s.lab, run: run?.ctx ?? { startedAt: t.created_at, identityChecks: [] }, operator: OPERATOR.sam, explanationAttempts: t.explanation_attempts, sensitiveRequestSeen: isSensitiveRequest(pack) });
      if (reply.changed) this.labChanged(pack.affected_nodes[0], reply.changed, ticketId);
      const delay = 900 + Math.min(2600, reply.body.length * 18) + Math.random() * 600;
      this.clientSay(t, reply.body, delay, reply.attachments);
      if (reply.explanation && t.status === 'client_explanation') {
        t.explanation_attempts += 1;
        const score = Math.round(reply.explanation.clarity * 0.6 + reply.explanation.coverage * 100 * 0.4);
        this.evidence(ticketId, 'note', { explanation_score: score, jargon: reply.explanation.jargon, accepted: reply.explanation.accepted });
        if (reply.explanation.accepted) {
          t.explanation_score = Math.max(0, score - (t.explanation_attempts - 1) * 10);
          setTimeout(() => this.startDebrief(t), delay + 1500);
        }
      }
      this.dirty = true;
      return m;
    });

  verifyIdentity = (ticketId: string, body: T.IdentityVerificationRequest) =>
    this.net<T.IdentityVerificationResult>(() => {
      const t = this.ticket(ticketId) ?? this.notFound('verifyIdentity', 'Ticket');
      const pack = this.packOf(t);
      const run = this.run(t.run_id);
      run?.ctx.identityChecks.push({ method: body.method, at: iso() });
      const impostor = !!pack.persona?.impostor;
      const results: Record<string, [boolean, string]> = impostor
        ? {
            callback_known_number: [false, 'You called the number on file (ending 4417). The real Abu Bangura answered from the Freetown office: he is not travelling and did not ask for an MFA reset.'],
            manager_confirmation: [false, "The Managing Director confirms Abu Bangura is in today's 10:00 meeting in Freetown, not at an airport."],
            security_questions: [false, 'The caller could not answer the security questions and became hostile.'],
            in_person: [false, 'Not possible: the caller says they are abroad.'],
          }
        : {
            callback_known_number: [true, 'Callback to the number on file confirmed the requester.'],
            manager_confirmation: [true, "The requester's manager confirmed the request."],
            security_questions: [true, 'Security questions answered correctly.'],
            in_person: [true, 'Verified in person with staff ID.'],
          };
      const [verified, detail] = results[body.method] ?? [false, 'Unknown method'];
      this.evidence(ticketId, 'identity_check', { method: body.method, verified, detail, notes: body.notes });
      this.systemChat(t, `Identity check (${body.method.replace(/_/g, ' ')}): ${detail}`);
      return { verified, detail, recorded_at: iso() };
    });

  // ---------------- debrief ----------------
  private startDebrief(t: TicketRec) {
    if (t.status === 'closed' || this.s.debriefs.some((d) => d.ticket_id === t.id && d.state !== 'deferred')) return;
    const pack = this.packOf(t);
    const long = pack.difficulty >= 3 || t.priority === 'P1' || t.priority === 'P2';
    const qs = buildQuestions(pack, { ticketNumber: t.number, firstCommand: t.first_command, hintsUsed: t.hints_used ?? 0, long });
    const d: DebriefRec = { id: uid(), ticket_id: t.id, interviewer: INTERVIEWER_IDS[pack.debrief.interviewer] ?? 'hiring_manager', state: 'running', questions: qs, current_question_id: qs[0].id, overall_score: null, study_list: [], assigned_scenarios: [], answers: [], started_at: iso() };
    this.s.debriefs.push(d);
    t.debrief_id = d.id;
    this.setStatus(t, 'debrief');
    this.emit('debrief.started', { kind: 'debrief', id: d.id }, { debrief_id: d.id, ticket_id: t.id, interviewer: d.interviewer }, t.client_id, t.id);
    this.emit('debrief.question', { kind: 'debrief', id: d.id }, { debrief_id: d.id, question_id: qs[0].id, text: qs[0].text, depth: qs[0].depth, kind: qs[0].kind }, t.client_id, t.id);
  }

  private debriefOut(d: DebriefRec): T.Debrief {
    const { answers: _a, started_at: _s, scored_at: _sc, ...out } = d;
    return structuredClone(out);
  }
  getDebrief = (ticketId: string) =>
    this.net(() => {
      const d = [...this.s.debriefs].reverse().find((x) => x.ticket_id === ticketId) ?? this.notFound('getDebrief', 'Debrief');
      return this.debriefOut(d);
    });

  answerDebrief = (debriefId: string, questionId: string, answer: string) =>
    this.net(() => {
      const d = this.s.debriefs.find((x) => x.id === debriefId) ?? this.notFound('answerDebrief', 'Debrief');
      if (d.state !== 'running') throw new ApiRequestError(409, 'debrief_not_running', 'This debrief is not running', 'answerDebrief');
      if (d.current_question_id !== questionId) throw new ApiRequestError(409, 'wrong_question', 'Answer the current question', 'answerDebrief');
      if (!answer.trim()) throw new ApiRequestError(400, 'validation_failed', 'Answer is empty', 'answerDebrief');
      const t = this.ticket(d.ticket_id)!;
      const pack = this.packOf(t);
      const q = d.questions.find((x) => x.id === questionId)!;
      q.answer = answer.trim();
      q.score = scoreAnswer(pack, q, answer);
      d.answers.push(answer.trim());
      this.evidence(t.id, 'debrief_answer', { question: q.text, answer: q.answer, score: q.score.total });
      const idx = d.questions.indexOf(q);
      const next = d.questions[idx + 1];
      this.emit('debrief.scored', { kind: 'debrief', id: d.id }, { debrief_id: d.id, question_id: q.id, score: q.score.total, overall_score: null, final: false }, t.client_id, t.id);
      if (next) {
        d.current_question_id = next.id;
        setTimeout(() => this.emit('debrief.question', { kind: 'debrief', id: d.id }, { debrief_id: d.id, question_id: next.id, text: next.text, depth: next.depth, kind: next.kind }, t.client_id, t.id), 700);
      } else {
        d.current_question_id = null;
        d.state = 'scored';
        d.scored_at = iso();
        d.overall_score = Math.round(d.questions.reduce((a, x) => a + (x.score?.total ?? 0), 0) / d.questions.length);
        d.study_list = studyList(pack, d.answers);
        d.assigned_scenarios = PACKS.filter((p) => p.id !== pack.id && (p.debrief.must_cover.some((c) => d.study_list!.includes(c)) || (d.overall_score! < 70 && p.category === pack.category))).slice(0, 2).map((p) => p.id);
        t.closed_at = iso();
        this.setStatus(t, 'closed', `debrief scored ${d.overall_score}`);
        this.finishRun(t, 'resolved');
        BEHAVIOURS[pack.id]?.cleanup(this.s.lab);
        this.consoles.forEach((_c, k) => k.endsWith(`:${t.id}`) && this.consoles.delete(k));
        this.emit('debrief.scored', { kind: 'debrief', id: d.id }, { debrief_id: d.id, overall_score: d.overall_score, final: true }, t.client_id, t.id);
        this.healthTick();
      }
      this.dirty = true;
      return this.debriefOut(d);
    });

  deferDebrief = (debriefId: string) =>
    this.net(() => {
      const d = this.s.debriefs.find((x) => x.id === debriefId) ?? this.notFound('deferDebrief', 'Debrief');
      d.state = 'deferred';
      const t = this.ticket(d.ticket_id)!;
      t.timeline.push({ at: iso(), kind: 'debrief', summary: 'Debrief deferred to the next session' });
      this.evidence(t.id, 'note', { debrief: 'deferred' });
      this.dirty = true;
      return this.debriefOut(d);
    });

  // ---------------- scenarios ----------------
  listScenarios = (tags?: string[]) =>
    this.net<T.ScenarioSummary[]>(() =>
      PACKS.filter((p) => !tags?.length || tags.every((tg) => p.tags.includes(tg))).map((p) => ({ id: p.id, version: p.version, title: p.title, client_slug: p.client, tags: p.tags, difficulty: p.difficulty, priority: p.sla.priority, interviewer: p.debrief.interviewer, estimated_minutes: p.estimated_minutes })),
    );
  createScenarioRun = (body: T.ScenarioRunCreate) =>
    this.net<T.Job>(() => {
      const pack = packById(body.scenario_id) ?? this.notFound('createScenarioRun', 'Scenario');
      const active = this.s.runs.filter((r) => r.state === 'running');
      if (active.some((r) => r.scenario_id === pack.id)) throw new ApiRequestError(409, 'already_running', `${pack.title} is already running`, 'createScenarioRun');
      const clash = active.find((r) => packById(r.scenario_id)?.affected_nodes.some((n) => pack.affected_nodes.includes(n)));
      if (clash) throw new ApiRequestError(409, 'node_busy', `${pack.affected_nodes.join(', ')} ${pack.affected_nodes.length > 1 ? 'are' : 'is'} already part of a running scenario (${packById(clash.scenario_id)?.title}). Finish or abort it first.`, 'createScenarioRun');
      const job = this.job('scenario.launch', { kind: 'scenario_run', id: pack.id });
      setTimeout(() => {
        const { ticket, run } = this.launch(pack.id, body.mode);
        this.finishJob(job, { ticket_id: ticket.id, run_id: run.id });
      }, 700);
      return job;
    });
  getScenarioRun = (id: string) =>
    this.net(() => {
      const { ctx, ...r } = this.run(id) ?? this.notFound('getScenarioRun', 'Scenario run');
      return { ...r, alert_id: ctx.alertId, alert_verdict: ctx.alertVerdict as T.ScenarioRun['alert_verdict'], identity_checks: ctx.identityChecks as NonNullable<T.ScenarioRun['identity_checks']> };
    });
  takeHint = (runId: string) =>
    this.net<T.Hint>(() => {
      const run = this.run(runId) ?? this.notFound('takeHint', 'Scenario run');
      if (run.mode === 'exam') throw new ApiRequestError(409, 'exam_mode', 'Hints are disabled in exam mode', 'takeHint');
      const pack = packById(run.scenario_id)!;
      if (run.hints_used >= pack.hints.length) throw new ApiRequestError(409, 'no_more_hints', 'No more hints for this scenario', 'takeHint');
      run.hints_used += 1;
      const t = this.ticket(run.ticket_id!)!;
      t.hints_used = run.hints_used;
      const cost = 5 * run.hints_used;
      this.evidence(t.id, 'hint', { rung: run.hints_used, cost });
      t.timeline.push({ at: iso(), kind: 'hint', summary: `Hint ${run.hints_used} taken (-${cost} points)` });
      this.emit('ticket.updated', { kind: 'ticket', id: t.id }, this.ticketData(t), t.client_id, t.id);
      return { rung: run.hints_used, text: pack.hints[run.hints_used - 1], points_cost: cost, remaining: pack.hints.length - run.hints_used };
    });
  abortScenarioRun = (runId: string) =>
    this.net<T.Job>(() => {
      const run = this.run(runId) ?? this.notFound('abortScenarioRun', 'Scenario run');
      const job = this.job('scenario.abort', { kind: 'scenario_run', id: runId });
      setTimeout(() => {
        BEHAVIOURS[run.scenario_id]?.cleanup(this.s.lab);
        const t = run.ticket_id ? this.ticket(run.ticket_id) : undefined;
        if (t && t.status !== 'closed') {
          this.finishRun(t, 'aborted');
          t.closed_at = iso();
          this.setStatus(t, 'closed', 'scenario aborted, baseline restored');
        }
        this.healthTick();
        this.finishJob(job, { run_id: runId });
      }, 1200);
      return job;
    });

  // ---------------- SOC ----------------
  private alertOut(a: AlertRec): T.Alert {
    const { truth: _t, rationale: _r, run_id: _ru, ...out } = a;
    return structuredClone(out);
  }
  listAlerts = (q: { state?: T.AlertState[] } = {}) =>
    this.net<T.AlertPage>(() => ({ items: [...this.s.alerts].filter((a) => !q.state?.length || q.state.includes(a.state)).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((a) => this.alertOut(a)), next_cursor: null }));
  claimAlert = (id: string) =>
    this.net(() => {
      const a = this.s.alerts.find((x) => x.id === id) ?? this.notFound('claimAlert', 'Alert');
      if (a.claimed_by && a.claimed_by !== OPERATOR.name) throw new ApiRequestError(409, 'already_claimed', `Claimed by ${a.claimed_by}`, 'claimAlert');
      a.claimed_by = OPERATOR.name;
      if (a.state === 'new') a.state = 'claimed';
      if (a.linked_ticket_id) this.evidence(a.linked_ticket_id, 'note', { alert: a.rule, claimed: true });
      this.emit('alert.updated', { kind: 'alert', id }, { id, rule: a.rule, severity: a.severity, node_id: a.node_id, state: a.state }, a.client_id, a.linked_ticket_id);
      this.dirty = true;
      return this.alertOut(a);
    });
  classifyAlert = (id: string, body: T.AlertClassification) =>
    this.net(() => {
      const a = this.s.alerts.find((x) => x.id === id) ?? this.notFound('classifyAlert', 'Alert');
      if (!a.claimed_by) throw new ApiRequestError(409, 'not_claimed', 'Claim the alert before classifying it', 'classifyAlert');
      if ((body.rationale ?? '').trim().length < 10) throw new ApiRequestError(400, 'validation_failed', 'Write a rationale of at least 10 characters', 'classifyAlert');
      a.state = 'classified';
      a.verdict = body.verdict;
      a.rationale = body.rationale;
      const correct = body.verdict === a.truth;
      if (a.run_id) {
        const run = this.run(a.run_id);
        if (run) run.ctx.alertVerdict = body.verdict;
      }
      if (a.linked_ticket_id) this.evidence(a.linked_ticket_id, 'note', { alert: a.rule, verdict: body.verdict, rationale: body.rationale, matches_ground_truth: correct });
      if (body.open_ticket && !a.linked_ticket_id) {
        const tId = uid();
        const prefix = 'SM';
        const t: TicketRec = {
          id: tId, client_id: a.client_id, number: `${prefix}-${++this.s.counters['salone-mutual']}`, title: `Investigate: ${a.rule}`, priority: a.severity, status: 'acknowledged', category: 'security', assignee: OPERATOR.name,
          affected_node_ids: a.node_id ? [a.node_id] : [], tags: ['soc'], sla_due_at: iso(Date.now() + (a.severity === 'P1' ? 3.6e6 : 4 * 3.6e6)), sla_breached: false, created_at: iso(), updated_at: iso(),
          description: `${a.rule} (${a.attack_technique}). ${Object.entries(a.fields ?? {}).map(([k, v]) => `${k}: ${v}`).join('; ')}`,
          persona: { id: uuidFor('persona:soc-bot'), client_id: a.client_id, name: 'Wazuh SIEM', role: 'Automated alert', traits: ['automated'], avatar_initials: 'WS' },
          work_notes: [], checks: [{ id: uid(), check_id: 'documented', label: 'Investigation documented in work notes', passed: null }], hints_used: 0, hints_available: 3, mode: 'practice',
          timeline: [{ at: iso(), kind: 'created', summary: 'Opened from the SOC queue' }], pack_id: 'soc-alert-investigation', run_id: null, reopen_count: 0, explanation_attempts: 0,
        };
        this.s.tickets.push(t);
        a.linked_ticket_id = tId;
        this.s.chat[tId] = [{ id: uid(), ticket_id: tId, author: 'system', channel: 'chat', body: t.description!, created_at: iso() }];
        this.evidence(tId, 'status_change', { from: null, to: 'acknowledged', alert_id: a.id });
        this.emit('ticket.created', { kind: 'ticket', id: tId }, this.ticketData(t), t.client_id, tId);
      }
      (this.s.counters.triage_total = (this.s.counters.triage_total ?? 0) + 1), (this.s.counters.triage_correct = (this.s.counters.triage_correct ?? 0) + (correct ? 1 : 0));
      this.emit('alert.updated', { kind: 'alert', id }, { id, rule: a.rule, severity: a.severity, node_id: a.node_id, state: a.state, verdict: a.verdict }, a.client_id, a.linked_ticket_id);
      this.dirty = true;
      return this.alertOut(a);
    });

  // ---------------- evidence, scores ----------------
  listEvidence = (ticketId: string) => this.net(() => structuredClone(this.s.evidence[ticketId] ?? []));

  getScorecards = () =>
    this.net<T.Scorecards>(() => {
      const closed = this.s.tickets.filter((t) => t.status === 'closed' && t.verified_at);
      const mttr = closed.map((t) => (Date.parse(t.verified_at!) - Date.parse(t.created_at)) / 60e3);
      const scored = this.s.debriefs.filter((d) => d.state === 'scored' && d.overall_score != null);
      const controls = this.controls();
      const fam = new Map<string, { family: string; nist_csf: string; passed: number; total: number }>();
      for (const c of controls) {
        const f = fam.get(c.family) ?? { family: c.family, nist_csf: NIST[c.family] ?? 'Protect', passed: 0, total: 0 };
        f.total++;
        f.passed += c.passed ? 1 : 0;
        fam.set(c.family, f);
      }
      const liveWeek = weekLabel(new Date());
      const trend = [...this.s.trend];
      const thisWeek = closed.filter((t) => weekLabel(new Date(t.created_at)) === liveWeek);
      if (thisWeek.length) {
        const ds = thisWeek.map((t) => this.s.debriefs.find((d) => d.id === t.debrief_id)?.overall_score ?? 0);
        const w = { week: liveWeek, sla_met_pct: Math.round((thisWeek.filter((t) => !t.sla_breached).length / thisWeek.length) * 100), mttr_minutes: Math.round(thisWeek.reduce((a, t) => a + (Date.parse(t.verified_at!) - Date.parse(t.created_at)) / 60e3, 0) / thisWeek.length), avg_debrief_score: Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) };
        const i = trend.findIndex((x) => x.week === liveWeek);
        if (i >= 0) trend[i] = w;
        else trend.push(w);
      }
      return {
        operator: {
          tickets_closed: closed.length,
          sla_met_pct: closed.length ? Math.round((closed.filter((t) => !t.sla_breached).length / closed.length) * 100) : 0,
          mttr_minutes: mttr.length ? Math.round(mttr.reduce((a, b) => a + b, 0) / mttr.length) : 0,
          reopen_rate_pct: closed.length ? Math.round((closed.filter((t) => t.reopen_count > 0).length / closed.length) * 100) : 0,
          avg_debrief_score: scored.length ? Math.round(scored.reduce((a, d) => a + d.overall_score!, 0) / scored.length) : 0,
          hints_per_ticket: closed.length ? Math.round((closed.reduce((a, t) => a + (t.hints_used ?? 0), 0) / closed.length) * 10) / 10 : 0,
          trend,
        },
        control: { pass_pct: Math.round((controls.filter((c) => c.passed).length / controls.length) * 100), families: [...fam.values()] },
        generated_at: iso(),
      };
    });

  listSkills = () =>
    this.net<T.SkillScore[]>(() => {
      const closed = this.s.tickets.filter((t) => t.status === 'closed' && t.verified_at);
      return SKILLS.map((sk) => {
        let ev: TicketRec[];
        let avg: number;
        if (sk.packs[0] === '*explain') {
          ev = closed.filter((t) => t.explanation_score != null);
          avg = ev.length ? ev.reduce((a, t) => a + (t.explanation_score ?? 0), 0) / ev.length : 0;
        } else if (sk.packs[0] === '*debrief') {
          ev = closed.filter((t) => t.debrief_id);
          const ds = this.s.debriefs.filter((d) => d.state === 'scored');
          avg = ds.length ? ds.reduce((a, d) => a + (d.overall_score ?? 0), 0) / ds.length : 0;
        } else {
          ev = closed.filter((t) => sk.packs.includes(t.pack_id));
          const ds = ev.map((t) => this.s.debriefs.find((d) => d.id === t.debrief_id)?.overall_score ?? 0);
          avg = ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 0;
        }
        if (sk.skill === 'Alert triage') {
          const tot = this.s.counters.triage_total ?? 0;
          if (tot) avg = (avg + ((this.s.counters.triage_correct ?? 0) / tot) * 100) / (ev.length ? 2 : 1);
        }
        const level = !ev.length ? (sk.packs.length ? 1 : 0) : Math.min(5, 1 + Math.floor(ev.length / 2) + (avg >= 80 ? 2 : avg >= 65 ? 1 : 0));
        return { skill: sk.skill, domain: sk.domain, frameworks: sk.frameworks, level, evidence_ids: ev.map((t) => t.id), updated_at: ev.at(-1)?.closed_at ?? iso() };
      });
    });

  private controls(): T.ControlResult[] {
    const lab = this.s.lab;
    const now = iso();
    const r1 = reach(lab, 'WS-FIN-07', '10.10.40.10', 5432);
    const guest = evalFirewall(lab, '10.10.80.37', '10.10.10.10', 445);
    const admin = evalFirewall(lab, '10.10.20.52', '10.10.10.1', 22);
    const egress = evalFirewall(lab, '10.10.40.10', '142.250.200.4', 443);
    const finOk = Object.values(lab.ad.users).filter((u) => u.groups.includes('GG-Finance')).every((u) => /OU=Finance/.test(u.ou));
    const broad = lab.fwRules.find((r) => r.enabled && r.descr.startsWith('TEMP'));
    const bkOk = (lab.nodes.BKP01.serviceCredVersion?.BackupAgent ?? 0) === lab.ad.users['svc-backup'].passwordVersion;
    const dcs = isServiceUp(lab, 'DC01', 'DNS') && isServiceUp(lab, 'DC02', 'DNS');
    const c = (id: string, control: string, family: string, attempt: string, expected: string, passed: boolean, evidence: string): T.ControlResult => ({ id, control, family, attempt, expected, passed, evidence, ran_at: now });
    return [
      c('CV-01', 'Network segmentation', 'Network', 'Corporate client opens DB01:5432', 'Blocked and logged', !r1.ok && r1.reason === 'filtered', r1.ok ? 'Connection succeeded' : `Blocked (${r1.reason}) by rule ${r1.verdict?.rule.id ?? '-'}`),
      c('CV-02', 'Guest isolation', 'Network', 'Guest host 10.10.80.37 to DC01:445', 'Blocked', guest.action === 'block', `${guest.action} by rule ${guest.rule.id}`),
      c('CV-03', 'Admin path', 'Network', 'User VLAN to FW01 SSH', 'Refused except from jump host', admin.action === 'block', `${admin.action} by rule ${admin.rule.id}`),
      c('CV-04', 'MFA for privileged access', 'Identity', 'Tier 1 admin sign-in without second factor', 'Denied', !!lab.ad.users['adm-jkamara']?.mfaRequired, lab.ad.users['adm-jkamara']?.mfaRequired ? 'MFA enforced for adm-jkamara' : 'MFA not enforced'),
      c('CV-05', 'Least privilege', 'Identity', 'GG-Finance members outside OU=Finance', 'None', finOk, finOk ? 'All GG-Finance members are Finance staff' : 'A non-Finance account is in GG-Finance'),
      c('CV-06', 'IaC guardrails', 'Platform', 'PR adds 0.0.0.0/0 on port 22', 'CI blocks the merge', true, 'OPA policy deny-open-admin-ports blocked the test PR'),
      c('CV-07', 'Change control', 'Platform', 'Firewall rule without an approved change', 'Detected within one cycle', !broad, broad ? `Rule ${broad.id} "${broad.descr}" has no approved change` : 'No unapproved rules in the running config'),
      c('CV-08', 'Lateral movement', 'Endpoint', 'Workstation to workstation SMB', 'Blocked by host firewall', true, 'Windows Firewall blocked 445 between WS-FIN-02 and WS-OPS-03'),
      c('CV-09', 'Egress control', 'Network', 'DB01 to the internet on 443', 'Blocked', egress.action === 'block', `${egress.action} by rule ${egress.rule.id}`),
      c('CV-10', 'Backup integrity', 'Recover', 'Nightly backup job authenticates and completes', 'Succeeds', bkOk, bkOk ? 'BackupAgent authenticated; last job completed' : 'BackupAgent failing to authenticate as svc-backup'),
      c('CV-11', 'Identity redundancy', 'Recover', 'Both domain controllers answer DNS', 'Both up', dcs, dcs ? 'DC01 and DC02 healthy' : 'At least one DC is down: single point of failure'),
    ];
  }
  listControlResults = () => this.net(() => this.controls());

  listFlows = (edgeId: string) => this.net(() => this.flowRecords.filter((f) => f.edge_id === edgeId).slice(0, 50));
  /** Live flow snapshot for the map (mock only; live mode uses flow.batch events). */
  flowSnapshot() {
    return this.flowState;
  }

  getReplay = (ticketId: string) =>
    this.net<T.ReplayTimeline>(() => {
      const t = this.ticket(ticketId) ?? this.notFound('getReplay', 'Ticket');
      let frames: unknown[] = this.s.frames[ticketId] ?? [];
      if (!frames.some((f) => (f as T.AegisEvent).type !== 'flow.batch')) {
        // Nothing streamed yet (ticket seeded before this session): rebuild from the evidence trail.
        frames = (this.s.evidence[ticketId] ?? []).map((r, k) => ({
          seq: k + 1, occurred_at: r.created_at, client_id: t.client_id, subject: { kind: 'ticket' as const, id: ticketId },
          type: r.kind === 'status_change' ? 'ticket.status_changed' : r.kind === 'chat' ? 'chat.message' : r.kind === 'check' ? 'check.result' : r.kind === 'debrief_answer' ? 'debrief.scored' : 'ticket.updated',
          data: r.kind === 'chat' ? { id: uid(), ticket_id: ticketId, author: r.payload.author, channel: 'chat', body: r.payload.body } : r.kind === 'status_change' ? { from: r.payload.from, to: r.payload.to } : r.kind === 'command' ? { command: r.payload.command, node: r.payload.node } : r.payload,
        }));
      }
      return { ticket_id: ticketId, started_at: t.created_at, ended_at: t.closed_at ?? iso(), frames: structuredClone(frames) as unknown as Record<string, unknown>[] };
    });

  restoreBaseline = (token: string) =>
    this.net<T.Job>(() => {
      if (token !== 'RESTORE') throw new ApiRequestError(400, 'confirmation_required', 'Type RESTORE to confirm', 'restoreBaseline');
      const job = this.job('baseline.restore', { kind: 'client', id: clientIdBySlug('salone-mutual') });
      setTimeout(() => {
        restoreAllBaselines(this.s.lab);
        const fresh = initialLab();
        this.s.lab.switchPorts = fresh.switchPorts;
        for (const n of Object.keys(this.s.lab.nodes)) this.s.lab.nodes[n].power = 'running';
        for (const r of this.s.runs.filter((x) => x.state === 'running')) {
          const t = r.ticket_id ? this.ticket(r.ticket_id) : undefined;
          if (t && t.status !== 'closed') {
            this.finishRun(t, 'aborted');
            t.closed_at = iso();
            this.setStatus(t, 'closed', 'baseline restored');
          }
        }
        this.consoles.clear();
        this.healthTick();
        this.finishJob(job, {});
      }, 2500);
      return job;
    });

  getSettings = () => this.net(() => structuredClone(this.s.settings));
  putSettings = (st: T.Settings) =>
    this.net(() => {
      this.s.settings = structuredClone(st);
      if (st.schedule?.enabled) this.s.nextLaunchAt = Math.min(this.s.nextLaunchAt, Date.now() + 60_000);
      this.dirty = true;
      return structuredClone(this.s.settings);
    });

  /** Mock-only: launch the next scheduled ticket now (Settings > Send the next ticket now). */
  triggerNow() {
    this.s.nextLaunchAt = 0;
    this.scheduler(Date.now());
  }
  nextLaunchAt() {
    return this.s.nextLaunchAt;
  }
  /** Mock-only: health of DNS/logon used by the status strip. */
  coreServices() {
    return { logon: anyLogonServer(this.s.lab) };
  }
}

const NIST: Record<string, string> = { Network: 'Protect', Identity: 'Protect', Platform: 'Govern', Endpoint: 'Detect', Recover: 'Recover' };

function label(s: T.TicketStatus | string): string {
  return String(s).replace(/_/g, ' ');
}

function weekLabel(d: Date): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((x.getTime() - y0.getTime()) / 8.64e7 + 1) / 7);
  return `${x.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

export { GLOSSARY };
