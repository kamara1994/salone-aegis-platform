// Friendly aliases over the types generated from contracts/openapi.yaml.
// Regenerate with `npm run gen:api` whenever the contract changes. Never hand-edit schema.d.ts.
import type { components } from './schema';

type S = components['schemas'];

export type Me = S['Me'];
export type Role = S['Role'];
export type Client = S['Client'];
export type Sector = S['Sector'];
export type Site = S['Site'];
export type Node = S['Node'];
export type NodeDetail = S['NodeDetail'];
export type NodeKind = S['NodeKind'];
export type OsFamily = S['OsFamily'];
export type Health = S['Health'];
export type Link = S['Link'];
export type Topology = S['Topology'];
export type Flow = S['Flow'];
export type NodeActionRequest = S['NodeActionRequest'];
export type ConsoleProtocol = S['ConsoleProtocol'];
export type ConsoleSession = S['ConsoleSession'];
export type Job = S['Job'];
export type Subject = S['Subject'];
export type Notification = S['Notification'];
export type NotificationPage = S['NotificationPage'];
export type Priority = S['Priority'];
export type TicketStatus = S['TicketStatus'];
export type Ticket = S['Ticket'];
export type TicketPage = S['TicketPage'];
export type TicketDetail = S['TicketDetail'];
export type TicketPatch = S['TicketPatch'];
export type WorkNote = S['WorkNote'];
export type Persona = S['Persona'];
export type ChatMessage = S['ChatMessage'];
export type ChatPost = S['ChatPost'];
export type IdentityVerificationRequest = S['IdentityVerificationRequest'];
export type IdentityVerificationResult = S['IdentityVerificationResult'];
export type ScenarioSummary = S['ScenarioSummary'];
export type ScenarioRun = S['ScenarioRun'];
export type ScenarioRunCreate = S['ScenarioRunCreate'];
export type ScenarioMode = S['ScenarioMode'];
export type Hint = S['Hint'];
export type CheckResult = S['CheckResult'];
export type Debrief = S['Debrief'];
export type DebriefQuestion = S['DebriefQuestion'];
export type AnswerScore = S['AnswerScore'];
export type Alert = S['Alert'];
export type AlertPage = S['AlertPage'];
export type AlertState = S['AlertState'];
export type AlertVerdict = S['AlertVerdict'];
export type AlertClassification = S['AlertClassification'];
export type EvidenceRecord = S['EvidenceRecord'];
export type Scorecards = S['Scorecards'];
export type SkillScore = S['SkillScore'];
export type ControlResult = S['ControlResult'];
export type ReplayTimeline = S['ReplayTimeline'];
export type Settings = S['Settings'];
export type ApiError = S['Error'];

/** Contract 3 envelope (contracts/events.schema.json). */
export type EventType =
  | 'notification.created'
  | 'ticket.created'
  | 'ticket.updated'
  | 'ticket.status_changed'
  | 'chat.message'
  | 'chat.typing'
  | 'scenario.state_changed'
  | 'check.result'
  | 'node.health_changed'
  | 'flow.batch'
  | 'alert.fired'
  | 'alert.updated'
  | 'debrief.started'
  | 'debrief.question'
  | 'debrief.scored'
  | 'job.completed'
  | 'job.failed';

export interface AegisEvent<T = Record<string, unknown>> {
  seq: number;
  type: EventType;
  occurred_at: string;
  client_id?: string | null;
  subject: { kind: Subject['kind']; id: string };
  data: T;
}

export interface FlowBatchData {
  window_s: number;
  edges: { edge_id: string; bytes_per_s: number; allowed: number; denied: number; top_app?: string }[];
}

export const TICKET_FLOW: TicketStatus[] = [
  'new',
  'acknowledged',
  'investigating',
  'pending_verification',
  'verified',
  'client_explanation',
  'debrief',
  'closed',
];

export interface ListTicketsQuery {
  client_id?: string;
  status?: TicketStatus[];
  priority?: Priority[];
  sla_breached?: boolean;
  cursor?: string;
  limit?: number;
}
