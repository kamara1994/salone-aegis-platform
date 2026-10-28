// Rule-based stand-in for the AI interviewer. It reads the evidence trail of the exact ticket,
// drills from the story into protocol depth, then what-ifs, then prevention at scale.
import type { AnswerScore, DebriefQuestion } from '@/api/types';
import type { ScenarioPack } from './scenarios';

export const GLOSSARY: Record<string, string> = {
  ou: 'An organizational unit is a container in Active Directory. Placing an account in the right OU decides which Group Policies apply to it.',
  'security group': 'A security group grants access in one place: permissions are given to the group, people are added to the group.',
  'least privilege': 'Least privilege means granting only the access the role needs, nothing extra, and removing it when the role changes.',
  mfa: 'Multi-factor authentication requires something the user has (a phone authenticator) as well as the password, so a stolen password alone is not enough.',
  'naming convention': 'A consistent username scheme (first initial plus surname) prevents duplicates and makes accounts searchable and auditable.',
  'group membership': 'Access to shares comes from group membership. If a user leaves the group, the NTFS permission no longer applies to them.',
  ntfs: 'NTFS permissions on the folder decide what each group can do; the share permission is usually left open and NTFS does the real control.',
  agdlp: 'AGDLP: Accounts go in Global groups, global groups go in Domain Local groups, and permissions are granted to the domain local groups.',
  mover: 'A mover is someone changing role. Mover changes must add the new access and remove only the access the old role needed.',
  'kerberos ticket': 'Group memberships are baked into the Kerberos ticket at logon, so a user must sign out and in (or purge tickets) to pick up a new group.',
  vlan: 'A VLAN splits one physical switch into separate layer 2 networks. An access port belongs to exactly one VLAN.',
  'access port': 'An access port carries a single untagged VLAN to an end device such as a PC or printer.',
  dhcp: 'DHCP hands a device its IP address, subnet mask, default gateway and DNS servers. No answer from DHCP means no usable address.',
  apipa: 'APIPA is the 169.254.x.x address Windows gives itself when no DHCP server answers. It only works on the local link.',
  'show interfaces status': 'show interfaces status lists each switch port with its status, VLAN, duplex and speed in one table.',
  'dhcp option 006': 'DHCP option 006 is the DNS server list given to clients. A wrong value breaks name resolution for every client that renews.',
  dns: 'DNS turns names into IP addresses. If DNS fails, IP connectivity can be fine while anything addressed by name fails.',
  'ipconfig /renew': 'ipconfig /renew asks DHCP for a fresh lease, so a client picks up corrected scope options without a reboot.',
  nslookup: 'nslookup queries DNS directly and shows which server answered, which separates DNS problems from network problems.',
  lease: 'A DHCP lease is the period a client keeps its address and options. Clients only see scope changes when they renew.',
  arp: 'ARP maps an IP address to a MAC address on the local subnet. To leave the subnet, the PC must ARP for its default gateway.',
  'default gateway': 'The default gateway is the router address a host sends all off-subnet traffic to. A wrong gateway means local works but nothing remote.',
  'dhcp vs static': 'User devices should use DHCP; static addresses belong on servers and network gear, documented in IPAM, so mistakes like this cannot happen.',
  'how you isolated it': 'Isolate by layer: link, local subnet ping, gateway ping, remote ping, then name resolution. The first failing step points to the cause.',
  segmentation: 'Segmentation keeps zones apart so a compromised workstation cannot talk directly to crown-jewel systems like the payments database.',
  'change management': 'Change management means every production change has a ticket, an approval, a rollback plan and an owner, including temporary ones.',
  'deny by default': 'Deny by default means anything not explicitly allowed is blocked, and the default deny rule is logged so blocked attempts are visible.',
  logging: 'Logging the deny rule turns blocked traffic into evidence you can alert on and investigate.',
  'event 4740': 'Event 4740 on the PDC emulator records each account lockout and the caller computer that sent the bad passwords.',
  'lockout source': 'The lockout source is the device still sending a wrong password: often a phone, a mapped drive or a scheduled task.',
  'pdc emulator': 'The PDC emulator domain controller receives every bad password and lockout, so it is where lockout events are investigated.',
  'stale credentials': 'Stale credentials are old passwords saved on another device or service that keep being retried after a password change.',
  'user communication': 'Telling the user what to do, in plain words, is part of the fix when the cause is on their own device.',
  'spray pattern': 'A password spray tries one or two passwords against many accounts from one or more sources, staying under the lockout threshold.',
  'source host': 'The source host of the failures tells you whether this is an attacker or a known system with a broken credential.',
  'service account': 'A service account runs an application. When its password is rotated, every service that uses it must be updated.',
  'false positive vs benign true positive': 'A false positive means the rule fired on something that did not happen. A benign true positive means it really happened, but was not malicious.',
  rotation: 'Password rotation must be paired with updating every consumer of the credential, or the service fails and floods the logs.',
  duplex: 'Duplex is whether a link can send and receive at the same time. Both ends must agree, ideally by auto-negotiating full duplex.',
  'late collisions': 'Late collisions on a full-duplex network are the classic sign of a duplex mismatch: one side thinks the wire is shared.',
  crc: 'CRC errors mean frames arrived corrupted. Together with late collisions they point to a duplex mismatch or bad cabling.',
  'show interfaces': 'show interfaces gives one port in detail: duplex, speed, rates and error counters such as CRC and late collisions.',
  autonegotiation: 'Autonegotiation lets both ends agree on speed and duplex. Forcing one side and leaving the other on auto causes mismatches.',
  'single point of failure': 'A single point of failure is one component whose loss takes down everything that depends on it, like a lone domain controller.',
  netlogon: 'The Netlogon service is what lets clients find and authenticate to a domain controller. Without it: "no logon servers available".',
  dependency: 'Mapping dependencies (logons, file shares, apps all need DNS and a DC) turns five tickets into one root cause.',
  communication: 'In a P1, early and regular updates to the business (what is affected, what you are doing, next update time) matter as much as the fix.',
  'social engineering': 'Social engineering manipulates people rather than systems, usually through urgency, authority or fear.',
  pretexting: 'Pretexting is inventing a believable story (travelling, lost phone, urgent approvals) to get someone to bypass a control.',
  'out of band verification': 'Out-of-band verification confirms identity through a channel the requester did not supply, such as the phone number already on file.',
  urgency: 'Manufactured urgency is a pressure tactic: the more a request insists there is no time to verify, the more it needs verifying.',
  escalation: 'When you cannot verify a sensitive request, escalate to the manager or security team instead of deciding alone.',
  scope: 'Scoping means finding every host, account and time window involved before acting, so containment covers the whole incident.',
  containment: 'Containment stops the spread (isolate the host, disable the account) while preserving evidence for the investigation.',
  evidence: 'Evidence is collected before changes: process trees, logs, memory or triage packages, with times and hashes recorded.',
};

const STOP = new Set(['the', 'and', 'that', 'with', 'from', 'this', 'into', 'were', 'was', 'not', 'one', 'for', 'had', 'its', 'which', 'after', 'their', 'they', 'then', 'what', 'when', 'have', 'been', 'only']);

const SYNONYMS: Record<string, string[]> = {
  'dhcp vs static': ['dhcp', 'static ip', 'static address', 'reservation'],
  arp: ['arp', 'mac address', 'mac table'],
  apipa: ['169.254', 'self-assigned', 'autoconfiguration'],
  'default gateway': ['gateway', '10.10.20.1', 'router'],
  'dhcp option 006': ['option 6', 'option 006', 'dns server option', 'scope option'],
  'kerberos ticket': ['ticket', 'klist', 'sign out', 'log off', 'token'],
  'event 4740': ['4740'],
  'lockout source': ['caller', 'source', 'mbl-'],
  'late collisions': ['late collision', 'collisions'],
  'false positive vs benign true positive': ['benign', 'false positive', 'true positive'],
  'out of band verification': ['call back', 'callback', 'number on file', 'out of band', 'out-of-band'],
  'single point of failure': ['single point', 'spof', 'redundan'],
  'show interfaces status': ['show int', 'sh int'],
  'deny by default': ['default deny', 'deny by default', 'implicit deny'],
  'security group': ['group', 'gg-finance'],
  ou: ['organizational unit', 'ou=finance', ' ou '],
  segmentation: ['segment', 'vlan 20', 'isolat'],
  'how you isolated it': ['ping', 'step', 'layer', 'first'],
  pretexting: ['pretext', 'story', 'travelling', 'traveling'],
  'service account': ['svc-backup', 'service account'],
};

function mentions(text: string, concept: string): boolean {
  const t = ` ${text.toLowerCase()} `;
  if (t.includes(concept.toLowerCase())) return true;
  return (SYNONYMS[concept] ?? []).some((s) => t.includes(s));
}

function rootTokens(root: string): string[] {
  return [...new Set(root.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 4 && !STOP.has(w)))];
}

export const INTERVIEWER_IDS: Record<string, 'senior_network_engineer' | 'soc_lead' | 'hiring_manager' | 'ciso' | 'recruiter_screen'> = {
  'senior-network-engineer': 'senior_network_engineer',
  'soc-lead': 'soc_lead',
  'hiring-manager': 'hiring_manager',
  ciso: 'ciso',
  'recruiter-screen': 'recruiter_screen',
};

export const INTERVIEWER_NAMES: Record<string, string> = {
  senior_network_engineer: 'Senior network engineer',
  soc_lead: 'SOC lead',
  hiring_manager: 'Hiring manager',
  ciso: 'CISO',
  recruiter_screen: 'Recruiter screen',
};

export function buildQuestions(pack: ScenarioPack, ctx: { ticketNumber: string; firstCommand?: string; hintsUsed: number; long: boolean }): DebriefQuestion[] {
  const c = pack.debrief.must_cover;
  const qs: DebriefQuestion[] = [
    { id: 'q1', depth: 1, kind: 'behavioral', text: `Walk me through ${ctx.ticketNumber}, "${pack.title}". What was reported, what did you check first, and how did you find the cause?` },
    { id: 'q2', depth: 2, kind: 'technical', text: `Explain ${c[0]}${c[1] ? ` and ${c[1]}` : ''}, and the part ${c[1] ? 'they' : 'it'} played in this ticket.` },
  ];
  if (ctx.long) {
    qs.push({
      id: 'q3',
      depth: 2,
      kind: 'lessons',
      text: ctx.firstCommand
        ? `Your first command was \`${ctx.firstCommand}\`${ctx.hintsUsed ? ` and you used ${ctx.hintsUsed} hint${ctx.hintsUsed > 1 ? 's' : ''}` : ''}. Was that the best first step? What would you do differently next time?`
        : `What did you get wrong first, or what would you do differently next time?`,
    });
  }
  if (pack.debrief.what_ifs[0]) qs.push({ id: 'q4', depth: 3, kind: 'what_if', text: pack.debrief.what_ifs[0] });
  if (ctx.long && pack.debrief.what_ifs[1]) qs.push({ id: 'q5', depth: 4, kind: 'system_design', text: pack.debrief.what_ifs[1] });
  return qs;
}

export function scoreAnswer(pack: ScenarioPack, q: DebriefQuestion, answer: string): AnswerScore {
  const text = answer.trim();
  const n = text.split(/\s+/).filter(Boolean).length;
  const lower = text.toLowerCase();
  const concepts = q.kind === 'technical' ? pack.debrief.must_cover.slice(0, 2) : pack.debrief.must_cover;
  const covered = concepts.filter((cn) => mentions(text, cn));
  const roots = rootTokens(pack.debrief.root_cause);
  const rootHits = roots.filter((r) => lower.includes(r)).length;

  let accuracy: number;
  if (q.kind === 'behavioral') accuracy = 35 + 45 * Math.min(1, rootHits / Math.max(3, roots.length * 0.5)) + 20 * Math.min(1, covered.length / 2);
  else if (q.kind === 'technical') accuracy = 30 + 70 * (covered.length / Math.max(1, concepts.length));
  else accuracy = 45 + 30 * Math.min(1, covered.length / 2) + (/(because|so that|which means|then i would|first i would|i would check|verify)/.test(lower) ? 25 : 5);
  accuracy = Math.min(100, Math.round(accuracy));

  const tech = pack.debrief.must_cover.filter((cn) => mentions(text, cn)).length + (lower.match(/\b(vlan|dhcp|dns|gateway|arp|kerberos|ntfs|firewall|rule|switch|port|subnet|event|log|ticket|mfa|lease|duplex)\b/g)?.length ?? 0) * 0.5;
  const depth = Math.min(100, Math.round(25 + tech * 11 + Math.min(n, 200) / 5));
  const seq = (lower.match(/\b(first|then|next|after that|finally|because|so|which meant|that showed|to confirm)\b/g) ?? []).length;
  const structure = Math.min(100, 45 + seq * 11);
  const numbers = /\d/.test(text) ? 90 : q.kind === 'behavioral' ? 45 : 70;
  const honesty = /(i don't know|i'm not sure|not sure|i would check|i'd check|i would verify|i'd verify|i'd look|i would look)/.test(lower) ? 92 : /\b(always|never|100%|guarantee)\b/.test(lower) ? 62 : 78;
  const conciseness = n < 12 ? 30 : n < 30 ? 65 : n <= 230 ? 100 : n <= 350 ? 75 : 50;
  const total = Math.round(accuracy * 0.35 + depth * 0.2 + structure * 0.15 + numbers * 0.1 + honesty * 0.1 + conciseness * 0.1);

  const missing = concepts.filter((cn) => !covered.includes(cn));
  const tips: string[] = [];
  if (missing.length) tips.push(`You didn't cover: ${missing.slice(0, 4).join(', ')}.`);
  if (n < 30) tips.push('Too short. Give the reasoning, not just the conclusion.');
  if (n > 300) tips.push('Too long. Aim for under two minutes spoken (about 200 words).');
  if (seq < 2 && q.kind !== 'technical') tips.push('Give it an order: what you checked first, what that showed, what you did about it.');
  if (!/\d/.test(text) && q.kind === 'behavioral') tips.push('Add numbers: how long it took, how many users, what the address was.');
  if (!tips.length) tips.push('Strong answer. Clear, specific and structured.');

  const model =
    q.kind === 'behavioral'
      ? `Reported: ${pack.notification.opening.slice(0, 140)}${pack.notification.opening.length > 140 ? '...' : ''} I started by confirming the symptom and narrowing it by layer. Root cause: ${pack.debrief.root_cause} I fixed it, then proved it with: ${pack.checks.map((c) => c.label ?? c.id).join('; ')}.`
      : q.kind === 'technical'
        ? concepts.map((cn) => GLOSSARY[cn] ?? cn).join(' ')
        : `${pack.debrief.prevention ?? ''} ${pack.debrief.must_cover.slice(0, 3).map((cn) => GLOSSARY[cn]).filter(Boolean).join(' ')}`.trim();

  return { total, accuracy, depth, structure, numbers, honesty, conciseness, feedback: tips.join(' '), model_answer: model };
}

export function studyList(pack: ScenarioPack, answers: string[]): string[] {
  const all = answers.join(' ');
  return pack.debrief.must_cover.filter((cn) => !mentions(all, cn));
}
