// Mock implementations of each scenario pack's setup / cleanup / check scripts.
// The real scripts live in scenarios/<id>/scripts and run against the real lab via the back end.
import { anyLogonServer, BASE_RULES, duplexMismatch, hasAccess, initialLab, ipConfig, isServiceUp, reach, renewLease, resolveName, type LabState } from './lab';
import bundle from './scenarios.generated.json';

export interface ScenarioPack {
  id: string;
  version: number;
  title: string;
  client: string;
  category: string;
  tags: string[];
  difficulty: number;
  estimated_minutes?: number;
  sla: { priority: 'P1' | 'P2' | 'P3' | 'P4'; resolve_within: string };
  notification: { kind?: string; channel: 'chat' | 'email' | 'voice'; persona: string; opening: string; title?: string };
  persona?: { name?: string; role?: string; traits?: string[]; impostor?: boolean };
  affected_nodes: string[];
  client_facts?: { ask: string[]; tool?: string; target?: string; answer?: string }[];
  hints: string[];
  checks: { id: string; label?: string; target: string; run: string }[];
  debrief: { interviewer: string; root_cause: string; must_cover: string[]; what_ifs: string[]; prevention?: string; rubric: Record<string, number> };
}

export const PACKS: ScenarioPack[] = bundle as ScenarioPack[];
export const packById = (id: string) => PACKS.find((p) => p.id === id);

export interface RunCtx {
  startedAt: string;
  alertId?: string;
  alertVerdict?: string;
  identityChecks: { method: string; at: string }[];
}

export type CheckFn = (lab: LabState, run: RunCtx) => { passed: boolean; output: string };

export interface Behaviour {
  inject(lab: LabState): void;
  cleanup(lab: LabState): void;
  checks: Record<string, CheckFn>;
  /** Called every engine tick (about 2 s) while the run is active. */
  tick?(lab: LabState, run: RunCtx, now: number): void;
}

const ok = (passed: boolean, yes: string, no: string) => ({ passed, output: passed ? yes : no });
const BASE = initialLab();

export const BEHAVIOURS: Record<string, Behaviour> = {
  'onb-new-hire-finance': {
    inject(lab) {
      delete lab.ad.users.akoroma;
    },
    cleanup(lab) {
      delete lab.ad.users.akoroma;
    },
    checks: {
      'user-exists': (lab) => {
        const u = lab.ad.users.akoroma;
        return ok(!!u && u.enabled && /OU=Finance/i.test(u.ou), `akoroma exists in ${u?.ou} and is enabled`, !u ? 'No account named akoroma' : !u.enabled ? 'akoroma exists but is disabled' : `akoroma is in ${u.ou}, expected OU=Finance`);
      },
      'in-finance-group': (lab) => ok(!!lab.ad.users.akoroma?.groups.includes('GG-Finance'), 'Member of GG-Finance', 'Not a member of GG-Finance'),
      'mfa-enrolled': (lab) => ok(!!lab.ad.users.akoroma?.mfaRequired, 'MFA required at first sign-in', 'MFA is not required for akoroma'),
    },
  },
  'id-finance-share-access': {
    inject(lab) {
      const u = lab.ad.users.iconteh;
      u.groups = u.groups.filter((g) => g !== 'GG-Finance').concat('GG-Operations');
      u.title = 'Finance Lead';
      lab.nodes['WS-FIN-02'].tokenStale = false;
    },
    cleanup(lab) {
      lab.ad.users.iconteh = structuredClone(BASE.ad.users.iconteh);
      lab.nodes['WS-FIN-02'].tokenStale = false;
    },
    checks: {
      'in-finance-group': (lab) => ok(lab.ad.users.iconteh.groups.includes('GG-Finance'), 'iconteh is in GG-Finance', 'iconteh is not in GG-Finance'),
      'share-access': (lab) => {
        const access = hasAccess(lab, 'iconteh', 'Finance');
        const stale = !!lab.nodes['WS-FIN-02'].tokenStale;
        return ok(access && !stale, 'Opened \\\\FS01\\Finance as iconteh', !access ? 'Access denied on \\\\FS01\\Finance' : 'Group change made, but his logon token is old: he must sign out and back in (or reboot) to pick it up');
      },
    },
  },
  'net-access-port-vlan': {
    inject(lab) {
      lab.switchPorts['Gi0/12'].vlan = 99;
      renewLease(lab, 'WS-OPS-03');
    },
    cleanup(lab) {
      lab.switchPorts['Gi0/12'] = structuredClone(BASE.switchPorts['Gi0/12']);
      renewLease(lab, 'WS-OPS-03');
    },
    checks: {
      'port-vlan': (lab) => {
        const p = lab.switchPorts['Gi0/12'];
        return ok(p.mode === 'access' && p.vlan === 20 && !p.shutdown, 'Gi0/12: access VLAN 20, up', `Gi0/12: ${p.mode} VLAN ${p.vlan}${p.shutdown ? ', shutdown' : ''}`);
      },
      'client-dhcp': (lab) => {
        const c = ipConfig(lab, 'WS-OPS-03');
        return ok(c.ip.startsWith('10.10.20.') && !c.apipa, `WS-OPS-03 lease ${c.ip}`, `WS-OPS-03 still has ${c.ip}. The PC needs a new lease (ipconfig /renew or a restart).`);
      },
    },
  },
  'net-dhcp-dns-option': {
    inject(lab) {
      lab.dhcp['10.10.20.0'].dns = ['10.10.10.99'];
      renewLease(lab, 'WS-FIN-02');
      renewLease(lab, 'WS-FIN-07');
    },
    cleanup(lab) {
      lab.dhcp['10.10.20.0'] = structuredClone(BASE.dhcp['10.10.20.0']);
      renewLease(lab, 'WS-FIN-02');
      renewLease(lab, 'WS-FIN-07');
    },
    checks: {
      'scope-dns': (lab) => {
        const d = lab.dhcp['10.10.20.0'].dns;
        return ok(d[0] === '10.10.10.10' || d[0] === '10.10.10.11', `Option 006: ${d.join(', ')}`, `Option 006 is ${d.join(', ')}`);
      },
      'client-resolves': (lab) => {
        const r = resolveName(lab, 'WS-FIN-02', 'salonepay.corp.salonemutual.lab');
        return ok(r.ok, `Resolved to ${r.ok ? r.ip : ''}`, `WS-FIN-02 cannot resolve the name (DNS ${ipConfig(lab, 'WS-FIN-02').dns.join(', ') || 'none'}). Renew its lease after fixing the scope.`);
      },
    },
  },
  'net-gateway-wrong': {
    inject(lab) {
      const c = ipConfig(lab, 'WS-FIN-02');
      lab.nodes['WS-FIN-02'].staticIp = { ip: '10.10.20.45', mask: '255.255.255.0', gw: '10.10.20.254', dns: c.dns.length ? c.dns : ['10.10.10.10', '10.10.10.11'] };
    },
    cleanup(lab) {
      lab.nodes['WS-FIN-02'].staticIp = undefined;
      renewLease(lab, 'WS-FIN-02');
    },
    checks: {
      'gw-correct': (lab) => {
        const c = ipConfig(lab, 'WS-FIN-02');
        return ok(c.gw === '10.10.20.1', 'Default gateway 10.10.20.1', `Default gateway is ${c.gw ?? 'empty'}`);
      },
      'reaches-salonepay': (lab) => {
        const r = reach(lab, 'WS-FIN-02', '10.10.30.20', 443);
        return ok(r.ok, 'HTTPS to SalonePay succeeded', `HTTPS to SalonePay failed (${r.ok ? '' : r.reason.replace('_', ' ')})`);
      },
    },
  },
  'sec-db-firewall-rule': {
    inject(lab) {
      lab.fwRules.splice(lab.fwRules.findIndex((r) => r.id === 15), 0, { id: 14, iface: 'VLAN20', src: 'VLAN20 net', dst: 'VLAN40 net', proto: 'any', port: 'any', action: 'pass', log: false, enabled: true, descr: 'TEMP troubleshooting - remove after INC-0917' });
      lab.fwPending = null;
    },
    cleanup(lab) {
      lab.fwRules = structuredClone(BASE_RULES);
      lab.fwPending = null;
    },
    checks: {
      'no-broad-rule': (lab) => {
        const bad = lab.fwRules.filter((r) => r.enabled && r.action === 'pass' && r.iface === 'VLAN20' && (r.dst === 'VLAN40 net' || r.dst === 'any'));
        return ok(!bad.length, 'No running rule lets VLAN 20 reach VLAN 40', `Running rule ${bad.map((b) => b.id).join(', ')} still allows VLAN 20 to VLAN 40${lab.fwPending ? ' (you have staged changes: run "rules apply")' : ''}`);
      },
      'db-blocked': (lab) => {
        const r = reach(lab, 'WS-FIN-02', '10.10.40.10', 5432);
        return ok(!r.ok && r.reason === 'filtered' && !!r.verdict?.rule.log, 'WS-FIN-02 to DB01:5432 blocked by rule 99 and logged', r.ok ? 'WS-FIN-02 still connects to DB01:5432' : `Blocked, but not by a logged deny (${r.reason})`);
      },
      'app-still-works': (lab) => {
        const r = reach(lab, 'APP01', '10.10.40.10', 5432);
        return ok(r.ok, 'APP01 still reaches DB01:5432', 'SalonePay can no longer reach its database: the fix broke production');
      },
    },
  },
  'id-lockout-stale-device': {
    inject(lab) {
      const u = lab.ad.users.jdavies;
      u.locked = true;
      u.badPwdCount = 5;
      lab.staleDevice['MBL-JDAVIES'] = true;
      const now = Date.now();
      lab.events4740.push(...[34, 22, 9].map((m) => ({ at: new Date(now - m * 60000).toISOString(), user: 'jdavies', caller: 'MBL-JDAVIES' })));
    },
    cleanup(lab) {
      lab.ad.users.jdavies = structuredClone(BASE.ad.users.jdavies);
      delete lab.staleDevice['MBL-JDAVIES'];
      lab.events4740 = [];
    },
    tick(lab, _run, now) {
      const u = lab.ad.users.jdavies;
      if (!lab.staleDevice['MBL-JDAVIES'] || u.locked) return;
      // the phone retries the old password roughly every 20 s until 5 failures lock the account again
      if (Math.floor(now / 20000) % 1 === 0 && Math.random() < 0.15) {
        u.badPwdCount += 1;
        if (u.badPwdCount >= 5) {
          u.locked = true;
          lab.events4740.push({ at: new Date(now).toISOString(), user: 'jdavies', caller: 'MBL-JDAVIES' });
        }
      }
    },
    checks: {
      unlocked: (lab) => ok(!lab.ad.users.jdavies.locked, 'jdavies is not locked out', 'jdavies is locked out'),
      'source-fixed': (lab) => ok(!lab.staleDevice['MBL-JDAVIES'], 'MBL-JDAVIES now uses the new password', 'MBL-JDAVIES is still sending the old password. The user has to update it on the phone.'),
    },
  },
  'soc-password-spray-triage': {
    inject(lab) {
      lab.ad.users['svc-backup'].passwordVersion = 2;
      lab.nodes.BKP01.serviceCredVersion = { BackupAgent: 1 };
    },
    cleanup(lab) {
      lab.ad.users['svc-backup'] = structuredClone(BASE.ad.users['svc-backup']);
      lab.nodes.BKP01.serviceCredVersion = { BackupAgent: 1 };
      lab.events4771 = [];
    },
    tick(lab, _run, now) {
      const stale = (lab.nodes.BKP01.serviceCredVersion?.BackupAgent ?? 0) !== lab.ad.users['svc-backup'].passwordVersion;
      if (stale && Math.random() < 0.5) lab.events4771.push({ at: new Date(now).toISOString(), user: ['svc-backup', 'svc-backup', 'svc-sql'][Math.floor(Math.random() * 3)], ip: '10.10.70.15' });
      if (lab.events4771.length > 300) lab.events4771.splice(0, 100);
    },
    checks: {
      classified: (_lab, run) => ok(run.alertVerdict === 'benign_true_positive', 'Alert classified as benign true positive', run.alertVerdict ? `Alert classified as ${run.alertVerdict.replace(/_/g, ' ')}; the activity was real but not malicious` : 'The alert has not been classified in the SOC queue'),
      'failures-stopped': (lab) => {
        const stale = (lab.nodes.BKP01.serviceCredVersion?.BackupAgent ?? 0) !== lab.ad.users['svc-backup'].passwordVersion;
        return ok(!stale, 'No new 4771 events from BKP01', 'BackupAgent on BKP01 still uses the old svc-backup password');
      },
    },
  },
  'net-duplex-mismatch': {
    inject(lab) {
      const p = lab.switchPorts['Gi0/3'];
      p.duplex = 'half';
      p.speed = '100';
      p.crc = 412;
      p.lateCollisions = 1290;
      p.inputErrors = 433;
    },
    cleanup(lab) {
      lab.switchPorts['Gi0/3'] = structuredClone(BASE.switchPorts['Gi0/3']);
    },
    tick(lab) {
      const p = lab.switchPorts['Gi0/3'];
      if (duplexMismatch(lab, 'Gi0/3')) {
        p.crc += Math.floor(Math.random() * 6);
        p.lateCollisions += Math.floor(Math.random() * 14);
        p.inputErrors = p.crc + Math.floor(p.crc * 0.05);
      }
    },
    checks: {
      duplex: (lab) => {
        const p = lab.switchPorts['Gi0/3'];
        return ok(!duplexMismatch(lab, 'Gi0/3') && p.speed !== '100', `Gi0/3 ${p.duplex === 'auto' ? 'a-full' : p.duplex}, ${p.speed === 'auto' ? 'a-1000' : p.speed}`, `Gi0/3 is ${p.duplex}/${p.speed}; the server side is full/1000`);
      },
      'errors-cleared': (lab) => ok(!duplexMismatch(lab, 'Gi0/3'), 'Error counters stable (clear counters to confirm the baseline)', 'CRC and late-collision counters are still climbing on Gi0/3'),
    },
  },
  'svc-dc-outage-cascade': {
    inject(lab) {
      lab.nodes.DC02.power = 'stopped';
      lab.nodes.DC01.services!.DNS = 'Stopped';
      lab.nodes.DC01.services!.Netlogon = 'Stopped';
    },
    cleanup(lab) {
      lab.nodes.DC02.power = 'running';
      lab.nodes.DC01.services = structuredClone(BASE.nodes.DC01.services);
    },
    checks: {
      'dns-up': (lab) => {
        const r = resolveName(lab, 'WS-FIN-02', 'corp.salonemutual.lab');
        return ok(r.ok, `corp.salonemutual.lab resolves via ${r.ok ? r.server : ''}`, 'No DNS server answers for corp.salonemutual.lab');
      },
      'logon-up': (lab) => {
        const dc = anyLogonServer(lab);
        return ok(!!dc, `Logons served by ${dc}`, 'There are currently no logon servers available');
      },
      'dc2-up': (lab) => ok(lab.nodes.DC02.power === 'running' && isServiceUp(lab, 'DC02', 'DNS'), 'DC02 is running with DNS', 'DC02 is not running: you still have a single point of failure'),
    },
  },
  'se-cfo-mfa-reset': {
    inject() {},
    cleanup(lab) {
      lab.ad.users.abangura = structuredClone(BASE.ad.users.abangura);
      lab.mfaResets = lab.mfaResets.filter((r) => r.user !== 'abangura');
    },
    checks: {
      'no-reset': (lab, run) => {
        const bad = lab.mfaResets.find((r) => r.user === 'abangura' && r.at >= run.startedAt);
        return ok(!bad, 'MFA for abangura was not changed', `MFA for abangura was reset to "${bad?.device}" without verified identity. This is how the attacker got in.`);
      },
      verified: (_lab, run) => {
        const trusted = run.identityChecks.find((c) => c.method === 'callback_known_number' || c.method === 'manager_confirmation');
        return ok(!!trusted, `Verified through ${trusted?.method.replace(/_/g, ' ')}`, 'No identity check through a trusted channel was recorded');
      },
    },
  },
};

export function restoreAllBaselines(lab: LabState) {
  for (const b of Object.values(BEHAVIOURS)) b.cleanup(lab);
}
