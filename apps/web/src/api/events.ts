// Contract 3: one WebSocket carries everything live. The UI never polls.
import type { AegisEvent } from './types';

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'closed';
export type EventHandler = (e: AegisEvent) => void;

export interface EventStream {
  connect(): void;
  close(): void;
  on(handler: EventHandler): () => void;
  onState(handler: (s: ConnectionState) => void): () => void;
  readonly lastSeq: number;
  readonly state: ConnectionState;
}

/** Shared fan-out used by both implementations. */
export class EventHub {
  private handlers = new Set<EventHandler>();
  private stateHandlers = new Set<(s: ConnectionState) => void>();
  lastSeq = 0;
  state: ConnectionState = 'connecting';

  on(h: EventHandler) {
    this.handlers.add(h);
    return () => {
      this.handlers.delete(h);
    };
  }
  onState(h: (s: ConnectionState) => void) {
    this.stateHandlers.add(h);
    h(this.state);
    return () => {
      this.stateHandlers.delete(h);
    };
  }
  emit(e: AegisEvent) {
    if (e.seq <= this.lastSeq) return; // replay after reconnect can overlap; drop duplicates
    this.lastSeq = e.seq;
    for (const h of this.handlers) {
      try {
        h(e);
      } catch (err) {
        console.error('event handler failed', e.type, err);
      }
    }
  }
  setState(s: ConnectionState) {
    this.state = s;
    for (const h of this.stateHandlers) h(s);
  }
}

export class LiveEventStream implements EventStream {
  private hub = new EventHub();
  private ws: WebSocket | null = null;
  private attempt = 0;
  private closedByUser = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private url: string,
    private token: () => Promise<string | null>,
    private topics: string[] = ['*'],
  ) {}

  get lastSeq() {
    return this.hub.lastSeq;
  }
  get state() {
    return this.hub.state;
  }
  on(h: EventHandler) {
    return this.hub.on(h);
  }
  onState(h: (s: ConnectionState) => void) {
    return this.hub.onState(h);
  }

  connect() {
    this.closedByUser = false;
    void this.open();
  }

  private async open() {
    const t = await this.token();
    const sep = this.url.includes('?') ? '&' : '?';
    // Browsers cannot set headers on WebSocket; the token rides as a query param over TLS.
    const ws = new WebSocket(t ? `${this.url}${sep}access_token=${encodeURIComponent(t)}` : this.url);
    this.ws = ws;
    this.hub.setState(this.attempt === 0 ? 'connecting' : 'reconnecting');
    ws.onopen = () => {
      this.attempt = 0;
      this.hub.setState('open');
      ws.send(JSON.stringify({ op: 'subscribe', topics: this.topics, resume_from_seq: this.hub.lastSeq }));
    };
    ws.onmessage = (m) => {
      try {
        this.hub.emit(JSON.parse(String(m.data)) as AegisEvent);
      } catch (err) {
        console.error('bad event frame', err);
      }
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.closedByUser) {
        this.hub.setState('closed');
        return;
      }
      this.attempt += 1;
      this.hub.setState('reconnecting');
      const delay = Math.min(30_000, 500 * 2 ** this.attempt) + Math.random() * 400;
      this.timer = setTimeout(() => void this.open(), delay);
    };
    ws.onerror = () => ws.close();
  }

  close() {
    this.closedByUser = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
  }
}
