'use client';

import { Trash } from 'lucide-react';
import { useEffect, useState } from 'react';
import { diffDocs, type DiffItem } from '@/lab/diff';
import { inCidr, isIp, parseCidr } from '@/lab/net';
import { useLab, type SavedLayout } from '@/lab/store';
import type { CableType, LabSite } from '@/lab/types';
import { CABLE_LABEL, cableOnPort, checkConnection, deviceById } from '@/lab/validate';
import { Button, cx, Dialog, Field, IconButton, Input, Kbd, relTime, Tabs } from '@/components/ui';
import { CableTypeSelect, IssueList } from './Pickers';

const sel = 'h-8 w-full rounded-[5px] border border-line-strong bg-ink px-2 text-[12.5px]';

export function LayoutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const st = useLab();
  const [name, setName] = useState('');
  const [list, setList] = useState<SavedLayout[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setList(st.layouts());
      setName(st.layoutName ?? '');
      setMsg(null);
    }
  }, [open, st]);
  return (
    <Dialog open={open} onClose={onClose} title="Saved lab layouts" wide>
      <div className="space-y-4">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const ok = st.saveLayout(name);
            setMsg(ok ? `Saved "${name.trim()}".` : 'Could not save: browser storage is full or blocked.');
            setList(st.layouts());
          }}
        >
          <Field label="Save the current canvas as">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="HQ redesign v2" aria-label="Layout name" data-testid="layout-name" />
          </Field>
          <Button type="submit" variant="primary" disabled={!name.trim()} data-testid="layout-save">
            Save layout
          </Button>
        </form>
        {msg && (
          <p role="status" className="text-[12.5px] text-muted">
            {msg}
          </p>
        )}
        <p className="text-[12px] text-muted">Layouts keep every device, cable, setting and position. They are stored in this browser; the lab API has no layout endpoint yet, so they do not follow you to another computer.</p>
        {list.length ? (
          <ul className="divide-y divide-line rounded border border-line" data-testid="layout-list">
            {list.map((l) => (
              <li key={l.name} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {l.name} {st.layoutName === l.name && <span className="text-[11.5px] text-action">(current)</span>}
                  </p>
                  <p className="text-[12px] text-muted">
                    {l.doc.devices.length} devices · {l.doc.cables.length} cables · saved {relTime(l.savedAt)}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    st.loadLayout(l.name);
                    onClose();
                  }}
                  data-testid={`layout-load-${l.name}`}
                >
                  Load
                </Button>
                <IconButton
                  label={`Delete layout ${l.name}`}
                  onClick={() => {
                    st.deleteLayout(l.name);
                    setList(st.layouts());
                  }}
                >
                  <Trash className="size-4" />
                </IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">No saved layouts yet.</p>
        )}
      </div>
    </Dialog>
  );
}

type StructTab = 'sites' | 'racks' | 'vlans' | 'subnets' | 'wan' | 'cloud';

export function StructureDialog({ open, onClose, initialTab = 'sites' }: { open: boolean; onClose: () => void; initialTab?: StructTab }) {
  const st = useLab();
  const doc = st.doc!;
  const [tab, setTab] = useState<StructTab>(initialTab);
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);
  return (
    <Dialog open={open} onClose={onClose} title="Sites, racks, VLANs and connections" wide>
      <Tabs
        tabs={[
          { key: 'sites', label: 'Sites' },
          { key: 'racks', label: 'Racks' },
          { key: 'vlans', label: 'VLANs' },
          { key: 'subnets', label: 'Subnets' },
          { key: 'wan', label: 'WAN link' },
          { key: 'cloud', label: 'Cloud connection' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="max-h-[60vh] overflow-auto pt-3">
        {tab === 'sites' && <Sites />}
        {tab === 'racks' && <Racks />}
        {tab === 'vlans' && <Vlans />}
        {tab === 'subnets' && <Subnets />}
        {tab === 'wan' && <WanLink onDone={onClose} />}
        {tab === 'cloud' && <CloudLink onDone={onClose} />}
      </div>
      <p className="mt-2 text-[11.5px] text-muted">{doc.devices.length} devices, {doc.sites.length} sites, {doc.racks.length} racks, {doc.vlans.length} VLANs.</p>
    </Dialog>
  );
}

function Sites() {
  const st = useLab();
  const doc = st.doc!;
  const [name, setName] = useState('');
  const [cidr, setCidr] = useState('');
  const [kind, setKind] = useState<LabSite['kind']>('branch');
  const [err, setErr] = useState<string | null>(null);
  const selected = st.selection.devices;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line rounded border border-line text-[12.5px]">
        {doc.sites.map((s) => (
          <li key={s.id} className="flex items-center justify-between px-3 py-1.5">
            <span>
              <span className="font-medium">{s.name}</span> <span className="font-mono text-muted">{s.cidr}</span> <span className="text-faint">{s.kind}</span>
            </span>
            <span className="text-muted">{doc.devices.filter((d) => d.siteId === s.id).length} devices</span>
          </li>
        ))}
      </ul>
      <form
        className="grid grid-cols-2 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return setErr('Name the site.');
          if (cidr && !parseCidr(cidr)) return setErr('CIDR must look like 10.40.0.0/16.');
          st.addSite({ name: name.trim(), cidr: cidr || undefined, kind }, selected);
          setName('');
          setCidr('');
          setErr(null);
        }}
      >
        <Field label="Site name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kenema branch" aria-label="Site name" />
        </Field>
        <Field label="Address block">
          <Input value={cidr} onChange={(e) => setCidr(e.target.value.trim())} placeholder="10.40.0.0/16" aria-label="Site CIDR" />
        </Field>
        <Field label="Kind">
          <select className={sel} value={kind} onChange={(e) => setKind(e.target.value as LabSite['kind'])} aria-label="Site kind">
            {['hq', 'branch', 'datacenter', 'cloud', 'remote'].map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="primary">
            Create site{selected.length ? ` with ${selected.length} selected` : ''}
          </Button>
        </div>
        {err && <p className="col-span-2 text-[12.5px] text-down">{err}</p>}
      </form>
    </div>
  );
}

function Racks() {
  const st = useLab();
  const doc = st.doc!;
  const [siteId, setSiteId] = useState(doc.sites[0]?.id ?? '');
  const [name, setName] = useState('');
  const [units, setUnits] = useState(42);
  return (
    <div className="space-y-3">
      {doc.racks.length ? (
        doc.racks.map((r) => {
          const members = doc.devices.filter((d) => d.rack?.rackId === r.id).sort((a, b) => (b.rack!.u ?? 0) - (a.rack!.u ?? 0));
          return (
            <div key={r.id} className="rounded border border-line p-2 text-[12.5px]">
              <p className="font-medium">
                {r.name} <span className="text-muted">({r.units}U, {doc.sites.find((s) => s.id === r.siteId)?.name})</span>
              </p>
              <ol className="mt-1 space-y-0.5 font-mono text-[11.5px]">
                {members.length ? members.map((d) => <li key={d.id}>U{d.rack!.u}: {d.name}</li>) : <li className="text-muted">Empty. Place devices from their Overview tab.</li>}
              </ol>
            </div>
          );
        })
      ) : (
        <p className="text-[12.5px] text-muted">No racks yet.</p>
      )}
      <form
        className="grid grid-cols-3 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || !siteId) return;
          st.addRack({ name: name.trim(), siteId, units });
          setName('');
        }}
      >
        <Field label="Site">
          <select className={sel} value={siteId} onChange={(e) => setSiteId(e.target.value)} aria-label="Rack site">
            {doc.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rack name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="HQ-R01" aria-label="Rack name" />
        </Field>
        <Field label="Units">
          <Input type="number" min={4} max={52} value={units} onChange={(e) => setUnits(Number(e.target.value))} aria-label="Rack units" />
        </Field>
        <Button type="submit" variant="primary" disabled={!doc.sites.length}>
          Add rack
        </Button>
      </form>
    </div>
  );
}

function Vlans() {
  const st = useLab();
  const doc = st.doc!;
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [subnet, setSubnet] = useState('');
  const [gw, setGw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const switches = doc.devices.filter((d) => d.kind === 'switch');
  return (
    <div className="space-y-3">
      <table className="w-full text-[12.5px]">
        <thead className="text-left text-[11.5px] text-muted">
          <tr className="border-b border-line">
            <th className="py-1 font-medium">ID</th>
            <th className="font-medium">Name</th>
            <th className="font-medium">Subnet</th>
            <th className="font-medium">Gateway</th>
          </tr>
        </thead>
        <tbody>
          {doc.vlans.map((v) => (
            <tr key={v.id} className="border-b border-line">
              <td className="py-1 font-mono">{v.id}</td>
              <td>{v.name}</td>
              <td className="font-mono">{v.subnet ?? '—'}</td>
              <td className="font-mono">{v.gateway ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="grid grid-cols-2 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(id);
          if (!Number.isInteger(n) || n < 2 || n > 4094) return setErr('VLAN IDs run from 2 to 4094.');
          if (subnet && !parseCidr(subnet)) return setErr('Subnet must look like 10.10.60.0/24.');
          if (gw && (!isIp(gw) || (subnet && !inCidr(gw, subnet)))) return setErr('The gateway must be an address inside the subnet.');
          st.addVlan({ id: n, name: name || `VLAN${n}`, subnet: subnet || undefined, gateway: gw || undefined });
          setErr(null);
          setId('');
          setName('');
          setSubnet('');
          setGw('');
        }}
      >
        <Field label="VLAN ID">
          <Input type="number" value={id} onChange={(e) => setId(e.target.value)} aria-label="VLAN ID" />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="VOICE" aria-label="VLAN name" />
        </Field>
        <Field label="Subnet">
          <Input value={subnet} onChange={(e) => setSubnet(e.target.value.trim())} placeholder="10.10.60.0/24" aria-label="VLAN subnet" />
        </Field>
        <Field label="Gateway">
          <Input value={gw} onChange={(e) => setGw(e.target.value.trim())} placeholder="10.10.60.1" aria-label="VLAN gateway" />
        </Field>
        <p className="col-span-2 text-[12px] text-muted">Adds the VLAN to the lab registry and to the VLAN database of {switches.length ? switches.map((s) => s.name).join(', ') : 'every switch you add later'}.</p>
        {err && <p className="col-span-2 text-[12.5px] text-down">{err}</p>}
        <Button type="submit" variant="primary">
          Create VLAN
        </Button>
      </form>
    </div>
  );
}

function Subnets() {
  const st = useLab();
  const doc = st.doc!;
  const [cidr, setCidr] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const used = (c: string) => doc.devices.flatMap((d) => d.interfaces.filter((i) => i.ip && inCidr(i.ip, c)).map((i) => `${d.name} ${i.ip}`));
  const ips = doc.devices.flatMap((d) => d.interfaces.filter((i) => i.ip).map((i) => ({ ip: i.ip!, who: `${d.name} ${i.name}` })));
  const dupes = ips.filter((x, k) => ips.findIndex((y) => y.ip === x.ip) !== k);
  return (
    <div className="space-y-3">
      {dupes.length > 0 && (
        <p role="alert" className="rounded border border-down/50 bg-down/5 p-2 text-[12.5px] text-down">
          Duplicate addresses: {dupes.map((d) => `${d.ip} (${d.who})`).join(', ')}
        </p>
      )}
      <ul className="divide-y divide-line rounded border border-line text-[12.5px]">
        {doc.subnets.map((s) => (
          <li key={s.cidr} className="px-3 py-1.5">
            <span className="font-mono">{s.cidr}</span> {s.name}
            <span className="ml-2 text-muted">{used(s.cidr).length} addresses in use</span>
          </li>
        ))}
      </ul>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!parseCidr(cidr)) return setErr('CIDR must look like 10.40.20.0/24.');
          st.addSubnet({ cidr, name: name || cidr });
          setCidr('');
          setName('');
          setErr(null);
        }}
      >
        <Field label="Subnet">
          <Input value={cidr} onChange={(e) => setCidr(e.target.value.trim())} placeholder="10.40.20.0/24" aria-label="Subnet CIDR" />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Kenema users" aria-label="Subnet name" />
        </Field>
        <Button type="submit" variant="primary">
          Add subnet
        </Button>
      </form>
      {err && <p className="text-[12.5px] text-down">{err}</p>}
    </div>
  );
}

function EndPicker({ label, value, onChange, filter }: { label: string; value: { device: string; port: string }; onChange: (v: { device: string; port: string }) => void; filter: (k: string) => boolean }) {
  const doc = useLab((s) => s.doc)!;
  const devs = doc.devices.filter((d) => filter(d.kind));
  const dev = deviceById(doc, value.device);
  return (
    <fieldset className="grid grid-cols-2 gap-2">
      <legend className="col-span-2 text-[12px] font-medium text-muted">{label}</legend>
      <select className={sel} value={value.device} onChange={(e) => onChange({ device: e.target.value, port: '' })} aria-label={`${label} device`}>
        <option value="">Device…</option>
        {devs.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <select className={sel} value={value.port} onChange={(e) => onChange({ ...value, port: e.target.value })} aria-label={`${label} port`} disabled={!dev}>
        <option value="">Port…</option>
        {dev?.interfaces.filter((i) => !i.parent && i.type !== 'console' && i.type !== 'terminal').map((i) => (
          <option key={i.name} value={i.name} disabled={!!cableOnPort(doc, dev.id, i.name)}>
            {i.name}
            {cableOnPort(doc, dev.id, i.name) ? ' (in use)' : ''}
          </option>
        ))}
      </select>
    </fieldset>
  );
}

function WanLink({ onDone }: { onDone: () => void }) {
  const st = useLab();
  const [a, setA] = useState({ device: '', port: '' });
  const [b, setB] = useState({ device: '', port: '' });
  const [provider, setProvider] = useState('Orange SL MPLS');
  const [bw, setBw] = useState(100);
  const [lat, setLat] = useState(22);
  const [issues, setIssues] = useState<ReturnType<typeof checkConnection>>([]);
  const wanable = (k: string) => k === 'router' || k === 'firewall' || k === 'cloud';
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const r = st.connect(a, b, 'wan', { label: provider, wan: { provider, bandwidthMbps: bw, latencyMs: lat } });
        if (!r.ok) return setIssues(r.issues);
        onDone();
      }}
    >
      <p className="text-[12.5px] text-muted">A leased circuit between two sites. Latency is used by the packet simulator.</p>
      <EndPicker label="Site A router or firewall" value={a} onChange={setA} filter={wanable} />
      <EndPicker label="Site B router, firewall or provider" value={b} onChange={setB} filter={wanable} />
      <div className="grid grid-cols-3 gap-2">
        <Field label="Provider">
          <Input value={provider} onChange={(e) => setProvider(e.target.value)} />
        </Field>
        <Field label="Bandwidth Mb/s">
          <Input type="number" value={bw} onChange={(e) => setBw(Number(e.target.value))} />
        </Field>
        <Field label="Latency ms">
          <Input type="number" value={lat} onChange={(e) => setLat(Number(e.target.value))} />
        </Field>
      </div>
      {issues.length > 0 && <IssueList issues={issues} />}
      <Button type="submit" variant="primary" disabled={!a.port || !b.port}>
        Create WAN link
      </Button>
    </form>
  );
}

function CloudLink({ onDone }: { onDone: () => void }) {
  const st = useLab();
  const doc = st.doc!;
  const [dev, setDev] = useState({ device: '', port: '' });
  const [model, setModel] = useState('aws-vpc');
  const [type, setType] = useState<CableType | 'auto'>('virtual');
  const [issues, setIssues] = useState<ReturnType<typeof checkConnection>>([]);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const d = deviceById(doc, dev.device);
        if (!d) return;
        const id = st.addDevice(model, d.x + 260, d.y);
        const cloud = deviceById(useLab.getState().doc!, id)!;
        const t = type === 'auto' ? 'virtual' : type;
        const port = cloud.interfaces.find((i) => (t === 'virtual' ? i.type === 'virtual' : i.type === 'copper'))?.name ?? cloud.interfaces[0].name;
        const r = st.connect(dev, { device: id, port }, t, { label: model === 'aws-vpc' ? 'Site-to-site VPN' : 'Internet' });
        if (!r.ok) {
          setIssues(r.issues);
          st.undo();
          return;
        }
        onDone();
      }}
    >
      <p className="text-[12.5px] text-muted">Adds a cloud node and connects it to one of your devices (VPN attachment or internet hand-off).</p>
      <EndPicker label="Connect from" value={dev} onChange={setDev} filter={(k) => k !== 'cloud'} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Cloud">
          <select className={sel} value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="aws-vpc">AWS VPC / cloud service</option>
            <option value="internet">Internet / WAN provider</option>
          </select>
        </Field>
        <Field label="Connection">
          <CableTypeSelect value={type} onChange={setType} />
        </Field>
      </div>
      {issues.length > 0 && <IssueList issues={issues} />}
      <Button type="submit" variant="primary" disabled={!dev.port}>
        Add cloud connection
      </Button>
    </form>
  );
}

export function ReplaceCableDialog({ cableId, onClose }: { cableId: string | null; onClose: () => void }) {
  const st = useLab();
  const c = st.doc?.cables.find((x) => x.id === cableId);
  const [type, setType] = useState<CableType | 'auto'>('straight');
  const [issues, setIssues] = useState<ReturnType<typeof checkConnection>>([]);
  useEffect(() => {
    if (c) setType(c.type);
    setIssues([]);
  }, [c]);
  return (
    <Dialog open={!!c} onClose={onClose} title="Replace cable">
      {c && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (type === 'auto') return;
            const r = st.replaceCable(c.id, type);
            if (!r.ok) return setIssues(r.issues);
            onClose();
          }}
        >
          <p className="text-[12.5px] text-muted">
            Currently {CABLE_LABEL[c.type]}. The ends stay on {deviceById(st.doc!, c.a.device)?.name} {c.a.port} and {deviceById(st.doc!, c.b.device)?.name} {c.b.port}.
          </p>
          <CableTypeSelect value={type} onChange={setType} allowAuto={false} />
          {issues.length > 0 && <IssueList issues={issues} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Replace
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export const SHORTCUTS: [string, string][] = [
  ['V', 'Select tool'],
  ['C', 'Cable tool'],
  ['S', 'Simulation mode'],
  ['Shift + drag', 'Box-select several devices'],
  ['Ctrl/Shift + click', 'Add to selection'],
  ['Arrow keys', 'Move selection one grid step (Shift: four)'],
  ['Ctrl + Z / Ctrl + Shift + Z', 'Undo / redo'],
  ['Ctrl + D', 'Duplicate'],
  ['Ctrl + C / Ctrl + V', 'Copy / paste'],
  ['Ctrl + A', 'Select all devices'],
  ['Ctrl + G / Ctrl + Shift + G', 'Group / ungroup'],
  ['Delete', 'Delete selection'],
  ['Enter', 'Open the inspector for the selection'],
  ['F', 'Fit the lab to the screen'],
  ['L', 'Show or hide port labels'],
  ['Esc', 'Cancel the current cable, leave a tool, clear selection'],
  ['Right-click', 'Device, cable and canvas menus'],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard and mouse">
      <ul className="space-y-1.5 text-[13px]">
        {SHORTCUTS.map(([k, v]) => (
          <li key={k} className="flex items-center justify-between gap-3">
            <span className="text-muted">{v}</span>
            <Kbd>{k}</Kbd>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

export function DiffPanel({ onPick }: { onPick: (d: DiffItem) => void }) {
  const doc = useLab((s) => s.doc);
  const base = useLab((s) => s.baseline);
  if (!doc || !base) return null;
  const items = diffDocs(base, doc);
  return (
    <section aria-label="Changes from baseline" className="flex h-full min-h-0 flex-col" data-testid="diff-panel">
      <header className="border-b border-line px-3 py-2 text-[12.5px]">
        <span className="font-semibold">Compared with baseline:</span> {items.length ? `${items.length} difference${items.length === 1 ? '' : 's'}` : 'identical'}
      </header>
      <ul className="min-h-0 flex-1 overflow-auto">
        {items.map((d, k) => (
          <li key={k}>
            <button className="w-full border-b border-line px-3 py-1.5 text-left text-[12px] hover:bg-pane-2" onClick={() => onPick(d)}>
              <span className={cx('mr-1.5 rounded px-1 text-[10.5px] font-semibold text-white', d.kind === 'added' ? 'bg-healthy' : d.kind === 'removed' ? 'bg-down' : 'bg-degraded')}>{d.kind}</span>
              {d.label}
              {d.detail && <div className="pl-1 text-muted">{d.detail}</div>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

