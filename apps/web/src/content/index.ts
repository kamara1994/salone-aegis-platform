// Content registry: built-in lessons, games and tracks, plus anything imported from local packs.
import { GAME_TEMPLATES } from './games';
import { arpLesson, cableTraceLesson, closeTicketLesson, escalationLesson, macLesson, outageLesson, priorityLesson, ticketLesson } from './lessons/helpdesk';
import { evidenceLesson, firewallLogLesson, huntLesson, siemLesson, vlanDiagramsLesson } from './lessons/soc';
import { vlanLesson } from './lessons/vlans';
import { loadPacks } from './progress';
import type { GameTemplate, Lesson, TrackDef, TrackId } from './types';

export const BUILTIN_LESSONS: Lesson[] = [vlanLesson, vlanDiagramsLesson, ticketLesson, priorityLesson, macLesson, arpLesson, cableTraceLesson, huntLesson, siemLesson, firewallLogLesson, escalationLesson, evidenceLesson, outageLesson, closeTicketLesson];

export function allLessons(): Lesson[] {
  const imported = loadPacks().flatMap((p) => (p.lessons ?? []).map((l) => ({ ...l, imported: true })));
  const ids = new Set(BUILTIN_LESSONS.map((l) => l.id));
  return [...BUILTIN_LESSONS, ...imported.filter((l) => !ids.has(l.id))];
}

export function allGames(): GameTemplate[] {
  const imported = loadPacks().flatMap((p) => (p.games ?? []).map((g) => ({ ...g, imported: true })));
  const ids = new Set(GAME_TEMPLATES.map((g) => g.id));
  return [...GAME_TEMPLATES, ...imported.filter((g) => !ids.has(g.id))];
}

export const TRACKS: TrackDef[] = [
  { id: 'ccna', title: 'Cisco CCNA', summary: 'Switching, routing, IP services, security fundamentals and automation basics.', learnTrack: 'ccna' },
  { id: 'ccnp', title: 'Cisco CCNP Enterprise', summary: 'Advanced switching (STP guards, VTP, EtherChannel), EIGRP, OSPF areas, FHRP, ACL design.', learnTrack: 'ccnp' },
  { id: 'security-plus', title: 'CompTIA Security+', summary: 'Threats, controls, network security, incident response and governance basics.', learnTrack: 'security-plus' },
  { id: 'ejpt', title: 'eJPT-style offensive security', summary: 'Recon, scanning, exploitation basics and reporting, in a lab you own.' },
  { id: 'soc', title: 'SOC analyst', summary: 'Alert triage, log analysis, hunting, phishing and escalation.', learnTrack: 'interview-soc' },
  { id: 'cloud-security', title: 'Cloud security', summary: 'IAM, network segmentation in the cloud, logging and breach response.', learnTrack: 'aws-security' },
  { id: 'linux', title: 'Linux administration', summary: 'Networking, services, logs and permissions from the shell.' },
  { id: 'windows-ad', title: 'Windows and Active Directory', summary: 'Accounts, lockouts, group policy, DNS and DHCP on Windows Server.' },
  { id: 'automation', title: 'Network automation', summary: 'Config as data, APIs, idempotent changes and verification.' },
  { id: 'incident-response', title: 'Incident response', summary: 'Contain, collect evidence, eradicate, recover and document.' },
  { id: 'helpdesk', title: 'Help desk / IT support', summary: 'Triage, tickets, troubleshooting method, communication and escalation.', learnTrack: 'interview-helpdesk' },
];

export const trackLessons = (t: TrackId) => allLessons().filter((l) => l.tracks.includes(t));
export const trackGames = (t: TrackId) => allGames().filter((g) => g.tracks.includes(t));
