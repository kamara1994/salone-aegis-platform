// Picks the implementation once per browser tab. Screens import from here, never from mock/.
import { API_MODE, getToken } from './auth';
import { LiveApi, type AegisApi } from './client';
import { LiveEventStream, type EventStream } from './events';
import type { MockEngine } from '@/mock/engine';

export interface Runtime {
  api: AegisApi;
  events: EventStream;
  /** Present only in mock mode (demo controls, local consoles). */
  mock: MockEngine | null;
}

let rt: Runtime | null = null;

export async function getRuntime(): Promise<Runtime> {
  if (rt) return rt;
  if (API_MODE === 'mock') {
    const { MockEngine } = await import('@/mock/engine');
    const engine = new MockEngine();
    rt = { api: engine, events: engine, mock: engine };
  } else {
    const base = '/api/v1';
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/v1/events`;
    rt = { api: new LiveApi(base, getToken), events: new LiveEventStream(wsUrl, getToken), mock: null };
  }
  return rt;
}

export function runtimeSync(): Runtime {
  if (!rt) throw new Error('Runtime not ready. Wrap the app in <AegisProvider>.');
  return rt;
}
