'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, cx, Input } from '@/components/ui';
import { MODEL_BY_KEY as MODELS } from '@/lab/catalog';
import { MODEL_BY_KEY, modelOf } from '@/lab/catalog';
import { isIp } from '@/lab/net';
import { controlPlane, poeUsage } from '@/lab/protocols';
import { aclEntryText, l3Ifaces } from '@/lab/simulate';
import { useLab } from '@/lab/store';
import type { Cable, Device, DhcpPool, LabDoc, WirelessConfig } from '@/lab/types';
import { deviceById } from '@/lab/validate';

const sel = 'h-8 rounded-[5px] border border-line-strong bg-ink px-2 text-[12.5px]';

function Section({ title, children, testid }: { title: string; children: React.ReactNode; testid?: string }) {
  return (
    <section className="space-y-1.5 border-b border-line pb-3 last:border-0" data-testid={testid}>
      <h4 className="font-semibold">{title}</h4>
      {children}
    </section>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

/** Layer 2/3 services and management hardening for one device (the Packet Tracer "Config" tab, plus what CML/EVE-NG labs exercise). */
export function ServicesTab({ d, doc }: { d: Device; doc: LabDoc }) {
  const st = useLab();
  const cp = useMemo(() => controlPlane(doc), [doc]);
  const host = modelOf(d).forwarding === 'host';
  const name = (id: string) => deviceById(doc, id)?.name ?? id;
  const bridge = cp.stp[d.id];
  const channels = cp.channels.filter((c) => c.device === d.id);
  const ospfIfs = d.interfaces.filter((i) => i.ospf);
  const neighbors = cp.ospf.filter((n) => n.device === d.id);
  const hsrp = cp.hsrp.filter((g) => g.members.some((m) => m.device === d.id));
  const poe = MODEL_BY_KEY[d.model]?.poeBudgetW ? poeUsage(doc, d.id) : null;
  const sec = d.security ?? { ssh: false, telnet: true, enableSecret: false };
  const nic = d.interfaces.find((i) => (i.type === 'copper' || i.type === 'virtual' || i.type === 'wireless') && !i.parent);
  const [dhcpMsg, setDhcpMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [wlMsg, setWlMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const aps = doc.devices.filter((x) => x.kind === 'ap');
  const routes = cp.routes[d.id] ?? [];

  return (
    <div className="space-y-3 text-[12.5px]" data-testid="services-tab">
      {d.powerReason && <p className="rounded bg-down/10 p-2 text-down">Powered off: {d.powerReason}.</p>}

      {host && nic && (
        <Section title="DHCP client" testid="svc-dhcp-client">
          <p className="text-muted">
            {nic.name}: {nic.dhcp ? 'DHCP' : 'static'} {nic.ip ? `${nic.ip}/${nic.prefix}` : 'no address'}
            {nic.gateway ? `, gateway ${nic.gateway}` : ''}
          </p>
          <Button
            size="sm"
            onClick={() => {
              const r = st.renewDhcp(d.id, nic.name);
              setDhcpMsg(r.ok ? { ok: true, text: `Leased ${r.ip}/${r.prefix} from ${r.server}${r.via ? ` via ${r.via}` : ''}.` } : { ok: false, text: `${r.reason}${r.fix ? ` Fix: ${r.fix}` : ''}` });
            }}
            data-testid="dhcp-renew"
          >
            Renew lease (DORA)
          </Button>
          {dhcpMsg && <p className={dhcpMsg.ok ? 'text-healthy' : 'text-down'}>{dhcpMsg.text}</p>}
        </Section>
      )}

      {(d.kind === 'ap' || d.interfaces.some((i) => i.type === 'wireless')) && (
        <Section title={d.kind === 'ap' ? 'Wireless (SSID)' : 'Wireless client'} testid="svc-wireless">
          <WirelessEditor value={d.wireless} onChange={(w) => st.updateDevice(d.id, { wireless: w })} />
          {d.kind !== 'ap' && aps.length > 0 && (
            <div className="flex items-center gap-2">
              {aps.map((ap) => (
                <Button
                  key={ap.id}
                  size="sm"
                  onClick={() => {
                    const r = st.associateWireless(d.id, ap.id);
                    setWlMsg(r.ok ? { ok: true, text: `Associated with ${ap.name}.` } : { ok: false, text: r.reason ?? 'Failed.' });
                  }}
                >
                  Join {ap.name}
                </Button>
              ))}
            </div>
          )}
          {wlMsg && <p className={wlMsg.ok ? 'text-healthy' : 'text-down'}>{wlMsg.text}</p>}
          {d.kind === 'ap' && <p className="text-muted">{doc.cables.filter((c) => c.type === 'virtual' && (c.a.device === d.id || c.b.device === d.id)).length} clients associated.</p>}
        </Section>
      )}

      {bridge && (
        <Section title="Spanning tree" testid="svc-stp">
          <div className="flex flex-wrap items-center gap-3">
            <Toggle label="Enabled" checked={bridge.enabled} onChange={(v) => st.updateDevice(d.id, { stp: { ...d.stp, enabled: v, priority: d.stp?.priority ?? 32768 } })} />
            <label className="flex items-center gap-1">
              Priority
              <select className={sel} value={d.stp?.priority ?? 32768} onChange={(e) => st.updateDevice(d.id, { stp: { ...d.stp, enabled: d.stp?.enabled ?? true, priority: Number(e.target.value) } })} aria-label="Bridge priority">
                {Array.from({ length: 16 }, (_, k) => k * 4096).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <select className={sel} value={d.stp?.mode ?? 'rapid-pvst'} onChange={(e) => st.updateDevice(d.id, { stp: { enabled: d.stp?.enabled ?? true, priority: d.stp?.priority ?? 32768, ...d.stp, mode: e.target.value as 'pvst' } })} aria-label="STP mode">
              <option value="pvst">PVST+</option>
              <option value="rapid-pvst">Rapid PVST+</option>
              <option value="mst">MST</option>
            </select>
            <Toggle label="BPDU guard on PortFast ports" checked={!!d.stp?.bpduGuardDefault} onChange={(v) => st.updateDevice(d.id, { stp: { enabled: d.stp?.enabled ?? true, priority: d.stp?.priority ?? 32768, ...d.stp, bpduGuardDefault: v } })} />
            {bridge.enabled && <Badge tone={bridge.isRoot ? 'good' : 'neutral'}>{bridge.isRoot ? 'Root bridge' : `Root port ${bridge.rootPort ?? '-'}, cost ${bridge.rootCost}`}</Badge>}
          </div>
          {bridge.enabled && (
            <table className="w-full font-mono text-[11px]">
              <tbody>
                {Object.entries(bridge.ports)
                  .filter(([, p]) => p.role !== 'disabled')
                  .map(([port, p]) => (
                    <tr key={port} className="border-b border-line/60">
                      <td className="py-0.5">{port}</td>
                      <td>{p.role}</td>
                      <td className={p.state === 'blocking' ? 'text-degraded' : 'text-healthy'}>{p.role === 'root-inconsistent' ? 'blocking (root-inconsistent)' : p.state}</td>
                      <td className="text-muted">cost {p.cost}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
          {cp.storms.some((loop) => loop.includes(d.id)) && <p className="text-down">Broadcast storm: this switch is in a loop with spanning tree off.</p>}
        </Section>
      )}

      {d.kind === 'switch' && <SwitchServices d={d} />}

      {channels.length > 0 && (
        <Section title="EtherChannel" testid="svc-etherchannel">
          {channels.map((c) => (
            <p key={c.group} className={c.ok ? '' : 'text-down'}>
              Po{c.group} ({c.protocol}) {c.members.join(', ')} to {c.peer ? name(c.peer) : '?'}: {c.ok ? 'bundled' : c.reason}
            </p>
          ))}
        </Section>
      )}

      {!host && d.kind !== 'switch' && (
        <Section title="OSPF" testid="svc-ospf">
          {d.ospfProcess || ospfIfs.length ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span>Router ID {cp.routerIds[d.id] ?? '-'}</span>
                <Toggle label="Originate default route" checked={!!d.ospfProcess?.defaultOriginate} onChange={(v) => st.updateDevice(d.id, { ospfProcess: { ...(d.ospfProcess ?? {}), defaultOriginate: v } })} />
              </div>
              <table className="w-full font-mono text-[11px]">
                <tbody>
                  {l3Ifaces(d).map((i) => (
                    <tr key={i.name} className="border-b border-line/60">
                      <td className="py-0.5">{i.name}</td>
                      <td>
                        <label className="flex items-center gap-1">
                          <input type="checkbox" checked={!!i.ospf} onChange={(e) => st.updateIface(d.id, i.name, { ospf: e.target.checked ? { area: 0 } : undefined })} aria-label={`OSPF on ${i.name}`} />
                          area
                          <input className="w-10 rounded border border-line bg-ink px-1" type="number" disabled={!i.ospf} value={i.ospf?.area ?? 0} onChange={(e) => st.updateIface(d.id, i.name, { ospf: { ...(i.ospf ?? { area: 0 }), area: Number(e.target.value) } })} aria-label={`Area on ${i.name}`} />
                        </label>
                      </td>
                      <td>
                        <label className="flex items-center gap-1">
                          <input type="checkbox" disabled={!i.ospf} checked={!!i.ospf?.passive} onChange={(e) => st.updateIface(d.id, i.name, { ospf: { ...i.ospf!, passive: e.target.checked } })} /> passive
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {neighbors.map((n) => (
                <p key={`${n.iface}-${n.peer}`} className={n.state === 'FULL' ? 'text-healthy' : 'text-down'}>
                  {n.iface} ↔ {name(n.peer)} {n.peerIface}: {n.state}
                  {n.reason ? ` (${n.reason})` : ''}
                </p>
              ))}
            </>
          ) : (
            <Button size="sm" onClick={() => st.updateDevice(d.id, { ospfProcess: {} })}>
              Enable OSPF process
            </Button>
          )}
          {routes.some((r) => r.kind === 'ospf') && (
            <ul className="font-mono text-[11px] text-muted">
              {routes
                .filter((r) => r.kind === 'ospf')
                .map((r) => (
                  <li key={r.prefix}>
                    {r.code} {r.prefix} [{r.ad}/{r.metric}] via {r.via}
                  </li>
                ))}
            </ul>
          )}
        </Section>
      )}

      {(d.kind === 'router' || d.kind === 'switch' || hsrp.length > 0) && l3Ifaces(d).length > 0 && (
        <Section title="First-hop redundancy (HSRP, VRRP, GLBP)" testid="svc-hsrp">
          {l3Ifaces(d).map((i) => (
            <div key={i.name} className="flex flex-wrap items-center gap-1.5">
              <span className="w-20 font-mono text-[11px]">{i.name}</span>
              <select className={cx(sel, '!h-7')} value={i.hsrp?.proto ?? 'hsrp'} onChange={(e) => i.hsrp && st.updateIface(d.id, i.name, { hsrp: { ...i.hsrp, proto: e.target.value as 'hsrp' } })} aria-label={`FHRP protocol on ${i.name}`}>
                <option value="hsrp">HSRP</option>
                <option value="vrrp">VRRP</option>
                <option value="glbp">GLBP</option>
              </select>
              <Input className="!h-7 !w-28" placeholder="virtual IP" defaultValue={i.hsrp?.vip ?? ''} aria-label={`HSRP virtual IP on ${i.name}`} onBlur={(e) => st.updateIface(d.id, i.name, { hsrp: isIp(e.target.value) ? { group: i.hsrp?.group ?? 1, vip: e.target.value, priority: i.hsrp?.priority ?? 100, preempt: i.hsrp?.preempt ?? false, proto: i.hsrp?.proto } : undefined })} />
              <Input className="!h-7 !w-16" type="number" disabled={!i.hsrp} defaultValue={i.hsrp?.priority ?? 100} aria-label={`HSRP priority on ${i.name}`} onBlur={(e) => i.hsrp && st.updateIface(d.id, i.name, { hsrp: { ...i.hsrp, priority: Number(e.target.value) || 100 } })} />
              <Toggle label="preempt" checked={!!i.hsrp?.preempt} onChange={(v) => i.hsrp && st.updateIface(d.id, i.name, { hsrp: { ...i.hsrp, preempt: v } })} />
            </div>
          ))}
          {hsrp.map((g) => (
            <p key={g.key} className={g.issues.length ? 'text-degraded' : ''}>
              {g.proto.toUpperCase()} group {g.group} {g.vip}: {g.proto === 'vrrp' ? 'master' : 'active'} {g.active ? name(g.active.device) : 'none'}, {g.proto === 'vrrp' ? 'backup' : 'standby'} {g.standby ? name(g.standby.device) : 'none'}
              {g.issues.length ? `. ${g.issues.join(' ')}` : ''}
            </p>
          ))}
        </Section>
      )}

      {(d.acls?.length || l3Ifaces(d).some((i) => i.aclIn || i.aclOut)) && (
        <Section title="Access lists" testid="svc-acl">
          {(d.acls ?? []).map((a) => (
            <div key={a.name}>
              <p className="font-medium">
                {a.type === 'standard' ? 'Standard' : 'Extended'} {a.name}
                <span className="ml-2 font-normal text-muted">
                  {d.interfaces
                    .filter((i) => i.aclIn === a.name || i.aclOut === a.name)
                    .map((i) => `${i.name} ${i.aclIn === a.name ? 'in' : 'out'}`)
                    .join(', ') || 'not applied'}
                </span>
              </p>
              <ul className="font-mono text-[11px] text-muted">
                {a.entries.map((e) => (
                  <li key={e.seq}>{e.remark ? `${e.seq} remark ${e.remark}` : aclEntryText(a, e)}</li>
                ))}
                <li className="text-faint">(implicit deny any)</li>
              </ul>
            </div>
          ))}
          {d.interfaces.filter((i) => (i.aclIn && !d.acls?.some((a) => a.name === i.aclIn)) || (i.aclOut && !d.acls?.some((a) => a.name === i.aclOut))).map((i) => (
            <p key={i.name} className="text-degraded">
              {i.name} references ACL {i.aclIn ?? i.aclOut}, which is not defined: it permits everything.
            </p>
          ))}
          <p className="text-[11px] text-muted">Edit ACLs in the Design CLI: ip access-list extended NAME, then ip access-group NAME in|out on an interface.</p>
        </Section>
      )}

      {(d.eigrpProcess || d.interfaces.some((i) => i.eigrp)) && (
        <Section title="EIGRP" testid="svc-eigrp">
          <p>
            AS {d.eigrpProcess?.as ?? d.interfaces.find((i) => i.eigrp)?.eigrp?.as} on {d.interfaces.filter((i) => i.eigrp).map((i) => `${i.name}${i.eigrp!.passive ? ' (passive)' : ''}`).join(', ')}
          </p>
          {cp.eigrp
            .filter((n) => n.device === d.id)
            .map((n) => (
              <p key={`${n.iface}-${n.peer}`} className={n.up ? 'text-healthy' : 'text-down'}>
                {n.iface} ↔ {name(n.peer)} {n.peerIp}: {n.up ? 'neighbour up' : n.reason}
              </p>
            ))}
          {routes.some((r) => r.kind === 'eigrp') && (
            <ul className="font-mono text-[11px] text-muted">
              {routes
                .filter((r) => r.kind === 'eigrp')
                .map((r) => (
                  <li key={r.prefix}>
                    D {r.prefix} [90/{r.metric}] via {r.via}
                  </li>
                ))}
            </ul>
          )}
        </Section>
      )}

      {(d.kind === 'router' || d.kind === 'firewall') && (
        <Section title="NAT (PAT overload)" testid="svc-nat">
          <label className="flex items-center gap-1">
            Outside interface
            <select className={sel} value={d.natOverload?.outside ?? ''} onChange={(e) => st.updateDevice(d.id, { natOverload: e.target.value ? { outside: e.target.value } : undefined })} aria-label="NAT outside interface">
              <option value="">NAT off</option>
              {l3Ifaces(d).map((i) => (
                <option key={i.name} value={i.name}>
                  {i.name} ({i.ip})
                </option>
              ))}
            </select>
          </label>
          {d.natOverload && (
            <div className="flex flex-wrap gap-2">
              {l3Ifaces(d)
                .filter((i) => i.name !== d.natOverload!.outside)
                .map((i) => (
                  <Toggle key={i.name} label={`${i.name} inside`} checked={i.nat === 'inside'} onChange={(v) => st.updateIface(d.id, i.name, { nat: v ? 'inside' : undefined })} />
                ))}
            </div>
          )}
          {d.staticNat?.length ? (
            <ul className="font-mono text-[11px] text-muted">
              {d.staticNat.map((n) => (
                <li key={n.inside}>
                  static {n.inside} ↔ {n.outside}
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
      )}

      {!host && l3Ifaces(d).length > 0 && (
        <Section title="DHCP relay (ip helper-address)">
          {l3Ifaces(d).map((i) => (
            <div key={i.name} className="flex items-center gap-1.5">
              <span className="w-24 font-mono text-[11px]">{i.name}</span>
              <Input className="!h-7 !w-32" placeholder="DHCP server IP" defaultValue={i.helper ?? ''} aria-label={`Helper on ${i.name}`} onBlur={(e) => st.updateIface(d.id, i.name, { helper: isIp(e.target.value) ? e.target.value : undefined })} />
            </div>
          ))}
        </Section>
      )}

      {(d.kind === 'server' || d.kind === 'router' || d.kind === 'firewall' || d.dhcpPools?.length) && <DhcpPools d={d} />}

      {poe && (
        <Section title="Power over Ethernet" testid="svc-poe">
          <div className="h-2 w-full overflow-hidden rounded bg-pane-2">
            <div className={cx('h-full', poe.used / poe.budget > 0.8 ? 'bg-degraded' : 'bg-healthy')} style={{ width: `${Math.min(100, (poe.used / poe.budget) * 100)}%` }} />
          </div>
          <p>
            {poe.used.toFixed(1)} W of {poe.budget} W allocated
          </p>
          <ul className="font-mono text-[11px] text-muted">
            {poe.ports.map((p) => (
              <li key={p.port}>
                {p.port}: {p.device} {p.watts.toFixed(1)} W
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(d.kind === 'router' || d.kind === 'switch' || d.kind === 'firewall') && (
        <Section title="Management hardening" testid="svc-security">
          <div className="flex flex-wrap gap-3">
            <Toggle label="SSH v2" checked={sec.ssh} onChange={(v) => st.updateDevice(d.id, { security: { ...sec, ssh: v } })} />
            <Toggle label="Telnet allowed" checked={sec.telnet} onChange={(v) => st.updateDevice(d.id, { security: { ...sec, telnet: v } })} />
            <Toggle label="Enable secret set" checked={sec.enableSecret} onChange={(v) => st.updateDevice(d.id, { security: { ...sec, enableSecret: v } })} />
          </div>
          <Input placeholder="Login banner (MOTD)" defaultValue={sec.banner ?? ''} onBlur={(e) => st.updateDevice(d.id, { security: { ...sec, banner: e.target.value || undefined } })} aria-label="Banner" />
        </Section>
      )}
    </div>
  );
}

function WirelessEditor({ value, onChange }: { value?: WirelessConfig; onChange: (w: WirelessConfig | undefined) => void }) {
  const v = value ?? { ssid: '', security: 'wpa2' as const };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Input className="!h-7 !w-32" placeholder="SSID" defaultValue={v.ssid} aria-label="SSID" onBlur={(e) => onChange(e.target.value ? { ...v, ssid: e.target.value } : undefined)} />
      <select className={sel} value={v.security} onChange={(e) => onChange({ ...v, security: e.target.value as WirelessConfig['security'] })} aria-label="Wireless security">
        <option value="open">Open</option>
        <option value="wpa2">WPA2-PSK</option>
        <option value="wpa3">WPA3-SAE</option>
      </select>
      {v.security !== 'open' && <Input className="!h-7 !w-32" placeholder="Passphrase" defaultValue={v.key ?? ''} aria-label="Passphrase" onBlur={(e) => onChange({ ...v, key: e.target.value })} />}
    </div>
  );
}

function DhcpPools({ d }: { d: Device }) {
  const st = useLab();
  const pools = d.dhcpPools ?? [];
  const [draft, setDraft] = useState<DhcpPool>({ name: '', network: '', start: '', end: '', gateway: '' });
  const set = (p: DhcpPool[]) => st.updateDevice(d.id, { dhcpPools: p });
  return (
    <Section title="DHCP server pools" testid="svc-dhcp-server">
      {pools.map((p) => (
        <div key={p.name} className="flex items-center gap-2 font-mono text-[11px]">
          <span className="min-w-0 flex-1">
            {p.name}: {p.network} {p.start}-{p.end} gw {p.gateway ?? '-'} dns {(p.dns ?? []).join(' ')}
          </span>
          <Button size="sm" variant="danger" onClick={() => set(pools.filter((x) => x.name !== p.name))}>
            Remove
          </Button>
        </div>
      ))}
      <div className="grid grid-cols-3 gap-1">
        <Input className="!h-7" placeholder="name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Pool name" />
        <Input className="!h-7" placeholder="10.1.1.0/24" value={draft.network} onChange={(e) => setDraft({ ...draft, network: e.target.value })} aria-label="Pool network" />
        <Input className="!h-7" placeholder="gateway" value={draft.gateway} onChange={(e) => setDraft({ ...draft, gateway: e.target.value })} aria-label="Pool gateway" />
        <Input className="!h-7" placeholder="first address" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} aria-label="Pool start" />
        <Input className="!h-7" placeholder="last address" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} aria-label="Pool end" />
        <Button size="sm" disabled={!draft.name || !/\/\d+$/.test(draft.network) || !isIp(draft.start) || !isIp(draft.end)} onClick={() => (set([...pools.filter((x) => x.name !== draft.name), { ...draft, gateway: draft.gateway || undefined }]), setDraft({ name: '', network: '', start: '', end: '', gateway: '' }))}>
          Add pool
        </Button>
      </div>
    </Section>
  );
}

/** Physical layer and impairment settings for a cable (CML-style link conditioning). */
export function CablePhysical({ cable }: { cable: Cable }) {
  const st = useLab();
  const c = cable.cond ?? { enabled: false };
  const num = (v: string) => (v === '' ? undefined : Math.max(0, Number(v)));
  return (
    <section className="space-y-2" data-testid="cable-physical">
      <h4 className="font-semibold">Physical</h4>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1">
          Length (m)
          <Input className="!h-7 !w-20" type="number" min={0} defaultValue={cable.lengthM ?? ''} key={`len-${cable.id}-${cable.lengthM}`} aria-label="Cable length in metres" onBlur={(e) => st.updateCable(cable.id, { lengthM: num(e.target.value) })} />
        </label>
        {cable.type === 'fiber' && (
          <select className={sel} value={cable.fiberMode ?? 'mmf'} onChange={(e) => st.updateCable(cable.id, { fiberMode: e.target.value as 'mmf' | 'smf' })} aria-label="Fibre mode">
            <option value="mmf">Multimode (OM4)</option>
            <option value="smf">Single-mode (OS2)</option>
          </select>
        )}
      </div>
      <h4 className="font-semibold">Link conditioning</h4>
      <Toggle label="Impair this link" checked={!!c.enabled} onChange={(v) => st.updateCable(cable.id, { cond: { ...c, enabled: v } })} />
      <div className="grid grid-cols-4 gap-1.5">
        {(
          [
            ['latencyMs', 'Latency ms'],
            ['jitterMs', 'Jitter ms'],
            ['lossPct', 'Loss %'],
            ['bandwidthMbps', 'Mb/s cap'],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="text-[11px] text-muted">
            {label}
            <Input className="!h-7" type="number" min={0} disabled={!c.enabled} defaultValue={c[k] ?? ''} key={`${k}-${cable.id}-${c[k]}`} aria-label={label} onBlur={(e) => st.updateCable(cable.id, { cond: { ...c, [k]: num(e.target.value) } })} />
          </label>
        ))}
      </div>
      <p className="text-[11px] text-muted">Applied to packet simulation: loss drops packets, latency and jitter add delay, and a slow cap shows as a delayed packet.</p>
    </section>
  );
}

const parseVlanList = (t: string) =>
  t
    .split(',')
    .flatMap((x) => (x.includes('-') ? Array.from({ length: Number(x.split('-')[1]) - Number(x.split('-')[0]) + 1 }, (_, k) => Number(x.split('-')[0]) + k) : [Number(x)]))
    .filter((v) => Number.isInteger(v) && v > 0 && v < 4095);

/** Layer 3 switching, VTP, DHCP snooping and DAI for a switch. */
function SwitchServices({ d }: { d: Device }) {
  const st = useLab();
  const vtp = d.vtp ?? { mode: 'server' as const, domain: '', revision: 0 };
  const sn = d.dhcpSnooping ?? { enabled: false, vlans: [] };
  const err = d.interfaces.filter((i) => i.errDisabled);
  const l3 = MODELS[d.model]?.key === 'c9300-24t' || !!d.ipRouting;
  return (
    <Section title="Switching services" testid="svc-switching">
      <div className="flex flex-wrap items-center gap-3">
        <span title={l3 ? undefined : 'This model is a layer 2 access switch; ip routing is mainly for the Catalyst 9300 here.'}>
          <Toggle label="ip routing (layer 3 switch)" checked={!!d.ipRouting} onChange={(v) => st.updateDevice(d.id, { ipRouting: v })} />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">VTP</span>
        <select className={sel} value={d.vtp ? vtp.mode : 'off'} onChange={(e) => st.updateDevice(d.id, { vtp: { ...vtp, mode: e.target.value as typeof vtp.mode, revision: e.target.value === 'transparent' || e.target.value === 'off' ? 0 : vtp.revision } })} aria-label="VTP mode">
          <option value="server">server</option>
          <option value="client">client</option>
          <option value="transparent">transparent</option>
          <option value="off">off</option>
        </select>
        <Input className="!h-7 !w-28" placeholder="domain" defaultValue={vtp.domain} key={`vtpd-${vtp.domain}`} aria-label="VTP domain" onBlur={(e) => st.updateDevice(d.id, { vtp: { ...vtp, domain: e.target.value.trim() } })} />
        <span className="text-muted">revision {vtp.revision}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Toggle label="DHCP snooping" checked={sn.enabled} onChange={(v) => st.updateDevice(d.id, { dhcpSnooping: { ...sn, enabled: v } })} />
        <Input className="!h-7 !w-32" placeholder="VLANs e.g. 10,20" defaultValue={sn.vlans.join(',')} key={`snv-${sn.vlans.join(',')}`} aria-label="DHCP snooping VLANs" onBlur={(e) => st.updateDevice(d.id, { dhcpSnooping: { ...sn, vlans: parseVlanList(e.target.value) } })} />
        <span className="font-medium">DAI VLANs</span>
        <Input className="!h-7 !w-28" placeholder="10,20" defaultValue={(d.dai?.vlans ?? []).join(',')} key={`dai-${(d.dai?.vlans ?? []).join(',')}`} aria-label="DAI VLANs" onBlur={(e) => st.updateDevice(d.id, { dai: { vlans: parseVlanList(e.target.value) } })} />
      </div>
      <p className="text-[11px] text-muted">Trusted ports: {d.interfaces.filter((i) => i.dhcpTrust).map((i) => i.name).join(', ') || 'none'} (set per port in the Physical tab or with ip dhcp snooping trust).</p>
      {err.length > 0 && (
        <div className="space-y-1 rounded bg-[#ff7a1a]/10 p-2" data-testid="svc-err-disabled">
          {err.map((i) => (
            <div key={i.name} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="font-mono">{i.name}</span> err-disabled: {i.errDisabled}
              </span>
              <Button
                size="sm"
                onClick={() => {
                  st.updateIface(d.id, i.name, { shutdown: true });
                  st.updateIface(d.id, i.name, { shutdown: false });
                }}
              >
                Recover
              </Button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
