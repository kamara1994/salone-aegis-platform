'use client';

import Guacamole from 'guacamole-common-js';
import { useEffect, useRef, useState } from 'react';
import type { ConsoleSession } from '@/api/types';

const STATES = ['Idle', 'Connecting', 'Waiting', 'Connected', 'Disconnecting', 'Disconnected'];

/** Live-mode console: SSH, RDP, VNC or serial brokered by Guacamole. Credentials never reach the browser. */
export function GuacConsole({ session }: { session: ConsoleSession }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState('Connecting');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const tunnel = new Guacamole.WebSocketTunnel(session.tunnel_url);
    const client = new Guacamole.Client(tunnel);
    const display = client.getDisplay().getElement();
    el.appendChild(display);
    client.onstatechange = (s) => setState(STATES[s] ?? String(s));
    client.onerror = (s) => setErr(s.message);
    tunnel.onerror = (s) => setErr(s.message);
    client.connect(`token=${encodeURIComponent(session.token)}&width=${el.clientWidth}&height=${el.clientHeight}`);
    const kb = new Guacamole.Keyboard(el);
    kb.onkeydown = (k) => client.sendKeyEvent(1, k);
    kb.onkeyup = (k) => client.sendKeyEvent(0, k);
    const mouse = new Guacamole.Mouse(display);
    mouse.onEach(['mousedown', 'mouseup', 'mousemove'], (e) => client.sendMouseState(e.state));
    const ro = new ResizeObserver(() => client.sendSize(el.clientWidth, el.clientHeight));
    ro.observe(el);
    return () => {
      ro.disconnect();
      kb.reset();
      client.disconnect();
      el.innerHTML = '';
    };
  }, [session]);
  return (
    <div className="relative h-full w-full">
      <div ref={host} tabIndex={0} className="h-full w-full overflow-hidden outline-none" aria-label={`${session.protocol} console`} />
      {state !== 'Connected' && <div className="absolute top-2 right-2 rounded bg-pane-2 px-2 py-1 text-[12px] text-muted">{err ?? state}</div>}
    </div>
  );
}
