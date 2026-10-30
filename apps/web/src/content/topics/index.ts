// The topic catalog: courses, units and every topic, plus lookups used by the Learn page.
import { ADVANCED_NETWORKING } from './advanced-networking';
import { CLOUD_SECURITY } from './cloud-security';
import { AUTOMATION, INCIDENT_RESPONSE } from './ir-automation';
import { IT_SUPPORT } from './it-support';
import { LINUX } from './linux';
import { NETWORKING } from './networking';
import { PENTEST } from './pentest';
import { SECURITY_PLUS } from './security-plus';
import { SOC } from './soc';
import type { Course, CourseId, TeachLevel, Topic } from './types';
import { WINDOWS_AD } from './windows-ad';

export * from './types';

export const ALL_TOPICS: Topic[] = [...NETWORKING, ...ADVANCED_NETWORKING, ...SECURITY_PLUS, ...SOC, ...PENTEST, ...CLOUD_SECURITY, ...LINUX, ...WINDOWS_AD, ...IT_SUPPORT, ...INCIDENT_RESPONSE, ...AUTOMATION];

const C = (id: CourseId, title: string, summary: string): Course => ({ id, title, summary, units: [...new Set(ALL_TOPICS.filter((t) => t.course === id).map((t) => t.unit))] });

export const COURSES: Course[] = [
  C('networking', 'Networking (CCNA)', 'How networks work, from cables and IP addresses to VLANs, routing, services, security and wireless.'),
  C('advanced-networking', 'Advanced networking (CCNP)', 'OSPF areas, BGP, redistribution, VRFs, MPLS, VXLAN, QoS and high availability.'),
  C('security-plus', 'Security fundamentals (Security+)', 'Core security concepts, threats, architecture, operations and governance.'),
  C('soc', 'SOC analyst', 'Monitoring, triage, logs, detection, threat hunting and case work in a security operations center.'),
  C('pentest', 'Penetration testing (eJPT)', 'Authorised testing: recon, scanning, exploitation, web testing, privilege escalation and reporting.'),
  C('cloud-security', 'Cloud security (AWS)', 'Shared responsibility, IAM, VPC security, S3, KMS, logging, detection and cloud incident response.'),
  C('linux', 'Linux', 'Filesystem, permissions, users, services, logs, networking and hardening.'),
  C('windows-ad', 'Windows and Active Directory', 'Domains, Group Policy, Kerberos, event logs, PowerShell and AD security.'),
  C('it-support', 'IT support and help desk', 'Tickets, priorities, troubleshooting method, common fixes and communication.'),
  C('incident-response', 'Incident response', 'Plans, detection, containment, recovery, evidence and communication.'),
  C('automation', 'Automation and scripting', 'Python, Netmiko, YAML/JSON, Ansible, Git, APIs, infrastructure as code and CI/CD.'),
];

export const topicById = (id: string) => ALL_TOPICS.find((t) => t.id === id);
export const courseTopics = (c: CourseId) => ALL_TOPICS.filter((t) => t.course === c);
export function teachingText(t: Topic, level: TeachLevel) {
  if (level === 'simple') return t.simple;
  return [t.technical, t.advanced].map((part) => part.trim()).filter(Boolean).join('\n\n');
}
export function topicMatches(t: Topic, q: string) {
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return `${t.title} ${t.unit} ${t.terms.map((x) => x.join(' ')).join(' ')} ${t.simple} ${t.technical} ${t.advanced}`.toLowerCase().includes(n);
}
