// Certification focus: the drop-down in the top bar. Choosing one scopes the cockpit, Learn (topics,
// exams, flashcards, tracks), the Labs picker and Games to that certification.
// Exam domain names are summarised from each vendor's public exam outline; always check the vendor's
// current outline before booking an exam. No exam questions are reproduced.
import { ALL_TOPICS, type CourseId, type Topic } from './topics';
import type { TrackId } from './types';

export interface Cert {
  id: string;
  name: string;
  short: string;
  /** Drop-down text when the automatic one reads badly */
  label?: string;
  vendor: string;
  level: 'Entry' | 'Intermediate' | 'Advanced';
  format: string;
  summary: string;
  domains: string[];
  /** Which parts of the topic catalog belong to this certification */
  scope: { course: CourseId; units?: string[] }[];
  extraTopics?: string[];
  track?: TrackId;
  /** Recommended guided labs (workbook ids), in study order */
  labs: string[];
  /** Recommended game templates */
  games: string[];
  /** AI practice track key, when the back end offers one */
  aiTrack?: string;
}

const MC = 'Multiple choice with performance-based questions';
const PRACTICAL = 'Hands-on practical exam with a written report or answers';

export const CERTS: Cert[] = [
  // ---------------- CompTIA ----------------
  {
    id: 'a-plus', name: 'CompTIA A+', short: 'A+', vendor: 'CompTIA', level: 'Entry', format: MC,
    summary: 'IT support foundations: hardware, operating systems, networking basics, security and troubleshooting.',
    domains: ['Hardware and mobile devices', 'Networking basics', 'Operating systems', 'Security basics', 'Software troubleshooting', 'Operational procedures'],
    scope: [{ course: 'it-support' }, { course: 'networking', units: ['Fundamentals', 'IP addressing'] }, { course: 'windows-ad', units: ['Windows administration'] }, { course: 'linux', units: ['Basics'] }],
    extraTopics: ['phishing', 'malware', 'auth-factors', 'backups', 'wifi-security'],
    track: 'helpdesk', labs: ['first-network', 'cable-types', 'small-office', 'wireless-office'], games: ['helpdesk', 'cable-repair', 'wireless', 'active-directory'],
  },
  {
    id: 'network-plus', name: 'CompTIA Network+', short: 'Network+', vendor: 'CompTIA', level: 'Entry', format: MC,
    summary: 'Vendor-neutral networking: concepts, implementation, operations, security and troubleshooting.',
    domains: ['Networking concepts', 'Network implementation', 'Network operations', 'Network security', 'Network troubleshooting'],
    scope: [{ course: 'networking' }],
    extraTopics: ['troubleshooting-method', 'no-internet', 'segmentation', 'firewalls-ids'],
    track: 'ccna', labs: ['first-network', 'cable-types', 'subnet-plan', 'vlans-trunking', 'router-on-a-stick', 'static-routing', 'dhcp', 'nat', 'small-office', 'wireless-office'], games: ['noc-outage', 'dns', 'cable-repair', 'wireless', 'vpn'], aiTrack: 'ccna',
  },
  {
    id: 'security-plus', name: 'CompTIA Security+', short: 'Security+', vendor: 'CompTIA', level: 'Entry', format: MC,
    summary: 'Core security: threats, architecture, operations and governance. The baseline for most security jobs.',
    domains: ['General security concepts', 'Threats, vulnerabilities and mitigations', 'Security architecture', 'Security operations', 'Security program management and oversight'],
    scope: [{ course: 'security-plus' }, { course: 'networking', units: ['Network security'] }],
    extraTopics: ['ir-plan', 'shared-responsibility', 'iam-basics', 'logs'],
    track: 'security-plus', labs: ['firewall-dmz', 'acl', 'port-security', 'dhcp-snooping', 'soc-investigate', 'basic-switch'], games: ['phishing', 'soc-alert', 'ransomware', 'firewall', 'cloud-breach'], aiTrack: 'security-plus',
  },
  {
    id: 'cysa-plus', name: 'CompTIA CySA+', short: 'CySA+', vendor: 'CompTIA', level: 'Intermediate', format: MC,
    summary: 'Security analyst: detection, analysis, vulnerability management and incident response.',
    domains: ['Security operations', 'Vulnerability management', 'Incident response and management', 'Reporting and communication'],
    scope: [{ course: 'soc' }, { course: 'incident-response' }, { course: 'security-plus', units: ['Operations'] }],
    track: 'soc', labs: ['soc-investigate', 'firewall-dmz', 'dhcp-snooping'], games: ['soc-alert', 'phishing', 'ransomware', 'firewall'],
  },
  {
    id: 'pentest-plus', name: 'CompTIA PenTest+', short: 'PenTest+', vendor: 'CompTIA', level: 'Intermediate', format: MC,
    summary: 'Planning, scoping, recon, attacks, post-exploitation and reporting for authorised tests.',
    domains: ['Engagement management', 'Reconnaissance and enumeration', 'Vulnerability discovery and analysis', 'Attacks and exploits', 'Post-exploitation and lateral movement'],
    scope: [{ course: 'pentest' }, { course: 'security-plus', units: ['Threats and attacks'] }],
    extraTopics: ['ad-attacks', 'kerberos', 'ntlm'],
    track: 'ejpt', labs: ['firewall-dmz', 'acl', 'dhcp-snooping'], games: ['pentest', 'phishing'],
  },
  {
    id: 'securityx', name: 'CompTIA SecurityX (CASP+)', short: 'SecurityX', vendor: 'CompTIA', level: 'Advanced', format: MC,
    summary: 'Advanced security architecture, engineering, operations and governance for senior practitioners.',
    domains: ['Governance, risk and compliance', 'Security architecture', 'Security engineering', 'Security operations'],
    scope: [{ course: 'security-plus' }, { course: 'cloud-security' }, { course: 'incident-response' }],
    extraTopics: ['zero-trust', 'segmentation', 'vxlan-evpn', 'high-availability'],
    track: 'security-plus', labs: ['enterprise-campus', 'firewall-dmz', 'soc-investigate'], games: ['cloud-breach', 'ransomware', 'disaster-recovery', 'change-window'],
  },
  {
    id: 'linux-plus', name: 'CompTIA Linux+', short: 'Linux+', vendor: 'CompTIA', level: 'Intermediate', format: MC,
    summary: 'Linux administration, security, scripting and troubleshooting.',
    domains: ['System management', 'Services and user management', 'Security', 'Automation, orchestration and scripting', 'Troubleshooting'],
    scope: [{ course: 'linux' }, { course: 'automation', units: ['Automation and scripting'] }],
    track: 'linux', labs: ['first-network', 'subnet-plan'], games: ['dns', 'vpn'],
  },
  {
    id: 'cloud-plus', name: 'CompTIA Cloud+', short: 'Cloud+', vendor: 'CompTIA', level: 'Intermediate', format: MC,
    summary: 'Cloud architecture, deployment, security, operations and troubleshooting.',
    domains: ['Cloud architecture', 'Deployment', 'Operations', 'Security', 'DevOps fundamentals', 'Troubleshooting'],
    scope: [{ course: 'cloud-security' }, { course: 'automation' }],
    track: 'cloud-security', labs: ['firewall-dmz'], games: ['cloud-breach', 'disaster-recovery'],
  },
  // ---------------- Cisco ----------------
  {
    id: 'ccna', name: 'Cisco CCNA', short: 'CCNA', vendor: 'Cisco', level: 'Entry', format: MC,
    summary: 'Network fundamentals, access, IP connectivity and services, security fundamentals, automation.',
    domains: ['Network fundamentals', 'Network access', 'IP connectivity', 'IP services', 'Security fundamentals', 'Automation and programmability'],
    scope: [{ course: 'networking' }],
    track: 'ccna', labs: ['basic-switch', 'vlans-trunking', 'router-on-a-stick', 'l3-switch', 'stp', 'etherchannel', 'port-security', 'dhcp', 'dhcp-snooping', 'static-routing', 'ospf', 'acl', 'nat', 'fhrp', 'wireless-office'], games: ['noc-outage', 'cable-repair', 'wireless', 'dns', 'vpn'], aiTrack: 'ccna',
  },
  {
    id: 'ccnp', label: 'CCNP Enterprise (ENCOR)', name: 'Cisco CCNP Enterprise (ENCOR)', short: 'CCNP', vendor: 'Cisco', level: 'Advanced', format: MC,
    summary: 'Enterprise architecture, virtualisation, infrastructure, assurance, security and automation.',
    domains: ['Architecture', 'Virtualisation', 'Infrastructure', 'Network assurance', 'Security', 'Automation'],
    scope: [{ course: 'advanced-networking' }, { course: 'networking', units: ['Switching', 'Routing', 'Automation'] }],
    track: 'ccnp', labs: ['stp', 'etherchannel', 'vtp-dtp', 'stp-guard', 'ospf', 'eigrp', 'fhrp', 'enterprise-campus'], games: ['noc-outage', 'change-window'], aiTrack: 'ccnp',
  },
  {
    id: 'cyberops', label: 'CyberOps Associate', name: 'Cisco CyberOps Associate', short: 'CyberOps', vendor: 'Cisco', level: 'Entry', format: 'Multiple choice',
    summary: 'SOC analyst foundations: security concepts, monitoring, host and network analysis, policies.',
    domains: ['Security concepts', 'Security monitoring', 'Host-based analysis', 'Network intrusion analysis', 'Security policies and procedures'],
    scope: [{ course: 'soc' }, { course: 'networking', units: ['Fundamentals'] }, { course: 'security-plus', units: ['Security concepts'] }],
    track: 'soc', labs: ['soc-investigate', 'firewall-dmz'], games: ['soc-alert', 'phishing', 'dns'],
  },
  // ---------------- TCM Security ----------------
  {
    id: 'psaa', name: 'TCM Practical SOC Analyst Associate (PSAA)', short: 'PSAA', vendor: 'TCM Security', level: 'Entry', format: PRACTICAL,
    summary: 'Hands-on SOC work: phishing analysis, SIEM, network and endpoint investigation, writing it up.',
    domains: ['SOC fundamentals', 'Phishing analysis', 'Network security monitoring and traffic analysis', 'Endpoint security and log analysis', 'SIEM and detection', 'Threat intelligence', 'Digital forensics basics', 'Incident documentation'],
    scope: [{ course: 'soc' }, { course: 'incident-response' }],
    extraTopics: ['windows-events', 'event-logs-windows', 'logs', 'phishing', 'malware', 'dns-threats'],
    track: 'soc', labs: ['soc-investigate', 'firewall-dmz'], games: ['soc-alert', 'phishing', 'ransomware', 'dns'],
  },
  {
    id: 'pjpt', name: 'TCM Practical Junior Penetration Tester (PJPT)', short: 'PJPT', vendor: 'TCM Security', level: 'Entry', format: PRACTICAL,
    summary: 'Internal network penetration test with an Active Directory focus, ending in a professional report.',
    domains: ['Internal network reconnaissance', 'Active Directory initial attack vectors', 'Post-compromise enumeration', 'Post-compromise attacks', 'Reporting and debrief'],
    scope: [{ course: 'pentest' }, { course: 'windows-ad', units: ['AD security', 'Active Directory'] }],
    extraTopics: ['ntlm', 'arp', 'network-attacks', 'password-attacks'],
    track: 'ejpt', labs: ['dhcp-snooping', 'port-security', 'acl'], games: ['pentest', 'active-directory'],
  },
  {
    id: 'pnpt', name: 'TCM Practical Network Penetration Tester (PNPT)', short: 'PNPT', vendor: 'TCM Security', level: 'Intermediate', format: PRACTICAL,
    summary: 'External and internal network test: OSINT, perimeter, Active Directory compromise, report and live debrief.',
    domains: ['OSINT', 'External network testing', 'Active Directory exploitation', 'Pivoting and lateral movement', 'Reporting and live debrief'],
    scope: [{ course: 'pentest' }, { course: 'windows-ad' }, { course: 'linux', units: ['Security and networking'] }],
    track: 'ejpt', labs: ['firewall-dmz', 'dhcp-snooping'], games: ['pentest', 'active-directory', 'phishing'],
  },
  // ---------------- INE / eLearnSecurity ----------------
  {
    id: 'ejpt', name: 'INE eLearnSecurity Junior Penetration Tester (eJPT)', short: 'eJPT', vendor: 'INE', level: 'Entry', format: PRACTICAL,
    summary: 'Entry pentesting in a live lab: assessment methodology, host and network auditing, web testing.',
    domains: ['Assessment methodologies', 'Host and network auditing', 'Host and network penetration testing', 'Web application penetration testing'],
    scope: [{ course: 'pentest' }, { course: 'networking', units: ['Fundamentals', 'IP addressing'] }, { course: 'linux', units: ['Basics'] }],
    extraTopics: ['subnetting', 'arp', 'dns', 'password-attacks', 'app-attacks'],
    track: 'ejpt', labs: ['subnet-plan', 'firewall-dmz', 'acl'], games: ['pentest'],
  },
  {
    id: 'ecppt', name: 'INE eLearnSecurity Certified Professional Penetration Tester (eCPPT)', short: 'eCPPT', vendor: 'INE', level: 'Intermediate', format: PRACTICAL,
    summary: 'Professional penetration testing: network, web, privilege escalation, pivoting and reporting.',
    domains: ['Information gathering and enumeration', 'Exploitation', 'Privilege escalation', 'Pivoting and lateral movement', 'Web application attacks', 'Reporting'],
    scope: [{ course: 'pentest' }, { course: 'windows-ad', units: ['AD security'] }, { course: 'automation', units: ['Automation and scripting'] }],
    track: 'ejpt', labs: ['firewall-dmz'], games: ['pentest'],
  },
  // ---------------- OffSec ----------------
  {
    id: 'oscp', label: 'OSCP: OffSec Certified Professional', name: 'OffSec Certified Professional (OSCP)', short: 'OSCP', vendor: 'OffSec', level: 'Advanced', format: PRACTICAL,
    summary: 'Proctored hands-on exam: enumerate, exploit and escalate across Linux, Windows and Active Directory, then report.',
    domains: ['Information gathering', 'Web application attacks', 'Client-side and public exploits', 'Privilege escalation (Linux and Windows)', 'Active Directory attacks', 'Reporting'],
    scope: [{ course: 'pentest' }, { course: 'linux' }, { course: 'windows-ad' }],
    track: 'ejpt', labs: ['firewall-dmz'], games: ['pentest', 'active-directory'],
  },
  // ---------------- ISC2 ----------------
  {
    id: 'isc2-cc', name: 'ISC2 Certified in Cybersecurity (CC)', short: 'ISC2 CC', vendor: 'ISC2', level: 'Entry', format: 'Multiple choice',
    summary: 'Entry security principles: concepts, continuity, access control, network security and operations.',
    domains: ['Security principles', 'Business continuity, disaster recovery and incident response', 'Access control concepts', 'Network security', 'Security operations'],
    scope: [{ course: 'security-plus', units: ['Security concepts', 'Governance and risk'] }, { course: 'networking', units: ['Fundamentals'] }],
    extraTopics: ['incident-lifecycle', 'backups', 'least-privilege', 'physical-security', 'firewalls-ids'],
    track: 'security-plus', labs: ['first-network', 'firewall-dmz'], games: ['phishing', 'disaster-recovery'],
  },
  {
    id: 'cissp', name: 'ISC2 CISSP', short: 'CISSP', vendor: 'ISC2', level: 'Advanced', format: 'Adaptive multiple choice',
    summary: 'Security leadership across eight domains, from risk management to software security.',
    domains: ['Security and risk management', 'Asset security', 'Security architecture and engineering', 'Communication and network security', 'Identity and access management', 'Security assessment and testing', 'Security operations', 'Software development security'],
    scope: [{ course: 'security-plus' }, { course: 'cloud-security' }, { course: 'incident-response' }],
    extraTopics: ['segmentation', 'vpn-basics', 'aaa', 'owasp-top10'],
    track: 'security-plus', labs: ['enterprise-campus', 'firewall-dmz'], games: ['disaster-recovery', 'change-window', 'ransomware'],
  },
  // ---------------- Cloud ----------------
  {
    id: 'aws-security', label: 'AWS Security Specialty', name: 'AWS Certified Security - Specialty', short: 'AWS Security', vendor: 'AWS', level: 'Advanced', format: 'Multiple choice and multiple response',
    summary: 'Securing AWS: detection, incident response, infrastructure, identity, data protection and governance.',
    domains: ['Threat detection and incident response', 'Security logging and monitoring', 'Infrastructure security', 'Identity and access management', 'Data protection', 'Management and security governance'],
    scope: [{ course: 'cloud-security' }],
    extraTopics: ['incident-lifecycle', 'encryption', 'pki', 'iac'],
    track: 'cloud-security', labs: ['firewall-dmz'], games: ['cloud-breach'], aiTrack: 'aws-security',
  },
  {
    id: 'sc-200', name: 'Microsoft Security Operations Analyst (SC-200)', short: 'SC-200', vendor: 'Microsoft', level: 'Intermediate', format: MC,
    summary: 'SOC work in Microsoft Defender and Sentinel: detection, investigation, hunting and response.',
    domains: ['Manage a security operations environment', 'Configure protections and detections', 'Manage incident response', 'Perform threat hunting'],
    scope: [{ course: 'soc' }, { course: 'windows-ad', units: ['AD security', 'Windows administration'] }],
    extraTopics: ['incident-lifecycle', 'brute-force-detection'],
    track: 'soc', labs: ['soc-investigate'], games: ['soc-alert', 'phishing', 'active-directory'],
  },
  // ---------------- Blue team / GIAC ----------------
  {
    id: 'btl1', label: 'BTL1: Blue Team Level 1', name: 'Security Blue Team Level 1 (BTL1)', short: 'BTL1', vendor: 'Security Blue Team', level: 'Entry', format: PRACTICAL,
    summary: 'Hands-on blue team: phishing analysis, threat intel, forensics, SIEM and incident response.',
    domains: ['Security fundamentals', 'Phishing analysis', 'Threat intelligence', 'Digital forensics', 'SIEM', 'Incident response'],
    scope: [{ course: 'soc' }, { course: 'incident-response' }],
    track: 'soc', labs: ['soc-investigate'], games: ['soc-alert', 'phishing', 'ransomware'],
  },
  {
    id: 'gsec', name: 'GIAC Security Essentials (GSEC)', short: 'GSEC', vendor: 'GIAC', level: 'Intermediate', format: 'Proctored multiple choice with practical labs',
    summary: 'Broad hands-on security essentials across networking, Linux, Windows, cloud and defence.',
    domains: ['Network security and architecture', 'Linux and Windows security', 'Cryptography', 'Defence in depth and access control', 'Incident handling and logging', 'Cloud security'],
    scope: [{ course: 'security-plus' }, { course: 'linux', units: ['Security and networking'] }, { course: 'windows-ad', units: ['AD security'] }, { course: 'networking', units: ['Network security'] }],
    track: 'security-plus', labs: ['firewall-dmz', 'acl', 'soc-investigate'], games: ['soc-alert', 'firewall'],
  },
  {
    id: 'gcih', name: 'GIAC Certified Incident Handler (GCIH)', short: 'GCIH', vendor: 'GIAC', level: 'Intermediate', format: 'Proctored multiple choice with practical labs',
    summary: 'Incident handling and the attacker techniques behind incidents.',
    domains: ['Incident handling process', 'Reconnaissance and scanning', 'Exploitation and password attacks', 'Post-exploitation and persistence', 'Detection and response'],
    scope: [{ course: 'incident-response' }, { course: 'soc' }, { course: 'pentest', units: ['Planning and recon', 'Enumeration and exploitation'] }],
    track: 'incident-response', labs: ['soc-investigate', 'firewall-dmz'], games: ['ransomware', 'soc-alert', 'pentest'],
  },
];

export const CERT_VENDORS = [...new Set(CERTS.map((c) => c.vendor))];
export const certById = (id: string | null | undefined) => CERTS.find((c) => c.id === id);

/** Every topic that belongs to a certification, in course order without duplicates. */
export function certTopics(c: Cert): Topic[] {
  const out: Topic[] = [];
  const seen = new Set<string>();
  for (const s of c.scope) for (const t of ALL_TOPICS) if (t.course === s.course && (!s.units || s.units.includes(t.unit)) && !seen.has(t.id)) (seen.add(t.id), out.push(t));
  for (const id of c.extraTopics ?? []) {
    const t = ALL_TOPICS.find((x) => x.id === id);
    if (t && !seen.has(t.id)) (seen.add(t.id), out.push(t));
  }
  return out;
}
