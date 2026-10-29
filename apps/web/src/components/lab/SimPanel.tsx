'use client';

import { Pause, Play, Send, SkipBack, SkipForward, Trash, X } from 'lucide-react';
import { useState } from 'react';
import { isIp } from '@/lab/net';
import { usePlayer } from '@/lab/player';
import { ping, primaryIp, serviceName, simulatePacket, type PacketTrace, type Proto } from '@/lab/simulate';
import { useLab } from '@/lab/store';
import { deviceById } from '@/lab/validate';
import { Button, cx, IconButton, Input } from '@/components/ui';
import { DECISION_COLOR, DECISION_LABEL } from './PacketLayer';

const PRESETS: { label: string; proto: Proto; port?: number }[] = [
  { label: 'Ping (ICMP)', proto: 'icmp' },
  { label: 'HTTPS 443', proto: 'tcp', port: 443 },
  { label: 'SMB 445', proto: 'tcp', port: 445 },
  { label: 'SSH 22', proto: 'tcp', port: 22 },
  { label: 'RDP 3389', proto: 'tcp', port: 3389 },
  { label: 'DNS 53/udp', proto: 'udp', port: 53 },
  { label: 'PostgreSQL 5432', proto: 'tcp', port: 5432 },
  { label: 'LDAP 389', proto: 'tcp', port: 389 },
];

const STATUS_DECISION = { delivered: 'deliver', blocked: 'block', dropped: 'drop', malformed: 'malformed', delayed: 'delay' } as const;

export function statusColor(t: PacketTrace) {
  return DECISION_COLOR[STATUS_DECISION[t.status]];
}

export function SimPanel({ onClose }: { onClose: () => void }) {
  const st = useLab();
  const doc = st.doc!;
  const player = usePlayer();
  const [proto, setProto] = useState<Proto>('icmp');
  const [port, setPort] = useState('443');
  const [dstIp, setDstIp] = useState('');
  const [hopSel, setHopSel] = useState<number | null>(null);
  const devices = [...doc.devices].sort((a, b) => a.name.localeCompare(b.name));
  const trace = st.traces.find((t) => t.id === st.activeTrace);
  const dst = dstIp.trim() || st.simDst;
  const send = () => {
    if (!st.simSrc || !dst) return;
    const traces = proto === 'icmp' ? ping(doc, st.simSrc, dst) : [simulatePacket(doc, { srcDevice: st.simSrc, dst, proto, port: Number(port) })];
    st.addTrace(traces);
    player.load(traces[0].id);
    setHopSel(null);
  };
  const hop = trace && hopSel !== null ? trace.hops[hopSel] : trace?.hops[Math.min(player.step, trace.hops.length - 1)];
  return (
    <section className="flex h-full min-h-0 flex-col border-t border-line bg-pane" aria-label="Packet simulation" data-testid="sim-panel">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="mr-2 text-[13px] font-semibold">Simulation</h2>
        <label className="flex items-center gap-1 text-[12px]">
          <span className="text-muted">From</span>
          <select aria-label="Source device" className="h-8 max-w-[150px] rounded-[5px] border border-line-strong bg-ink px-2 text-[12.5px]" value={st.simSrc} onChange={(e) => st.setView({ simSrc: e.target.value })} data-testid="sim-src">
            <option value="">Source…</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-[12px]">
          <span className="text-muted">To</span>
          <select aria-label="Destination device" className="h-8 max-w-[150px] rounded-[5px] border border-line-strong bg-ink px-2 text-[12.5px]" value={st.simDst} onChange={(e) => st.setView({ simDst: e.target.value })} data-testid="sim-dst">
            <option value="">Device…</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} {primaryIp(d) ? `(${primaryIp(d)})` : ''}
              </option>
            ))}
          </select>
        </label>
        <Input aria-label="Or destination IP" placeholder="or IP 10.10.40.10" value={dstIp} onChange={(e) => setDstIp(e.target.value)} className={cx('!h-8 !w-36', dstIp && !isIp(dstIp) && 'border-down')} />
        <select
          aria-label="Protocol and port"
          className="h-8 rounded-[5px] border border-line-strong bg-ink px-2 text-[12.5px]"
          value={proto === 'icmp' ? 'icmp' : `${proto}:${port}`}
          onChange={(e) => {
            const [p, n] = e.target.value.split(':');
            setProto(p as Proto);
            if (n) setPort(n);
          }}
          data-testid="sim-proto"
        >
          {PRESETS.map((p) => (
            <option key={p.label} value={p.proto === 'icmp' ? 'icmp' : `${p.proto}:${p.port}`}>
              {p.label}
            </option>
          ))}
          {proto !== 'icmp' && !PRESETS.some((p) => p.port === Number(port) && p.proto === proto) && <option value={`${proto}:${port}`}>{proto.toUpperCase()} {port}</option>}
        </select>
        {proto !== 'icmp' && <Input aria-label="Port" type="number" min={1} max={65535} value={port} onChange={(e) => setPort(e.target.value)} className="!h-8 !w-20" />}
        <Button variant="primary" size="sm" onClick={send} disabled={!st.simSrc || !dst || (!!dstIp && !isIp(dstIp))} data-testid="sim-send">
          <Send className="size-3.5" /> {proto === 'icmp' ? 'Ping' : 'Send'}
        </Button>
        <div className="ml-auto flex items-center gap-1">
          <IconButton label="Previous step" disabled={!trace} onClick={() => trace && player.setStep(Math.max(0, player.step - 1))}>
            <SkipBack className="size-4" />
          </IconButton>
          {player.playing ? (
            <IconButton label="Pause" onClick={player.pause}>
              <Pause className="size-4" />
            </IconButton>
          ) : (
            <IconButton
              label="Play"
              disabled={!trace}
              onClick={() => {
                if (!trace) return;
                if (player.traceId !== trace.id || (player.step >= trace.hops.length - 1 && player.progress >= 1)) player.load(trace.id);
                else player.play();
              }}
            >
              <Play className="size-4" />
            </IconButton>
          )}
          <IconButton label="Next step" disabled={!trace} onClick={() => trace && player.setStep(Math.min(trace.hops.length - 1, player.step + 1))}>
            <SkipForward className="size-4" />
          </IconButton>
          <select aria-label="Playback speed" className="h-7 rounded border border-line-strong bg-ink px-1 text-[12px]" value={player.speed} onChange={(e) => player.setSpeed(Number(e.target.value))}>
            {[0.5, 1, 2, 4].map((v) => (
              <option key={v} value={v}>
                {v}x
              </option>
            ))}
          </select>
          <IconButton label="Clear all packets" onClick={() => { st.clearTraces(); player.stop(); }}>
            <Trash className="size-4" />
          </IconButton>
          <IconButton label="Close simulation" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(220px,1fr)_minmax(260px,1.4fr)_minmax(240px,1fr)]">
        <div className="min-h-0 overflow-auto border-r border-line" aria-label="Packets sent">
          {st.traces.length === 0 ? (
            <p className="p-3 text-[12.5px] text-muted">Pick a source and a destination (or click them on the canvas), choose a protocol and send. Every packet is checked against cabling, VLANs, routes and firewall rules.</p>
          ) : (
            <ul>
              {st.traces.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => {
                      st.setActiveTrace(t.id);
                      player.load(t.id);
                      setHopSel(null);
                    }}
                    className={cx('w-full border-b border-line px-3 py-1.5 text-left text-[12px] hover:bg-pane-2', st.activeTrace === t.id && 'bg-pane-2')}
                    data-testid="sim-trace"
                    data-status={t.status}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: statusColor(t) }} aria-hidden />
                      <span className="font-semibold capitalize" style={{ color: statusColor(t) }}>
                        {t.status}
                      </span>
                      <span className="truncate text-muted">
                        {t.request.proto.toUpperCase()}
                        {t.request.port ? ` ${serviceName(t.request.port)}` : ''}
                      </span>
                      <span className="ml-auto text-faint">{new Date(t.at).toLocaleTimeString()}</span>
                    </div>
                    <div className="truncate">
                      {t.srcName} → {t.dstLabel}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-h-0 overflow-auto border-r border-line" aria-label="Event list">
          {trace ? (
            <>
              <div className="border-b border-line px-3 py-2 text-[12.5px]" data-testid="sim-result">
                <span className="font-semibold capitalize" style={{ color: statusColor(trace) }}>
                  {trace.status}:
                </span>{' '}
                {trace.reason}
                {trace.fix && <div className="mt-0.5 text-muted">Fix: {trace.fix}</div>}
              </div>
              <table className="w-full text-[11.5px]">
                <thead className="sticky top-0 bg-pane text-left text-muted">
                  <tr className="border-b border-line">
                    <th className="px-2 py-1 font-medium">Time ms</th>
                    <th className="px-2 py-1 font-medium">At device</th>
                    <th className="px-2 py-1 font-medium">Type</th>
                    <th className="px-2 py-1 font-medium">Info</th>
                  </tr>
                </thead>
                <tbody>
                  {trace.hops.map((h, k) => (
                    <tr key={h.seq} className={cx('cursor-pointer border-b border-line align-top hover:bg-pane-2', (hopSel ?? Math.min(player.step, trace.hops.length - 1)) === k && 'bg-pane-2')} onClick={() => { setHopSel(k); player.setStep(k); }} data-testid="sim-hop">
                      <td className="px-2 py-1 font-mono">{h.t.toFixed(2)}</td>
                      <td className="px-2 py-1">{h.deviceName}</td>
                      <td className="px-2 py-1 font-medium" style={{ color: DECISION_COLOR[h.decision] }}>
                        {DECISION_LABEL[h.decision]}
                      </td>
                      <td className="px-2 py-1">{h.info}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="p-3 text-[12.5px] text-muted">The event list for the selected packet appears here.</p>
          )}
        </div>
        <div className="min-h-0 overflow-auto p-3 text-[12px]" aria-label="Packet details" data-testid="pdu-details">
          {hop && trace ? (
            <dl className="space-y-2">
              <div>
                <dt className="font-semibold">At {hop.deviceName}</dt>
                <dd className="text-muted">
                  {hop.inIface ? `in ${hop.inIface}` : ''}
                  {hop.outIface ? ` out ${hop.outIface}` : ''} · layer {hop.layer.slice(1)}
                </dd>
              </div>
              <div className="rounded border border-line p-2 font-mono text-[11px]">
                <div className="mb-1 font-sans text-[11px] font-semibold text-muted">Layer 2 (Ethernet)</div>
                <div>src MAC {hop.pdu.srcMac || '—'}</div>
                <div>dst MAC {hop.pdu.dstMac || '—'}</div>
                <div>802.1Q {hop.pdu.vlan !== undefined ? `tag ${hop.pdu.vlan}` : 'untagged'}</div>
              </div>
              <div className="rounded border border-line p-2 font-mono text-[11px]">
                <div className="mb-1 font-sans text-[11px] font-semibold text-muted">Layer 3 (IPv4)</div>
                <div>src {hop.pdu.srcIp}</div>
                <div>dst {hop.pdu.dstIp}</div>
                <div>TTL {hop.pdu.ttl} · {hop.pdu.proto.toUpperCase()} · {hop.pdu.bytes} bytes</div>
                {hop.route && <div>route: {hop.route}</div>}
              </div>
              {hop.pdu.proto !== 'icmp' && (
                <div className="rounded border border-line p-2 font-mono text-[11px]">
                  <div className="mb-1 font-sans text-[11px] font-semibold text-muted">Layer 4 ({hop.pdu.proto.toUpperCase()})</div>
                  <div>src port {hop.pdu.sport}</div>
                  <div>dst port {serviceName(hop.pdu.dport)}</div>
                </div>
              )}
              {hop.acl && (
                <div className={cx('rounded border p-2 text-[11.5px]', hop.acl.action === 'block' ? 'border-down/60 bg-down/5' : 'border-healthy/50 bg-healthy/5')} data-testid="acl-decision">
                  <div className="font-semibold">ACL decision: {hop.acl.action === 'block' ? 'block' : 'pass'}</div>
                  <div>
                    {hop.acl.implicit ? 'No rule matched: implicit deny' : `Rule ${hop.acl.rule}: ${hop.acl.descr}`} on {hop.acl.iface}
                  </div>
                </div>
              )}
              <div className="text-[11px] text-muted">Packet sent {new Date(trace.at).toLocaleString()}; {hop.t.toFixed(2)} ms after it left {trace.srcName}.</div>
            </dl>
          ) : (
            <p className="text-muted">Select an event to inspect the packet at that hop.</p>
          )}
        </div>
      </div>
    </section>
  );
}

export function pingFromDevice(srcId: string) {
  const st = useLab.getState();
  st.setView({ simSrc: srcId });
  st.setTool('simulate');
  const d = deviceById(st.doc!, srcId);
  return d;
}
