'use client';

import { useMutation } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Copy, Monitor, Plus, Power, RotateCw, Terminal, Trash, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useFlows, useNode } from '@/api/hooks';
import { awaitJob, errorText, useRuntime } from '@/components/providers';
import { ConsoleView } from '@/components/console/ConsoleView';
import { Badge, Button, ConfirmDialog, cx, Dialog, Field, IconButton, Input, relTime, Textarea } from '@/components/ui';
import { KIND_LABEL, modelOf } from '@/lab/catalog';
import { DesignCli } from '@/lab/cli';
import { runningConfig } from '@/lab/config';
import { isIp, macFor, parseCidr } from '@/lab/net';
import { usePlayer } from '@/lab/player';
import { serviceName } from '@/lab/simulate';
import { useLab } from '@/lab/store';
import { useUi } from '@/state/ui';
import type { Cable, CableType, Device, FirewallRule, Iface, LabDoc, Route } from '@/lab/types';
import { CABLE_LABEL, cableOnPort, cableStatus, deviceById, otherEnd, portTypeName } from '@/lab/validate';
import type { LabState as MockLab } from '@/mock/lab';
import { CableTypeSelect, IssueList, linkTestSummary } from './Pickers';
import { CablePhysical, ServicesTab } from './ServicesTab';
import { DECISION_COLOR } from './PacketLayer';
import { primaryMac, primaryVlan } from './CanvasParts';

export const DEVICE_TABS = [
  ['overview', 'Overview'],
  ['ports', 'Ports'],
  ['interfaces', 'Interfaces'],
  ['config', 'Configuration'],
  ['terminal', 'Terminal'],
  ['logs', 'Logs'],
  ['packets', 'Packets'],
  ['services', 'Services'],
  ['routes', 'Routes'],
  ['vlans', 'VLANs'],
  ['firewall', 'Firewall'],
  ['actions', 'Actions'],
] as const;

const sel = 'h-8 rounded-[5px] border border-line-strong bg-ink px-2 text-[12.5px]';

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-2 border-b border-line py-1.5 text-[12.5px] last:border-0">
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function linkInfo(doc: LabDoc, d: Device, i: Iface) {
  const c = cableOnPort(doc, d.id, i.name);
  if (!c) return { state: i.shutdown ? 'admin down' : 'not connected', cable: undefined as Cable | undefined, peer: '' };
  const st = cableStatus(doc, c);
  const p = otherEnd(c, d.id, i.name);
  return { state: i.shutdown ? 'admin down' : st.state, cable: c, peer: `${deviceById(doc, p.device)?.name ?? '?'} ${p.port}`, negotiated: st.negotiated };
}

// ---------------- tabs ----------------

function Overview({ d, doc }: { d: Device; doc: LabDoc }) {
  const st = useLab();
  const m = modelOf(d);
  const node = useNode(d.nodeId ?? null);
  const cables = doc.cables.filter((c) => c.a.device === d.id || c.b.device === d.id);
  const up = cables.filter((c) => cableStatus(doc, c).state === 'up').length;
  const [name, setName] = useState(d.name);
  useEffect(() => setName(d.name), [d.name]);
  const racks = doc.racks.filter((r) => !d.siteId || r.siteId === d.siteId);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.image} alt="" className="h-16 w-24 object-contain" />
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{d.name}</p>
          <p className="text-[12.5px] text-muted">
            {m.vendor} {m.name} · {KIND_LABEL[d.kind]}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge tone={d.power === 'stopped' ? 'bad' : d.power === 'running' ? 'good' : 'neutral'}>power {d.power}</Badge>
            <Badge tone={d.health === 'healthy' ? 'good' : d.health === 'degraded' ? 'warn' : d.health === 'down' ? 'bad' : 'neutral'}>{d.health}</Badge>
            <Badge>{d.origin === 'inventory' ? 'In the lab' : 'Design only'}</Badge>
          </div>
        </div>
      </div>
      {d.origin === 'design' && (
        <Field label="Name">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && name !== d.name) st.updateDevice(d.id, { name: name.trim() });
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Device name" />
            <Button type="submit" size="sm">
              Rename
            </Button>
          </form>
        </Field>
      )}
      <dl>
        <Row k="Role">{d.role ?? '—'}</Row>
        <Row k="Model">{m.description}</Row>
        <Row k="IP address">{d.mgmtIp ?? d.interfaces.find((i) => i.ip)?.ip ?? 'none'}</Row>
        <Row k="MAC address">{primaryMac(d) ? <span className="font-mono">{primaryMac(d)}</span> : <span className="text-muted">not reported by the back end</span>}</Row>
        <Row k="VLAN">{primaryVlan(d) ?? '—'}</Row>
        <Row k="Interfaces">{d.interfaces.filter((i) => i.type !== 'console' && i.type !== 'terminal').length} ({d.interfaces.filter((i) => i.inferred).length ? 'some inferred' : 'reported'})</Row>
        <Row k="Connection">{cables.length ? `${up} of ${cables.length} links up` : 'Not connected'}</Row>
        <Row k="Site">
          <select aria-label="Site" className={sel} value={d.siteId ?? ''} onChange={(e) => st.updateDevice(d.id, { siteId: e.target.value || undefined })}>
            <option value="">No site</option>
            {doc.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Row>
        <Row k="Rack">
          <div className="flex gap-2">
            <select aria-label="Rack" className={sel} value={d.rack?.rackId ?? ''} onChange={(e) => st.placeInRack(d.id, e.target.value || null, d.rack?.u ?? 1)}>
              <option value="">Not racked</option>
              {racks.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {d.rack && <Input aria-label="Rack unit" type="number" min={1} max={48} value={d.rack.u} onChange={(e) => st.placeInRack(d.id, d.rack!.rackId, Number(e.target.value))} className="!w-20" />}
          </div>
        </Row>
        {d.nodeId && node.data && (
          <Row k="Open tickets">
            {node.data.open_ticket_ids?.length ? (
              node.data.open_ticket_ids.map((t) => (
                <Link key={t} href={`/tickets/${t}`} className="mr-2 text-action hover:underline">
                  Open ticket
                </Link>
              ))
            ) : (
              <span className="text-muted">None</span>
            )}
          </Row>
        )}
      </dl>
      {d.origin === 'inventory' && doc.source === 'live-topology' && <p className="rounded border border-line bg-pane-2 p-2 text-[12px] text-muted">Reported by the back end through GET /topology. That contract carries no ports, MACs or routes, so ports used by cables are inferred and edits here stay in the design.</p>}
      <Field label="Notes">
        <Textarea rows={2} defaultValue={d.notes ?? ''} onBlur={(e) => e.target.value !== (d.notes ?? '') && st.updateDevice(d.id, { notes: e.target.value })} aria-label="Device notes" />
      </Field>
    </div>
  );
}

function Ports({ d, doc }: { d: Device; doc: LabDoc }) {
  const phys = d.interfaces.filter((i) => !i.parent && !/^vlan\d+$/i.test(i.name) && !d.interfaces.some((x) => x.bridge === i.name));
  return (
    <div className="overflow-auto">
      <table className="w-full text-[12px]" data-testid="ports-table">
        <thead className="text-left text-[11px] text-muted">
          <tr className="border-b border-line">
            <th className="py-1 pr-2 font-medium">Port</th>
            <th className="py-1 pr-2 font-medium">State</th>
            <th className="py-1 pr-2 font-medium">Connected to</th>
            <th className="py-1 pr-2 font-medium">Mode</th>
            <th className="py-1 font-medium">MAC</th>
          </tr>
        </thead>
        <tbody>
          {phys.map((i) => {
            const li = linkInfo(doc, d, i);
            return (
              <tr key={i.name} className="border-b border-line align-top">
                <td className="py-1 pr-2">
                  <div className="font-mono">{i.name}</div>
                  <div className="text-[10.5px] text-faint">{portTypeName(i.type)}{i.inferred ? ', inferred' : ''}</div>
                </td>
                <td className="py-1 pr-2">
                  <span className={cx(li.state === 'up' ? 'text-healthy' : li.state === 'degraded' ? 'text-degraded' : li.state === 'not connected' ? 'text-faint' : 'text-down')}>{li.state}</span>
                  {li.negotiated && <div className="text-[10.5px] text-muted">{li.negotiated}</div>}
                </td>
                <td className="py-1 pr-2">
                  {li.peer || '—'}
                  {li.cable && <div className="text-[10.5px] text-muted">{CABLE_LABEL[li.cable.type]}</div>}
                </td>
                <td className="py-1 pr-2">{i.mode === 'trunk' ? `trunk (native ${i.nativeVlan ?? 1})` : i.mode === 'access' ? `access ${i.vlan ?? 1}` : i.ip ? `${i.ip}/${i.prefix}` : i.bridge ? `in ${i.bridge}` : '—'}</td>
                <td className="py-1 font-mono text-[10.5px]">{i.mac || <span className="text-faint">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IfaceForm({ d, i }: { d: Device; i: Iface }) {
  const st = useLab();
  const [f, setF] = useState<Iface>(i);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setF(i);
    setErr(null);
  }, [i]);
  const sw = d.kind === 'switch' && !/^vlan/i.test(i.name) && !i.parent;
  const l3 = !sw || /^vlan/i.test(i.name);
  const save = () => {
    if (f.ip && !isIp(f.ip)) return setErr(`${f.ip} is not a valid IPv4 address.`);
    if (f.gateway && !isIp(f.gateway)) return setErr(`${f.gateway} is not a valid gateway address.`);
    if (f.ip && (f.prefix === undefined || f.prefix < 0 || f.prefix > 32)) return setErr('Prefix length must be 0-32.');
    if (f.speed !== 'auto' && !i.speeds.includes(f.speed as never)) return setErr(`${i.name} does not support ${f.speed} Mb/s.`);
    const patch: Partial<Iface> = { description: f.description, shutdown: f.shutdown, speed: f.speed, duplex: f.duplex };
    if (sw) Object.assign(patch, { mode: f.mode, vlan: f.mode === 'access' ? f.vlan : undefined, nativeVlan: f.mode === 'trunk' ? f.nativeVlan ?? 1 : undefined, allowedVlans: f.mode === 'trunk' ? f.allowedVlans ?? 'all' : undefined });
    if (l3) Object.assign(patch, { ip: f.ip || undefined, prefix: f.ip ? f.prefix : undefined, gateway: f.gateway || undefined, dhcp: f.dhcp });
    st.updateIface(d.id, i.name, patch);
    setErr(null);
  };
  const set = (p: Partial<Iface>) => setF((x) => ({ ...x, ...p }));
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      aria-label={`Configure ${i.name}`}
    >
      <p className="font-mono text-[13px] font-semibold">{i.name}</p>
      <label className="flex items-center gap-2 text-[12.5px]">
        <input type="checkbox" checked={!f.shutdown} onChange={(e) => set({ shutdown: !e.target.checked })} /> Enabled (no shutdown)
      </label>
      <Field label="Description">
        <Input value={f.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      {i.type !== 'console' && i.type !== 'terminal' && i.type !== 'serial' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Speed">
            <select aria-label="Speed" className={cx(sel, 'w-full')} value={String(f.speed)} onChange={(e) => set({ speed: e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as Iface['speed']) })}>
              <option value="auto">auto</option>
              {i.speeds.map((s) => (
                <option key={s} value={s}>
                  {s} Mb/s
                </option>
              ))}
            </select>
          </Field>
          <Field label="Duplex">
            <select aria-label="Duplex" className={cx(sel, 'w-full')} value={f.duplex} onChange={(e) => set({ duplex: e.target.value as Iface['duplex'] })}>
              <option value="auto">auto</option>
              <option value="full">full</option>
              <option value="half">half</option>
            </select>
          </Field>
        </div>
      )}
      {sw && (
        <>
          <Field label="Switchport mode">
            <select aria-label="Switchport mode" className={cx(sel, 'w-full')} value={f.mode ?? 'access'} onChange={(e) => set({ mode: e.target.value as 'access' | 'trunk' })}>
              <option value="access">access</option>
              <option value="trunk">trunk</option>
            </select>
          </Field>
          {(f.mode ?? 'access') === 'access' ? (
            <Field label="Access VLAN">
              <select aria-label="Access VLAN" className={cx(sel, 'w-full')} value={f.vlan ?? 1} onChange={(e) => set({ vlan: Number(e.target.value) })}>
                {Object.entries(d.vlans).map(([id, n]) => (
                  <option key={id} value={id}>
                    {id} {n}
                  </option>
                ))}
                {f.vlan !== undefined && !d.vlans[f.vlan] && <option value={f.vlan}>{f.vlan} (missing from VLAN database)</option>}
              </select>
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Native VLAN">
                <Input type="number" value={f.nativeVlan ?? 1} onChange={(e) => set({ nativeVlan: Number(e.target.value) })} />
              </Field>
              <Field label="Allowed VLANs" hint="all, or 10,20,30">
                <Input value={f.allowedVlans === undefined || f.allowedVlans === 'all' ? 'all' : f.allowedVlans.join(',')} onChange={(e) => set({ allowedVlans: e.target.value.trim() === 'all' || !e.target.value.trim() ? 'all' : e.target.value.split(',').map((x) => Number(x.trim())).filter(Number.isFinite) })} />
              </Field>
            </div>
          )}
        </>
      )}
      {l3 && i.type !== 'console' && i.type !== 'terminal' && (
        <>
          <label className="flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={!!f.dhcp} onChange={(e) => set({ dhcp: e.target.checked })} /> Address from DHCP
          </label>
          <div className="grid grid-cols-[1fr_80px] gap-2">
            <Field label="IPv4 address">
              <Input value={f.ip ?? ''} onChange={(e) => set({ ip: e.target.value.trim() })} placeholder="10.10.20.50" aria-label="IPv4 address" />
            </Field>
            <Field label="Prefix">
              <Input type="number" min={0} max={32} value={f.prefix ?? 24} onChange={(e) => set({ prefix: Number(e.target.value) })} aria-label="Prefix length" />
            </Field>
          </div>
          {modelOf(d).forwarding !== 'l3' && (
            <Field label="Default gateway">
              <Input value={f.gateway ?? ''} onChange={(e) => set({ gateway: e.target.value.trim() })} placeholder="10.10.20.1" aria-label="Default gateway" />
            </Field>
          )}
        </>
      )}
      {err && (
        <p role="alert" className="text-[12.5px] text-down">
          {err}
        </p>
      )}
      <div className="flex justify-between gap-2">
        <Button type="submit" variant="primary" size="sm">
          Apply
        </Button>
        {(d.origin === 'design' || i.parent || /^(vlan|loopback|tunnel)/i.test(i.name)) && (
          <Button type="button" size="sm" variant="danger" onClick={() => st.removeIface(d.id, i.name)}>
            Remove interface
          </Button>
        )}
      </div>
    </form>
  );
}

function AddIface({ d }: { d: Device }) {
  const st = useLab();
  const [kind, setKind] = useState<'sub' | 'svi' | 'loopback' | 'tunnel' | 'port'>(d.kind === 'switch' ? 'svi' : d.kind === 'router' || d.kind === 'firewall' ? 'sub' : 'port');
  const [parent, setParent] = useState(d.interfaces.find((i) => i.type === 'copper')?.name ?? '');
  const [vlan, setVlan] = useState(30);
  const [ip, setIp] = useState('');
  const [prefix, setPrefix] = useState(24);
  const [err, setErr] = useState<string | null>(null);
  const add = () => {
    if (ip && !isIp(ip)) return setErr('Enter a valid IPv4 address or leave it empty.');
    let name = '';
    const base: Partial<Iface> = { ip: ip || undefined, prefix: ip ? prefix : undefined, mode: 'routed' };
    if (kind === 'sub') name = `${parent}.${vlan}`;
    if (kind === 'svi') name = `Vlan${vlan}`;
    if (kind === 'loopback') name = `Loopback${d.interfaces.filter((i) => /^loopback/i.test(i.name)).length}`;
    if (kind === 'tunnel') name = `Tunnel${d.interfaces.filter((i) => /^tunnel/i.test(i.name)).length}`;
    if (kind === 'port') name = `eth${d.interfaces.filter((i) => /^eth\d+$/.test(i.name)).length}`;
    if (d.interfaces.some((i) => i.name === name)) return setErr(`${name} already exists.`);
    st.addIface(d.id, {
      name,
      type: kind === 'port' ? 'copper' : 'virtual',
      speeds: kind === 'port' ? [10, 100, 1000] : [1000],
      speed: 'auto',
      duplex: 'auto',
      mac: kind === 'port' || kind === 'svi' || kind === 'sub' ? macFor(`${d.id}/${name}`, modelOf(d).macPrefix) : '',
      shutdown: false,
      ...base,
      ...(kind === 'sub' ? { parent, vlan, alias: `VLAN${vlan}` } : {}),
      ...(kind === 'svi' ? { vlan } : {}),
    });
    if (ip) st.updateIface(d.id, name, { ip, prefix });
    setErr(null);
    setIp('');
  };
  return (
    <details className="rounded border border-line p-2 text-[12.5px]">
      <summary className="cursor-pointer font-medium">Add an interface</summary>
      <div className="mt-2 space-y-2">
        <select aria-label="Interface kind" className={cx(sel, 'w-full')} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {(d.kind === 'router' || d.kind === 'firewall') && <option value="sub">Sub-interface (802.1Q)</option>}
          {d.kind === 'switch' && <option value="svi">Switch virtual interface (SVI)</option>}
          <option value="loopback">Loopback</option>
          <option value="tunnel">Tunnel</option>
          <option value="port">Extra Ethernet port (expansion card)</option>
        </select>
        {kind === 'sub' && (
          <select aria-label="Parent interface" className={cx(sel, 'w-full')} value={parent} onChange={(e) => setParent(e.target.value)}>
            {d.interfaces.filter((i) => !i.parent && (i.type === 'copper' || i.type === 'sfp')).map((i) => (
              <option key={i.name}>{i.name}</option>
            ))}
          </select>
        )}
        {(kind === 'sub' || kind === 'svi') && <Input type="number" aria-label="VLAN" value={vlan} onChange={(e) => setVlan(Number(e.target.value))} />}
        <div className="grid grid-cols-[1fr_80px] gap-2">
          <Input aria-label="New interface IP" placeholder="IPv4 address (optional)" value={ip} onChange={(e) => setIp(e.target.value.trim())} />
          <Input aria-label="New interface prefix" type="number" value={prefix} onChange={(e) => setPrefix(Number(e.target.value))} />
        </div>
        {err && <p className="text-down">{err}</p>}
        <Button size="sm" onClick={add}>
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
    </details>
  );
}

function Interfaces({ d }: { d: Device }) {
  const [name, setName] = useState(d.interfaces[0]?.name ?? '');
  const i = d.interfaces.find((x) => x.name === name) ?? d.interfaces[0];
  return (
    <div className="space-y-3">
      <select aria-label="Interface" className={cx(sel, 'w-full font-mono')} value={i?.name ?? ''} onChange={(e) => setName(e.target.value)} data-testid="iface-select">
        {d.interfaces.map((x) => (
          <option key={x.name} value={x.name}>
            {x.name} {x.ip ? `(${x.ip})` : x.mode === 'access' ? `(access ${x.vlan ?? 1})` : x.mode === 'trunk' ? '(trunk)' : ''} {x.shutdown ? '- shutdown' : ''}
          </option>
        ))}
      </select>
      {i && <IfaceForm d={d} i={i} />}
      <AddIface d={d} />
    </div>
  );
}

function Config({ d }: { d: Device }) {
  const cfg = useMemo(() => runningConfig(d), [d]);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[12px] text-muted">
        <span>Generated from this design. Change it in Interfaces, Routes, VLANs or Firewall; change the real device through its terminal.</span>
        <Button
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(cfg).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          <Copy className="size-3.5" /> {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="max-h-[55vh] overflow-auto rounded border border-line bg-ink p-2 font-mono text-[11.5px] leading-relaxed" data-testid="running-config">
        {cfg}
      </pre>
    </div>
  );
}

const XtermMock = dynamic(() => import('@/components/console/XtermMock').then((m) => m.XtermMock), { ssr: false });

/** Simulated IOS / command-prompt CLI over the design model (Packet Tracer's CLI tab). */
function DesignTerminal({ d }: { d: Device }) {
  const theme = useUi((s) => s.theme);
  const con = useMemo(() => new DesignCli(d.id), [d.id]);
  return (
    <div className="h-[55vh] min-h-[280px] overflow-hidden rounded border border-line bg-pane" data-testid="design-cli">
      <XtermMock con={con} theme={theme} />
    </div>
  );
}

function TerminalTab({ d }: { d: Device }) {
  const rt = useRuntime();
  const cli = d.consoles.filter((c) => c === 'ssh' || c === 'serial');
  const canModel = !['cloud'].includes(d.kind);
  const [mode, setMode] = useState<'device' | 'model'>(d.nodeId && cli.length ? 'device' : 'model');
  useEffect(() => setMode(d.nodeId && cli.length ? 'device' : 'model'), [d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 text-[12px]" role="radiogroup" aria-label="Terminal source">
        <button role="radio" aria-checked={mode === 'device'} disabled={!d.nodeId || !cli.length} onClick={() => setMode('device')} className={cx('rounded px-2 py-1 disabled:opacity-40', mode === 'device' ? 'bg-action/20 text-text' : 'text-muted hover:text-text')} data-testid="term-device">
          Device console
        </button>
        <button role="radio" aria-checked={mode === 'model'} disabled={!canModel} onClick={() => setMode('model')} className={cx('rounded px-2 py-1 disabled:opacity-40', mode === 'model' ? 'bg-action/20 text-text' : 'text-muted hover:text-text')} data-testid="term-model">
          Design CLI
        </button>
      </div>
      {mode === 'device' ? (
        <>
          <div className="h-[55vh] min-h-[280px] overflow-hidden rounded border border-line" data-testid="lab-terminal">
            <ConsoleView nodeId={d.nodeId!} protocols={cli} />
          </div>
          {!rt.mock && <p className="sr-only">Live console session from the back end.</p>}
        </>
      ) : canModel ? (
        <>
          <p className="text-[11.5px] text-muted">
            {modelOf(d).forwarding === 'host' ? 'Command prompt' : 'IOS-style CLI'} running against this design, not the real device. Changes you type (addresses, VLANs, OSPF, HSRP, NAT, EtherChannel, routes) update the canvas and packet simulation. Type <code>?</code> for commands.
          </p>
          <DesignTerminal d={d} />
        </>
      ) : (
        <p className="text-[12.5px] text-muted">{d.name} is a managed service without an interactive console.</p>
      )}
    </div>
  );
}

function Logs({ d, lab }: { d: Device; lab: MockLab | null }) {
  const log = useLab((s) => s.log).filter((l) => l.deviceId === d.id);
  const doc = useLab((s) => s.doc)!;
  const rt = useRuntime();
  const lines: { at: string; text: string; level: 'info' | 'warn' | 'error'; source: string }[] = log.map((l) => ({ ...l, source: 'canvas' }));
  if (lab) {
    if (d.name === 'FW01') for (const e of lab.fwDenyLog.slice(-40)) lines.push({ at: e.at, level: 'warn', text: `filterlog: block in on VLAN rule ${e.rule}: ${e.src} → ${e.dst}:${e.port}`, source: 'lab' });
    if (d.name === 'DC01' || d.name === 'DC02') {
      for (const e of lab.events4740.slice(-20)) lines.push({ at: e.at, level: 'warn', text: `Security 4740: account ${e.user} locked out (caller ${e.caller})`, source: 'lab' });
      for (const e of lab.events4771.slice(-20)) lines.push({ at: e.at, level: 'warn', text: `Security 4771: Kerberos pre-authentication failed for ${e.user} from ${e.ip}`, source: 'lab' });
    }
    if (d.name === 'SW-ACC-01') for (const p of Object.values(lab.switchPorts).filter((x) => x.lateCollisions > 0)) lines.push({ at: new Date().toISOString(), level: 'error', text: `%ETHERNET: ${p.name} ${p.lateCollisions} late collisions, ${p.crc} CRC errors`, source: 'lab' });
  }
  for (const c of doc.cables.filter((x) => x.a.device === d.id || x.b.device === d.id)) {
    const s = cableStatus(doc, c);
    const port = c.a.device === d.id ? c.a.port : c.b.port;
    if (s.state === 'down' || s.state === 'degraded') lines.push({ at: doc.generatedAt, level: s.state === 'down' ? 'error' : 'warn', text: `${port}: ${s.issues.find((i) => i.severity !== 'info')?.message ?? s.state}`, source: 'link check' });
  }
  lines.sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="space-y-2">
      <p className="text-[11.5px] text-muted">{rt.mock ? 'Lab events from the simulated lab, link checks, and changes made on this canvas.' : 'The current contract has no device log endpoint, so this shows link checks and changes made on this canvas only.'}</p>
      {lines.length ? (
        <ul className="max-h-[55vh] space-y-1 overflow-auto font-mono text-[11.5px]" data-testid="device-logs">
          {lines.map((l, k) => (
            <li key={k} className={cx('rounded px-1.5 py-0.5', l.level === 'error' ? 'bg-down/10 text-down' : l.level === 'warn' ? 'bg-degraded/10' : 'bg-pane-2')}>
              <span className="text-faint">{new Date(l.at).toLocaleTimeString()} [{l.source}]</span> {l.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-muted">No events yet.</p>
      )}
    </div>
  );
}

function Packets({ d, doc }: { d: Device; doc: LabDoc }) {
  const traces = useLab((s) => s.traces).filter((t) => t.path.includes(d.id));
  const setActive = useLab((s) => s.setActiveTrace);
  const load = usePlayer((s) => s.load);
  const linked = doc.cables.filter((c) => (c.a.device === d.id || c.b.device === d.id) && c.linkId);
  const [edge, setEdge] = useState<string | null>(linked[0]?.linkId ?? null);
  const flows = useFlows(edge);
  return (
    <div className="space-y-3">
      <section>
        <h4 className="mb-1 text-[12px] font-semibold">Simulated packets through {d.name}</h4>
        {traces.length ? (
          <ul className="space-y-1">
            {traces.slice(0, 12).map((t) => (
              <li key={t.id}>
                <button
                  className="w-full rounded border border-line px-2 py-1 text-left text-[12px] hover:bg-pane-2"
                  onClick={() => {
                    setActive(t.id);
                    load(t.id);
                  }}
                >
                  <span className="font-semibold" style={{ color: DECISION_COLOR[t.status === 'delivered' ? 'deliver' : t.status === 'blocked' ? 'block' : t.status === 'malformed' ? 'malformed' : t.status === 'delayed' ? 'delay' : 'drop'] }}>
                    {t.status}
                  </span>{' '}
                  {t.request.proto.toUpperCase()} {t.srcName} → {t.dstLabel} {t.request.port ? serviceName(t.request.port) : ''}
                  <div className="truncate text-muted">{t.reason}</div>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12.5px] text-muted">None yet. Use Ping from here, or the simulation panel.</p>
        )}
      </section>
      <section>
        <h4 className="mb-1 text-[12px] font-semibold">Recent flows on its links</h4>
        {linked.length ? (
          <>
            <select aria-label="Link" className={cx(sel, 'mb-1 w-full')} value={edge ?? ''} onChange={(e) => setEdge(e.target.value)}>
              {linked.map((c) => (
                <option key={c.id} value={c.linkId}>
                  {deviceById(doc, c.a.device)?.name} {c.a.port} ↔ {deviceById(doc, c.b.device)?.name} {c.b.port}
                </option>
              ))}
            </select>
            {flows.data?.length ? (
              <table className="w-full text-[11.5px]">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="font-medium">Source</th>
                    <th className="font-medium">Destination</th>
                    <th className="font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {flows.data.slice(0, 15).map((f, k) => (
                    <tr key={k} className="border-t border-line">
                      <td>{f.src}</td>
                      <td>
                        {f.dst}:{f.port}/{f.proto}
                      </td>
                      <td className={f.verdict === 'denied' ? 'text-down' : 'text-healthy'}>{f.verdict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[12px] text-muted">{flows.isLoading ? 'Loading…' : flows.error ? errorText(flows.error) : 'No flows reported in the last window.'}</p>
            )}
          </>
        ) : (
          <p className="text-[12.5px] text-muted">No reported links on this device.</p>
        )}
      </section>
    </div>
  );
}

function Routes({ d }: { d: Device }) {
  const st = useLab();
  const [prefix, setPrefix] = useState('');
  const [via, setVia] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const host = modelOf(d).forwarding === 'host';
  const gw = d.interfaces.find((i) => i.gateway);
  return (
    <div className="space-y-3">
      <table className="w-full text-[12px]" data-testid="routes-table">
        <thead className="text-left text-[11px] text-muted">
          <tr className="border-b border-line">
            <th className="py-1 font-medium">Code</th>
            <th className="py-1 font-medium">Prefix</th>
            <th className="py-1 font-medium">Next hop</th>
            <th />
          </tr>
        </thead>
        <tbody className="font-mono">
          {host && gw && (
            <tr className="border-b border-line">
              <td className="py-1">S*</td>
              <td>0.0.0.0/0</td>
              <td>via {gw.gateway} ({gw.name})</td>
              <td />
            </tr>
          )}
          {d.routes.map((r, k) => (
            <tr key={k} className="border-b border-line">
              <td className="py-1">{r.kind === 'connected' ? 'C' : r.prefix === '0.0.0.0/0' ? 'S*' : 'S'}</td>
              <td>{r.prefix}</td>
              <td>{r.kind === 'connected' ? `directly connected, ${r.iface}` : `via ${r.via ?? r.iface}`}</td>
              <td className="text-right">
                {r.kind !== 'connected' && (
                  <IconButton label={`Delete route ${r.prefix}`} onClick={() => st.setRoutes(d.id, d.routes.filter((_, j) => j !== k))}>
                    <Trash className="size-3.5" />
                  </IconButton>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!host && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!parseCidr(prefix)) return setErr('Prefix must look like 10.20.0.0/16 (or 0.0.0.0/0).');
            if (!isIp(via)) return setErr('Next hop must be an IPv4 address.');
            const r: Route = { prefix, via, kind: prefix === '0.0.0.0/0' ? 'default' : 'static' };
            st.setRoutes(d.id, [...d.routes, r]);
            setPrefix('');
            setVia('');
            setErr(null);
          }}
        >
          <Field label="Destination prefix">
            <Input value={prefix} onChange={(e) => setPrefix(e.target.value.trim())} placeholder="10.20.0.0/16" aria-label="Route prefix" />
          </Field>
          <Field label="Next hop">
            <Input value={via} onChange={(e) => setVia(e.target.value.trim())} placeholder="10.255.255.2" aria-label="Route next hop" />
          </Field>
          <Button type="submit" size="sm">
            Add route
          </Button>
          {err && <p className="w-full text-[12px] text-down">{err}</p>}
        </form>
      )}
    </div>
  );
}

function Vlans({ d, doc }: { d: Device; doc: LabDoc }) {
  const st = useLab();
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  if (d.kind !== 'switch') {
    const used = d.interfaces.filter((i) => i.vlan !== undefined);
    return used.length ? (
      <ul className="space-y-1 text-[12.5px]">
        {used.map((i) => (
          <li key={i.name}>
            <span className="font-mono">{i.name}</span>: VLAN {i.vlan} {doc.vlans.find((v) => v.id === i.vlan)?.name ?? ''} {i.parent ? '(tagged sub-interface)' : ''}
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-[12.5px] text-muted">No VLANs on {d.name}. VLAN databases live on switches.</p>
    );
  }
  const ports = (v: number) => d.interfaces.filter((i) => (i.mode ?? 'access') === 'access' && (i.vlan ?? 1) === v && !/^vlan/i.test(i.name) && i.type !== 'console').map((i) => i.name);
  const trunks = d.interfaces.filter((i) => i.mode === 'trunk').map((i) => i.name);
  return (
    <div className="space-y-3">
      <table className="w-full text-[12px]" data-testid="vlan-table">
        <thead className="text-left text-[11px] text-muted">
          <tr className="border-b border-line">
            <th className="py-1 font-medium">VLAN</th>
            <th className="py-1 font-medium">Name</th>
            <th className="py-1 font-medium">Access ports</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Object.entries(d.vlans).map(([v, n]) => (
            <tr key={v} className="border-b border-line align-top">
              <td className="py-1 font-mono">{v}</td>
              <td>{n}</td>
              <td className="font-mono text-[11px]">{ports(Number(v)).join(', ') || '—'}</td>
              <td className="text-right">
                {v !== '1' && (
                  <IconButton
                    label={`Delete VLAN ${v}`}
                    onClick={() => {
                      const next = { ...d.vlans };
                      delete next[Number(v)];
                      st.setVlans(d.id, next);
                    }}
                  >
                    <Trash className="size-3.5" />
                  </IconButton>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[12px] text-muted">Trunks: {trunks.join(', ') || 'none'}</p>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(id);
          if (!Number.isInteger(n) || n < 2 || n > 4094) return;
          st.setVlans(d.id, { ...d.vlans, [n]: name || `VLAN${n}` });
          setId('');
          setName('');
        }}
      >
        <Field label="VLAN ID">
          <Input type="number" min={2} max={4094} value={id} onChange={(e) => setId(e.target.value)} className="w-24" aria-label="New VLAN ID" />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="New VLAN name" />
        </Field>
        <Button type="submit" size="sm">
          Add VLAN
        </Button>
      </form>
    </div>
  );
}

function Firewall({ d }: { d: Device }) {
  const st = useLab();
  const rules = d.firewall;
  const [draft, setDraft] = useState<FirewallRule>({ id: 0, iface: d.interfaces.find((i) => i.alias)?.alias ?? 'any', src: 'any', dst: 'any', proto: 'tcp', port: '443', action: 'pass', log: false, enabled: true, descr: '' });
  const save = (next: FirewallRule[]) => st.setRules(d.id, next);
  const aliases = [...new Set(['any', ...d.interfaces.map((i) => i.alias).filter(Boolean) as string[]])];
  return (
    <div className="space-y-3">
      <p className="text-[11.5px] text-muted">{d.kind === 'firewall' ? 'Evaluated top to bottom per inbound interface; the first match wins; anything unmatched is blocked.' : 'An ACL on this device. Leave it empty for no filtering.'}</p>
      <ol className="space-y-1" data-testid="fw-rules">
        {rules.map((r, k) => (
          <li key={`${r.id}-${k}`} className={cx('rounded border px-2 py-1 text-[11.5px]', r.enabled ? 'border-line' : 'border-dashed border-line opacity-60')}>
            <div className="flex items-center gap-1.5">
              <span className={cx('rounded px-1 font-semibold', r.action === 'pass' ? 'bg-healthy/15 text-healthy' : 'bg-down/15 text-down')}>{r.action}</span>
              <span className="font-mono">#{r.id}</span>
              <span className="truncate">{r.descr}</span>
              <span className="ml-auto flex gap-0.5">
                <IconButton label={`Move rule ${r.id} up`} disabled={k === 0} onClick={() => save(rules.map((x, j) => (j === k - 1 ? rules[k] : j === k ? rules[k - 1] : x)))}>
                  <ArrowUp className="size-3" />
                </IconButton>
                <IconButton label={`Move rule ${r.id} down`} disabled={k === rules.length - 1} onClick={() => save(rules.map((x, j) => (j === k + 1 ? rules[k] : j === k ? rules[k + 1] : x)))}>
                  <ArrowDown className="size-3" />
                </IconButton>
                <IconButton label={`${r.enabled ? 'Disable' : 'Enable'} rule ${r.id}`} onClick={() => save(rules.map((x, j) => (j === k ? { ...x, enabled: !x.enabled } : x)))}>
                  <Power className="size-3" />
                </IconButton>
                <IconButton label={`Delete rule ${r.id}`} onClick={() => save(rules.filter((_, j) => j !== k))}>
                  <X className="size-3" />
                </IconButton>
              </span>
            </div>
            <div className="mt-0.5 font-mono text-muted">
              on {r.iface}: {r.src} → {r.dst} {r.proto}
              {r.port !== 'any' ? `/${r.port}` : ''}
              {r.log ? ' log' : ''}
            </div>
          </li>
        ))}
      </ol>
      <details className="rounded border border-line p-2 text-[12.5px]">
        <summary className="cursor-pointer font-medium">Add a rule</summary>
        <form
          className="mt-2 grid grid-cols-2 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const id = draft.id || Math.max(0, ...rules.filter((r) => r.id < 99).map((r) => r.id)) + 1;
            const deny = rules.findIndex((r) => r.id === 99);
            const next = [...rules];
            next.splice(deny >= 0 ? deny : next.length, 0, { ...draft, id });
            save(next);
            setDraft({ ...draft, descr: '', id: 0 });
          }}
        >
          <select aria-label="Action" className={sel} value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value as 'pass' | 'block' })}>
            <option value="pass">pass</option>
            <option value="block">block</option>
          </select>
          <select aria-label="Interface" className={sel} value={draft.iface} onChange={(e) => setDraft({ ...draft, iface: e.target.value })}>
            {aliases.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <Input aria-label="Source" value={draft.src} onChange={(e) => setDraft({ ...draft, src: e.target.value })} placeholder="VLAN20 net / 10.0.0.0/8 / any" />
          <Input aria-label="Destination" value={draft.dst} onChange={(e) => setDraft({ ...draft, dst: e.target.value })} placeholder="10.10.30.20" />
          <select aria-label="Protocol" className={sel} value={draft.proto} onChange={(e) => setDraft({ ...draft, proto: e.target.value as FirewallRule['proto'] })}>
            {['any', 'tcp', 'udp', 'tcp/udp', 'icmp'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <Input aria-label="Port" value={draft.port} onChange={(e) => setDraft({ ...draft, port: e.target.value })} placeholder="443 or 53,88 or any" />
          <Input aria-label="Description" className="col-span-2" value={draft.descr} onChange={(e) => setDraft({ ...draft, descr: e.target.value })} placeholder="Why this rule exists" />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.log} onChange={(e) => setDraft({ ...draft, log: e.target.checked })} /> Log matches
          </label>
          <Button type="submit" size="sm" disabled={!draft.descr.trim()}>
            Add above default deny
          </Button>
        </form>
      </details>
    </div>
  );
}

function Actions({ d, onOpenVm, onPing }: { d: Device; onOpenVm: () => void; onPing: () => void }) {
  const st = useLab();
  const rt = useRuntime();
  const [confirm, setConfirm] = useState<'stop' | 'reboot' | 'delete' | null>(null);
  const [snap, setSnap] = useState('');
  const act = useMutation({
    mutationFn: async (body: { action: 'start' | 'stop' | 'reboot' | 'snapshot'; snapshot_name?: string; confirm?: boolean }) => {
      const job = await rt.api.nodeAction(d.nodeId!, body);
      await awaitJob(job.id);
      return body.action;
    },
    onSuccess: (a) => {
      if (a === 'start' || a === 'stop') st.setPower(d.id, a === 'start' ? 'running' : 'stopped');
    },
  });
  const inBase = !!st.baseline?.devices.find((x) => x.id === d.id);
  const hasGui = !!d.nodeId && d.consoles.some((c) => c === 'rdp' || c === 'vnc');
  return (
    <div className="space-y-4 text-[12.5px]">
      <section className="space-y-2">
        <h4 className="font-semibold">Power</h4>
        <p className="text-muted">{d.nodeId ? 'Sent to the back end as a node action; the result arrives as a job.' : 'Design device: changes the model only.'}</p>
        <div className="flex flex-wrap gap-2">
          {d.power === 'stopped' ? (
            <Button size="sm" variant="primary" busy={act.isPending} onClick={() => (d.nodeId ? act.mutate({ action: 'start' }) : st.setPower(d.id, 'running'))}>
              <Power className="size-3.5" /> Power on
            </Button>
          ) : (
            <>
              <Button size="sm" busy={act.isPending} onClick={() => (d.nodeId ? setConfirm('reboot') : (st.setPower(d.id, 'stopped'), st.setPower(d.id, 'running')))}>
                <RotateCw className="size-3.5" /> Reboot
              </Button>
              <Button size="sm" variant="danger" busy={act.isPending} onClick={() => (d.nodeId ? setConfirm('stop') : st.setPower(d.id, 'stopped'))}>
                <Power className="size-3.5" /> Power off
              </Button>
            </>
          )}
        </div>
        {act.error && <p className="text-down">{errorText(act.error)}</p>}
      </section>
      <section className="space-y-2">
        <h4 className="font-semibold">Consoles</h4>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => st.setInspectorTab('terminal')}>
            <Terminal className="size-3.5" /> Open terminal
          </Button>
          <Button size="sm" disabled={!hasGui} onClick={onOpenVm} data-testid="open-vm">
            <Monitor className="size-3.5" /> Open VM console
          </Button>
        </div>
        {!d.nodeId && <p className="text-muted">Design-only devices have no real console; use the Design CLI in the Terminal tab.</p>}
      </section>
      <section className="space-y-2">
        <h4 className="font-semibold">Test</h4>
        <Button size="sm" onClick={onPing}>
          Ping from {d.name}
        </Button>
      </section>
      {d.nodeId && (
        <section className="space-y-2">
          <h4 className="font-semibold">Snapshot</h4>
          <div className="flex gap-2">
            <Input value={snap} onChange={(e) => setSnap(e.target.value)} placeholder="before-change" aria-label="Snapshot name" />
            <Button size="sm" disabled={!snap.trim()} busy={act.isPending} onClick={() => act.mutate({ action: 'snapshot', snapshot_name: snap.trim() })}>
              Take snapshot
            </Button>
          </div>
        </section>
      )}
      <section className="space-y-2">
        <h4 className="font-semibold">Design</h4>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => st.duplicate([d.id])}>
            Duplicate
          </Button>
          {inBase && (
            <Button
              size="sm"
              onClick={() => {
                const b = st.baseline!.devices.find((x) => x.id === d.id)!;
                st.updateDevice(d.id, { interfaces: structuredClone(b.interfaces), routes: structuredClone(b.routes), firewall: structuredClone(b.firewall), vlans: structuredClone(b.vlans), power: b.power });
              }}
            >
              Reset device to baseline
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={() => setConfirm('delete')}>
            Delete from design
          </Button>
        </div>
      </section>
      <ConfirmDialog
        open={confirm === 'stop' || confirm === 'reboot'}
        onClose={() => setConfirm(null)}
        title={confirm === 'stop' ? `Power off ${d.name}?` : `Reboot ${d.name}?`}
        body={<p>{d.tags?.some((t) => t === 'tier0' || t === 'crown-jewel') ? `${d.name} is a critical system. ` : ''}This is sent to the lab through the back end.</p>}
        confirmLabel={confirm === 'stop' ? 'Power off' : 'Reboot'}
        typed={d.tags?.some((t) => t === 'tier0' || t === 'crown-jewel') ? d.name : undefined}
        onConfirm={() => {
          act.mutate(confirm === 'stop' ? { action: 'stop', confirm: true } : { action: 'reboot' });
          setConfirm(null);
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title={`Delete ${d.name} from the design?`}
        body={<p>{d.origin === 'inventory' ? 'It stays in the real lab; this only removes it from this layout. Refresh from lab brings it back.' : 'Its cables are removed too. Undo with Ctrl+Z.'}</p>}
        confirmLabel="Delete"
        onConfirm={() => {
          st.select({ devices: [d.id], cables: [] });
          st.deleteSelection();
          setConfirm(null);
        }}
      />
    </div>
  );
}

// ---------------- cable inspector ----------------

export function CableInspector({ cable, doc }: { cable: Cable; doc: LabDoc }) {
  const st = useLab();
  const status = cableStatus(doc, cable);
  const [type, setType] = useState<CableType | 'auto'>(cable.type);
  useEffect(() => setType(cable.type), [cable.type]);
  const flows = useFlows(cable.linkId ?? null);
  const a = deviceById(doc, cable.a.device);
  const b = deviceById(doc, cable.b.device);
  return (
    <div className="space-y-3 text-[12.5px]" data-testid="cable-inspector">
      <div>
        <p className="text-[14px] font-semibold">
          {a?.name} {cable.a.port} ↔ {b?.name} {cable.b.port}
        </p>
        <p className="text-muted">
          {CABLE_LABEL[cable.type]}
          {cable.label ? ` · ${cable.label}` : ''}
          {cable.linkId ? ' · reported link' : ' · design cable'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={status.state === 'up' ? 'good' : status.state === 'degraded' ? 'warn' : status.state === 'disabled' ? 'neutral' : 'bad'}>link {status.state}</Badge>
        {status.negotiated && <span className="text-muted">{status.negotiated}</span>}
      </div>
      {status.issues.length > 0 && <IssueList issues={status.issues} />}
      <section className="space-y-1.5">
        <h4 className="font-semibold">Replace cable</h4>
        <div className="flex gap-2">
          <CableTypeSelect value={type} onChange={setType} allowAuto={false} />
          <Button
            size="sm"
            disabled={type === cable.type || type === 'auto'}
            onClick={() => {
              const r = st.replaceCable(cable.id, type as CableType);
              if (!r.ok) st.setError({ title: `A ${CABLE_LABEL[type as CableType].toLowerCase()} cable does not fit these ports`, issues: r.issues });
            }}
          >
            Replace
          </Button>
        </div>
      </section>
      {cable.type === 'wan' && (
        <section className="grid grid-cols-3 gap-2">
          <Field label="Provider">
            <Input defaultValue={cable.wan?.provider ?? ''} onBlur={(e) => st.updateCable(cable.id, { wan: { ...cable.wan, provider: e.target.value } })} />
          </Field>
          <Field label="Mb/s">
            <Input type="number" defaultValue={cable.wan?.bandwidthMbps ?? ''} onBlur={(e) => st.updateCable(cable.id, { wan: { ...cable.wan, bandwidthMbps: Number(e.target.value) || undefined } })} />
          </Field>
          <Field label="Latency ms">
            <Input type="number" defaultValue={cable.wan?.latencyMs ?? ''} onBlur={(e) => st.updateCable(cable.id, { wan: { ...cable.wan, latencyMs: Number(e.target.value) || undefined } })} />
          </Field>
        </section>
      )}
      <CablePhysical cable={cable} />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            const r = linkTestSummary(doc, cable.id);
            st.setError({ title: r.title, issues: r.issues, tone: r.ok ? 'ok' : 'error' });
          }}
          data-testid="cable-test"
        >
          Test link
        </Button>
        <Button size="sm" onClick={() => st.updateCable(cable.id, { disabled: !cable.disabled })}>
          {cable.disabled ? 'Enable (plug in)' : 'Disable (unplug)'}
        </Button>
        {cable.bend && (
          <Button size="sm" onClick={() => st.updateCable(cable.id, { bend: undefined })}>
            Straighten
          </Button>
        )}
        <Button size="sm" variant="danger" onClick={() => st.removeCable(cable.id)}>
          Remove cable
        </Button>
      </div>
      <p className="text-[11.5px] text-muted">To move an end to another port, select the cable and drag one of its square end handles onto a device. Drag the round handle to route it.</p>
      {cable.linkId && (
        <section>
          <h4 className="mb-1 font-semibold">Flows on this link</h4>
          {flows.data?.length ? (
            <ul className="space-y-0.5 font-mono text-[11px]">
              {flows.data.slice(0, 12).map((f, k) => (
                <li key={k} className={f.verdict === 'denied' ? 'text-down' : ''}>
                  {f.src} → {f.dst}:{f.port}/{f.proto} {f.verdict} {relTime(f.observed_at)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">{flows.isLoading ? 'Loading…' : flows.error ? errorText(flows.error) : 'No flows reported.'}</p>
          )}
        </section>
      )}
    </div>
  );
}

// ---------------- shell ----------------

export function DeviceInspector({ device: d, doc, lab, onPing }: { device: Device; doc: LabDoc; lab: MockLab | null; onPing: (id: string) => void }) {
  const tab = useLab((s) => s.inspectorTab);
  const setTab = useLab((s) => s.setInspectorTab);
  const [vm, setVm] = useState(false);
  const t = DEVICE_TABS.some(([k]) => k === tab) ? tab : 'overview';
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Device inspector" className="flex flex-wrap gap-x-0.5 border-b border-line px-1">
        {DEVICE_TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={t === k} onClick={() => setTab(k)} className={cx('-mb-px border-b-2 px-2 py-1.5 text-[12px]', t === k ? 'border-action text-text' : 'border-transparent text-muted hover:text-text')} data-testid={`tab-${k}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3" role="tabpanel" aria-label={DEVICE_TABS.find(([k]) => k === t)?.[1]}>
        {t === 'overview' && <Overview d={d} doc={doc} />}
        {t === 'ports' && <Ports d={d} doc={doc} />}
        {t === 'interfaces' && <Interfaces d={d} />}
        {t === 'config' && <Config d={d} />}
        {t === 'terminal' && <TerminalTab d={d} />}
        {t === 'logs' && <Logs d={d} lab={lab} />}
        {t === 'packets' && <Packets d={d} doc={doc} />}
        {t === 'services' && <ServicesTab d={d} doc={doc} />}
        {t === 'routes' && <Routes d={d} />}
        {t === 'vlans' && <Vlans d={d} doc={doc} />}
        {t === 'firewall' && <Firewall d={d} />}
        {t === 'actions' && <Actions d={d} onOpenVm={() => setVm(true)} onPing={() => onPing(d.id)} />}
      </div>
      <VmDialog device={d} open={vm} onClose={() => setVm(false)} />
    </div>
  );
}

export function VmDialog({ device: d, open, onClose }: { device: Device; open: boolean; onClose: () => void }) {
  const rt = useRuntime();
  return (
    <Dialog open={open} onClose={onClose} title={`${d.name}: VM console`} wide>
      <div className="space-y-2">
        <p className="text-[12px] text-muted">{rt.mock ? 'Simulated lab: graphical consoles are represented by the device shell.' : 'Remote console brokered by the back end (Guacamole). Credentials never reach the browser.'}</p>
        <div className="h-[60vh] overflow-hidden rounded border border-line" data-testid="vm-console">
          {d.nodeId && open ? <ConsoleView nodeId={d.nodeId} protocols={['rdp', 'vnc']} /> : null}
        </div>
      </div>
    </Dialog>
  );
}
