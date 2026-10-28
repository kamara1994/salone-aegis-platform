// Rule-based stand-in for the AI client persona (services/ai in live mode).
// It only knows symptoms, answers from real lab state, and can only do what a user could do.
import { ipConfig, renewLease, type LabState } from './lab';
import type { RunCtx, ScenarioPack } from './scenarios';
import { BEHAVIOURS } from './scenarios';
import { personaTool } from './shells/windows';

export interface PersonaInput {
  pack: ScenarioPack;
  status: string;
  message: string;
  lab: LabState;
  run: RunCtx;
  operator: string;
  explanationAttempts: number;
  sensitiveRequestSeen: boolean;
}

export interface PersonaReply {
  body: string;
  attachments?: { kind: 'command_output'; content: string }[];
  /** lab was changed by the user doing what they were told */
  changed?: string;
  explanation?: { accepted: boolean; clarity: number; coverage: number; jargon: string[] };
  claimedFixed?: boolean;
}

const JARGON = ['dhcp', 'dns', 'vlan', 'gateway', 'apipa', 'ntfs', 'acl', 'kerberos', 'ldap', 'duplex', 'crc', '4740', '4771', 'netlogon', 'option 006', 'subnet', 'tcp', 'arp', 'lease', 'ou', 'agdlp', 'token', 'switchport', 'autonegotiation', 'scope', 'nslookup', 'ipconfig', 'pdc', 'gmsa', 'segmentation', 'rule 14'];

function words(s: string) {
  return s.toLowerCase();
}
const has = (msg: string, ...phrases: string[]) => phrases.some((p) => msg.includes(p));

/** Symptom-level answer to "does it work now?", using the scenario's own checks minus SOC-side ones. */
function clientSeesFixed(pack: ScenarioPack, lab: LabState, run: RunCtx): boolean {
  const b = BEHAVIOURS[pack.id];
  if (!b) return false;
  return Object.entries(b.checks)
    .filter(([id]) => !['classified', 'verified', 'no-reset'].includes(id))
    .every(([, fn]) => fn(lab, run).passed);
}

function workstationOf(pack: ScenarioPack): string | undefined {
  return pack.affected_nodes.find((n) => n.startsWith('WS-')) ?? (pack.id === 'id-finance-share-access' ? 'WS-FIN-02' : undefined);
}

export function personaRespond(i: PersonaInput): PersonaReply {
  const msg = words(i.message);
  const p = i.pack.persona ?? {};
  const traits = p.traits ?? [];
  const impatient = traits.includes('impatient') || traits.includes('angry') || traits.includes('stressed');
  const name = (p.name ?? 'the user').split(' ')[0];

  // 1. Plain-language explanation after the fix is verified
  if (i.status === 'client_explanation') {
    const jargonUsed = JARGON.filter((j) => new RegExp(`\\b${j.replace(/[/]/g, '\\/')}\\b`, 'i').test(i.message));
    const explainedJargon = /\(|which means|that is|basically|in other words|think of it|like a/i.test(i.message);
    const parts = [
      /what happened|the problem|the issue|because|cause|broke|wrong|incorrect|misconfigur|faulty|bad setting|stopped|was set|was off|was blocked|expired|locked/i,
      /\b(i|we)('ve| have)? (fixed|changed|updated|reset|moved|added|removed|corrected|turned|restarted|switched|set|put|replaced|unlocked|enabled|disabled|re-?enabled|cleared|reverted|restored|rebooted|renewed|swapped)|has been (fixed|sorted|resolved)|is (fixed|sorted|resolved)|works now|working now/i,
      /next time|in future|if it happens|again|going forward|you (should|can|may|might)|please|let me know|call|contact|restart/i,
    ].map((r) => r.test(i.message));
    const coverage = parts.filter(Boolean).length;
    const heavy = jargonUsed.length > (explainedJargon ? 4 : 2);
    const clarity = Math.max(20, 100 - jargonUsed.length * (explainedJargon ? 6 : 14) - (i.message.length > 900 ? 15 : 0));
    if (heavy && i.explanationAttempts < 2) {
      return { body: `Sorry, I'm lost. What does "${jargonUsed[0].toUpperCase()}" mean? Can you say it in normal words? I just need to know what went wrong and if it'll happen again.`, explanation: { accepted: false, clarity, coverage: coverage / 3, jargon: jargonUsed } };
    }
    if (coverage < 2 && i.explanationAttempts < 2) {
      const ask = !parts[0] ? 'Okay... but what was actually wrong?' : !parts[1] ? 'Right, but what did you actually change on my side?' : "Okay, thank you. Is there anything I should do differently so this doesn't happen again?";
      return { body: ask, explanation: { accepted: false, clarity, coverage: coverage / 3, jargon: jargonUsed } };
    }
    return {
      body: impatient ? `Fine. That makes sense, thank you ${i.operator.includes('kamara') ? 'Joseph' : ''}. Appreciate you sorting it quickly.`.replace('  ', ' ') : `That makes sense, thank you so much for explaining it. I understand now.`,
      explanation: { accepted: true, clarity, coverage: coverage / 3, jargon: jargonUsed },
    };
  }

  // 2. Impostor social engineering
  if (p.impostor) {
    if (has(msg, 'call you back', 'callback', 'call back', 'number on file', 'known number', 'call your', 'call the number')) {
      return { body: "No no, don't call that number, that phone is lost! Use this one: +232 76 000 0000. Please, I'm about to board." };
    }
    if (has(msg, 'manager', 'supervisor', 'approve', 'approval')) return { body: 'I AM the manager. Call my assistant if you must but she is on leave today. Just reset it please, the wire approvals close in 15 minutes.' };
    if (has(msg, 'employee id', 'staff number', 'security question', 'date of birth', 'verify', 'confirm your identity', 'prove')) return { body: "I don't have my staff card with me, I'm travelling! You know who I am. This delay is costing the bank money." };
    if (has(msg, 'done', 'reset', 'i have reset', 'set up', 'all set')) return { body: "Thank you! I'll scan the code now.", claimedFixed: true };
    if (has(msg, 'cannot', "can't", 'not able', 'policy', 'procedure', 'unable')) return { body: 'This is ridiculous. I will be speaking to your manager about this. Who is your supervisor?' };
    return { body: 'Please, just reset my MFA to the new phone. The approvals are due very soon.' };
  }

  // 3. Facts the persona knows or can read off their own PC
  for (const f of i.pack.client_facts ?? []) {
    if (f.ask.some((a) => msg.includes(a.toLowerCase()))) {
      if (f.tool && f.target) {
        const out = personaTool({ lab: i.lab, node: f.target, operator: i.operator, changed: () => {} }, f.tool);
        return { body: `Okay, I opened the black window and typed it. This is what it says:`, attachments: [{ kind: 'command_output', content: out }] };
      }
      if (f.answer) return { body: f.answer };
    }
  }

  // 4. Things a user can actually do when asked
  const ws = workstationOf(i.pack);
  if (ws && has(msg, 'ipconfig /renew', 'renew')) {
    const st = i.lab.nodes[ws];
    if (st.dhcp && !st.staticIp) renewLease(i.lab, ws);
    const c = ipConfig(i.lab, ws);
    return { body: `I typed ipconfig /renew. It says my IPv4 address is ${c.ip}${c.gw ? ` and gateway ${c.gw}` : ''}.`, changed: `${name} renewed the DHCP lease on ${ws}` };
  }
  if (ws && has(msg, 'restart', 'reboot', 'turn it off', 'switch it off', 'power cycle')) {
    const st = i.lab.nodes[ws];
    if (st.dhcp && !st.staticIp) renewLease(i.lab, ws);
    st.tokenStale = false;
    return { body: 'Okay, restarting now... It\'s back on and I\'ve logged in again.', changed: `${name} restarted ${ws}` };
  }
  if (has(msg, 'sign out', 'log off', 'log out', 'logoff', 'sign back in', 'log back in', 'klist')) {
    for (const st of Object.values(i.lab.nodes)) if (st.tokenStale) st.tokenStale = false;
    return { body: "Okay, I signed out and back in.", changed: `${name} signed out and back in` };
  }
  if (i.pack.id === 'id-lockout-stale-device' && has(msg, 'phone', 'mobile') && has(msg, 'password', 'update', 'change', 'enter', 'remove', 'sign')) {
    i.lab.staleDevice['MBL-JDAVIES'] = false;
    return { body: "Oh! My phone kept popping up asking for my password and I ignored it. I've put the new password in on the phone now.", changed: 'User updated the password on MBL-JDAVIES' };
  }
  if (has(msg, 'try again', 'try now', 'does it work', 'working now', 'can you check', 'is it fixed', 'still', 'test it', 'can you open')) {
    const fixed = clientSeesFixed(i.pack, i.lab, i.run);
    return { body: fixed ? 'Yes! It works now. Thank you!' : impatient ? 'No, still the same. How long is this going to take?' : 'No, it still does the same thing, sorry.', claimedFixed: fixed };
  }

  // 5. Generic conversation
  if (has(msg, 'what happened', "what's the problem", 'what is the problem', 'describe', 'tell me more', 'what exactly', 'what do you see', 'error')) {
    return { body: `${i.pack.notification.opening.replace(/^(Hi|Hello|IT)[^,]*,\s*/i, '')}` };
  }
  if (has(msg, 'hello', 'hi ', 'hi,', 'good morning', 'good afternoon', 'thanks for')) {
    return { body: impatient ? `Hi. Thanks for picking this up, it's urgent.` : `Hi, thank you for helping.` };
  }
  if (has(msg, 'when', 'since')) return { body: 'Since this morning, I think.' };
  if (has(msg, 'name', 'who are you', 'your department')) return { body: `I'm ${p.name}, ${p.role}.` };
  if (traits.includes('non-technical') || traits.includes('anxious')) return { body: "Sorry, I'm not very technical. What would you like me to do?" };
  if (impatient) return { body: 'Can you just fix it please? I have work to do.' };
  return { body: "I'm not sure I understand. What should I do?" };
}

/** Requests that need identity verification before acting. */
export function isSensitiveRequest(pack: ScenarioPack): boolean {
  return /mfa|password reset|reset my/i.test(pack.notification.opening) || !!pack.persona?.impostor;
}
