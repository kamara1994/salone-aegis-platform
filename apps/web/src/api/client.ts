// One interface, two implementations: `live` speaks the real REST contract,
// `mock` runs the built-in simulated lab in the browser. Screens only ever see AegisApi.
import type * as T from './types';

export interface AegisApi {
  readonly mode: 'live' | 'mock';
  getMe(): Promise<T.Me>;
  listClients(): Promise<T.Client[]>;
  getClient(id: string): Promise<T.Client>;
  getTopology(clientId?: string): Promise<T.Topology>;
  getNode(id: string): Promise<T.NodeDetail>;
  nodeAction(id: string, body: T.NodeActionRequest): Promise<T.Job>;
  createConsoleSession(id: string, protocol: T.ConsoleProtocol, ticketId?: string): Promise<T.ConsoleSession>;
  listNotifications(q?: { unread?: boolean; cursor?: string; limit?: number }): Promise<T.NotificationPage>;
  ackNotification(id: string): Promise<T.Notification>;
  listTickets(q?: T.ListTicketsQuery): Promise<T.TicketPage>;
  getTicket(id: string): Promise<T.TicketDetail>;
  updateTicket(id: string, patch: T.TicketPatch): Promise<T.TicketDetail>;
  resolveTicket(id: string, resolutionNote: string): Promise<T.Job>;
  listChat(ticketId: string): Promise<T.ChatMessage[]>;
  postChat(ticketId: string, body: T.ChatPost): Promise<T.ChatMessage>;
  verifyIdentity(ticketId: string, body: T.IdentityVerificationRequest): Promise<T.IdentityVerificationResult>;
  getDebrief(ticketId: string): Promise<T.Debrief>;
  answerDebrief(debriefId: string, questionId: string, answer: string): Promise<T.Debrief>;
  deferDebrief(debriefId: string): Promise<T.Debrief>;
  listScenarios(tags?: string[]): Promise<T.ScenarioSummary[]>;
  createScenarioRun(body: T.ScenarioRunCreate): Promise<T.Job>;
  getScenarioRun(id: string): Promise<T.ScenarioRun>;
  takeHint(runId: string): Promise<T.Hint>;
  abortScenarioRun(runId: string): Promise<T.Job>;
  listAlerts(q?: { state?: T.AlertState[] }): Promise<T.AlertPage>;
  claimAlert(id: string): Promise<T.Alert>;
  classifyAlert(id: string, body: T.AlertClassification): Promise<T.Alert>;
  listEvidence(ticketId: string): Promise<T.EvidenceRecord[]>;
  getScorecards(): Promise<T.Scorecards>;
  listSkills(): Promise<T.SkillScore[]>;
  listControlResults(): Promise<T.ControlResult[]>;
  listFlows(edgeId: string, since?: string): Promise<T.Flow[]>;
  getReplay(ticketId: string): Promise<T.ReplayTimeline>;
  restoreBaseline(confirmationToken: string, clientId?: string): Promise<T.Job>;
  getSettings(): Promise<T.Settings>;
  putSettings(s: T.Settings): Promise<T.Settings>;
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public operation: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type TokenSource = () => Promise<string | null>;

function qs(params: Record<string, unknown>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

function idem(): string {
  return crypto.randomUUID();
}

function unwrapItems<R>(value: R[] | { items: R[] }): R[] {
  return Array.isArray(value) ? value : value.items;
}

export class LiveApi implements AegisApi {
  readonly mode = 'live' as const;
  constructor(
    private base: string,
    private token: TokenSource,
  ) {}

  private async req<R>(op: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<R> {
    const t = await this.token();
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(t ? { Authorization: `Bearer ${t}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let code = 'http_error';
      let message = `${method} ${path} failed with ${res.status}`;
      let details: Record<string, unknown> | undefined;
      try {
        const e = (await res.json()) as T.ApiError;
        code = e.error.code;
        message = e.error.message;
        details = e.error.details as Record<string, unknown> | undefined;
      } catch {
        /* non-JSON error body */
      }
      throw new ApiRequestError(res.status, code, message, op, details);
    }
    if (res.status === 204) return undefined as R;
    return (await res.json()) as R;
  }

  getMe = () => this.req<T.Me>('getMe', 'GET', '/me');
  listClients = () => this.req<T.Client[] | { items: T.Client[] }>('listClients', 'GET', '/clients').then(unwrapItems);
  getClient = (id: string) => this.req<T.Client>('getClient', 'GET', `/clients/${id}`);
  getTopology = (clientId?: string) => this.req<T.Topology>('getTopology', 'GET', `/topology${qs({ client_id: clientId })}`);
  getNode = (id: string) => this.req<T.NodeDetail>('getNode', 'GET', `/nodes/${id}`);
  nodeAction = (id: string, body: T.NodeActionRequest) =>
    this.req<T.Job>('nodeAction', 'POST', `/nodes/${id}/actions`, body, { 'Idempotency-Key': idem() });
  createConsoleSession = (id: string, protocol: T.ConsoleProtocol, ticketId?: string) =>
    this.req<T.ConsoleSession>('createConsoleSession', 'POST', `/nodes/${id}/console-sessions`, { protocol, ticket_id: ticketId });
  listNotifications = (q: { unread?: boolean; cursor?: string; limit?: number } = {}) =>
    this.req<T.NotificationPage>('listNotifications', 'GET', `/notifications${qs(q)}`);
  ackNotification = (id: string) => this.req<T.Notification>('ackNotification', 'POST', `/notifications/${id}/ack`);
  listTickets = (q: T.ListTicketsQuery = {}) => this.req<T.TicketPage>('listTickets', 'GET', `/tickets${qs({ ...q })}`);
  getTicket = (id: string) => this.req<T.TicketDetail>('getTicket', 'GET', `/tickets/${id}`);
  updateTicket = (id: string, patch: T.TicketPatch) => this.req<T.TicketDetail>('updateTicket', 'PATCH', `/tickets/${id}`, patch);
  resolveTicket = (id: string, resolutionNote: string) =>
    this.req<T.Job>('resolveTicket', 'POST', `/tickets/${id}/resolve`, { resolution_note: resolutionNote }, { 'Idempotency-Key': idem() });
  listChat = (ticketId: string) => this.req<T.ChatMessage[] | { items: T.ChatMessage[] }>('listChat', 'GET', `/tickets/${ticketId}/chat`).then(unwrapItems);
  postChat = (ticketId: string, body: T.ChatPost) => this.req<T.ChatMessage>('postChat', 'POST', `/tickets/${ticketId}/chat`, body);
  verifyIdentity = (ticketId: string, body: T.IdentityVerificationRequest) =>
    this.req<T.IdentityVerificationResult>('verifyIdentity', 'POST', `/tickets/${ticketId}/chat/verify-identity`, body);
  getDebrief = (ticketId: string) => this.req<T.Debrief>('getDebrief', 'GET', `/tickets/${ticketId}/debrief`);
  answerDebrief = (debriefId: string, questionId: string, answer: string) =>
    this.req<T.Debrief>('answerDebrief', 'POST', `/debriefs/${debriefId}/answers`, { question_id: questionId, answer });
  deferDebrief = (debriefId: string) => this.req<T.Debrief>('deferDebrief', 'POST', `/debriefs/${debriefId}/defer`);
  listScenarios = (tags?: string[]) => this.req<T.ScenarioSummary[] | { items: T.ScenarioSummary[] }>('listScenarios', 'GET', `/scenarios${qs({ tag: tags })}`).then(unwrapItems);
  createScenarioRun = (body: T.ScenarioRunCreate) =>
    this.req<T.Job>('createScenarioRun', 'POST', '/scenario-runs', body, { 'Idempotency-Key': idem() });
  getScenarioRun = (id: string) => this.req<T.ScenarioRun>('getScenarioRun', 'GET', `/scenario-runs/${id}`);
  takeHint = (runId: string) => this.req<T.Hint>('takeHint', 'POST', `/scenario-runs/${runId}/hint`);
  abortScenarioRun = (runId: string) => this.req<T.Job>('abortScenarioRun', 'POST', `/scenario-runs/${runId}/abort`);
  listAlerts = (q: { state?: T.AlertState[] } = {}) => this.req<T.AlertPage>('listAlerts', 'GET', `/alerts${qs(q)}`);
  claimAlert = (id: string) => this.req<T.Alert>('claimAlert', 'POST', `/alerts/${id}/claim`);
  classifyAlert = (id: string, body: T.AlertClassification) => this.req<T.Alert>('classifyAlert', 'PATCH', `/alerts/${id}`, body);
  listEvidence = (ticketId: string) => this.req<T.EvidenceRecord[] | { items: T.EvidenceRecord[] }>('listEvidence', 'GET', `/evidence${qs({ ticket_id: ticketId })}`).then(unwrapItems);
  getScorecards = () => this.req<T.Scorecards>('getScorecards', 'GET', '/scorecards');
  listSkills = () => this.req<T.SkillScore[]>('listSkills', 'GET', '/skills');
  listControlResults = () => this.req<T.ControlResult[]>('listControlResults', 'GET', '/controls');
  listFlows = (edgeId: string, since?: string) => this.req<T.Flow[] | { items: T.Flow[] }>('listFlows', 'GET', `/flows${qs({ edge_id: edgeId, since })}`).then(unwrapItems);
  getReplay = (ticketId: string) => this.req<T.ReplayTimeline>('getReplay', 'GET', `/replay/${ticketId}`);
  restoreBaseline = (confirmationToken: string, clientId?: string) =>
    this.req<T.Job>('restoreBaseline', 'POST', '/lab/baseline/restore', { confirmation_token: confirmationToken, client_id: clientId }, { 'Idempotency-Key': idem() });
  getSettings = () => this.req<T.Settings>('getSettings', 'GET', '/settings');
  putSettings = (s: T.Settings) => this.req<T.Settings>('putSettings', 'PUT', '/settings', s);
}
