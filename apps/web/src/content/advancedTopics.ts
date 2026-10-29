import type { Lesson, TrackId } from './types';

/**
 * The advanced catalogue is intentionally data-driven.  Each item is a real,
 * searchable lesson in the existing Learn reader; adding a topic does not
 * require adding another route or another bespoke component.
 */
type Topic = { title: string; summary: string; tags: string[] };

const COURSE_TOPICS: Record<TrackId, Topic[]> = {
  ccna: [
    ['IPv4 subnetting and VLSM', 'Design address space for users, servers, transit links and growth.', ['ipv4', 'subnetting', 'vlsm']],
    ['IPv6 addressing and SLAAC', 'Read global, link-local, unique-local and multicast addresses, then verify neighbour discovery.', ['ipv6', 'slaac']],
    ['Ethernet framing and MTU', 'Follow an Ethernet frame from NIC to switch and diagnose fragmentation and giant frames.', ['ethernet', 'mtu']],
    ['MAC learning and flooding', 'Predict how a switch learns, forwards, floods and ages a MAC entry.', ['switching', 'mac-table']],
    ['ARP and neighbour discovery', 'Trace ARP requests, replies, cache expiry and common gateway failures.', ['arp', 'ndp']],
    ['Static routes and administrative distance', 'Build deterministic paths and prove why one route wins over another.', ['routing', 'static-route']],
    ['OSPF single-area fundamentals', 'Form neighbours, calculate costs and read the shortest-path decision.', ['ospf', 'routing']],
    ['DHCP relay and lease lifecycle', 'Follow DISCOVER through a relay and troubleshoot missing offers.', ['dhcp', 'ip-services']],
    ['NAT and PAT fundamentals', 'Map inside-local, inside-global and outside addresses while preserving sessions.', ['nat', 'ip-services']],
    ['Secure device management', 'Replace insecure access with SSH, AAA, role separation and management-plane ACLs.', ['ssh', 'aaa', 'hardening']],
    ['Wireless channels and roaming', 'Plan channels, power, SSIDs and roaming without creating a hidden RF problem.', ['wifi', 'rf']],
    ['Network verification workflow', 'Use show commands, packet captures and a change record to prove a fix.', ['troubleshooting', 'operations']],
  ].map(([title, summary, tags]) => ({ title: title as string, summary: summary as string, tags: tags as string[] })),
  ccnp: [
    ['STP root design and guard features', 'Design deterministic root placement and contain loops with BPDU Guard, Root Guard and Loop Guard.', ['stp', 'rstp']],
    ['MST region planning', 'Map VLANs to MST instances and prevent region mismatch during migration.', ['mst', 'stp']],
    ['EtherChannel negotiation', 'Compare LACP, PAgP and static bundles and prove why a member is suspended.', ['etherchannel', 'lacp']],
    ['VTP and transparent operation', 'Control VLAN database propagation and avoid accidental domain-wide changes.', ['vtp', 'vlans']],
    ['EIGRP metrics and feasibility', 'Calculate composite metrics, feasible successors and query boundaries.', ['eigrp', 'routing']],
    ['OSPF multi-area design', 'Place ABRs, summarise routes and diagnose area, MTU and network-type mismatches.', ['ospf', 'areas']],
    ['BGP policy fundamentals', 'Read path attributes and apply safe inbound and outbound policy at an edge.', ['bgp', 'policy']],
    ['HSRP and gateway resilience', 'Choose an active gateway, tune pre-emption and verify failover behaviour.', ['hsrp', 'fhrp']],
    ['QoS classification and marking', 'Classify voice, business and bulk traffic before queuing and policing.', ['qos', 'voip']],
    ['Multicast and IGMP snooping', 'Trace joins, pruning and flooding when receivers move between access switches.', ['multicast', 'igmp']],
    ['Campus segmentation architecture', 'Combine VRFs, VLANs, SVIs and firewall boundaries for a resilient campus.', ['vrf', 'campus']],
    ['Change validation and rollback', 'Use pre-checks, post-checks and a timed rollback plan for production changes.', ['change-management', 'operations']],
  ].map(([title, summary, tags]) => ({ title: title as string, summary: summary as string, tags: tags as string[] })),
  'security-plus': [
    ['Threat modelling with STRIDE', 'Turn an asset inventory into abuse cases, controls and testable mitigations.', ['threat-model', 'stride']],
    ['Identity, authentication and MFA', 'Separate identification, authentication, authorisation and accounting in a real workflow.', ['iam', 'mfa']],
    ['Network security architecture', 'Place firewalls, proxies, NAC and segmentation controls at the correct trust boundary.', ['firewall', 'segmentation']],
    ['Vulnerability prioritisation', 'Combine exploitability, asset criticality and exposure instead of chasing the highest CVSS alone.', ['vulnerability', 'risk']],
    ['PKI and certificate operations', 'Read a certificate chain, plan renewal and diagnose trust and name failures.', ['pki', 'tls']],
    ['Secure configuration baselines', 'Build measurable hardening baselines for endpoints, switches and servers.', ['hardening', 'cis']],
    ['Incident response lifecycle', 'Prepare, detect, contain, eradicate, recover and capture lessons without destroying evidence.', ['incident-response', 'ir']],
    ['Digital evidence handling', 'Preserve chain of custody and distinguish volatile from persistent evidence.', ['forensics', 'evidence']],
    ['Data loss prevention design', 'Identify sensitive data paths and choose policy, endpoint and network controls.', ['dlp', 'data-security']],
    ['Business continuity and recovery', 'Translate RTO and RPO into backups, replicas, runbooks and exercises.', ['bcp', 'dr']],
    ['Security governance and policy', 'Write a policy that maps an owner, control, exception and verification method.', ['governance', 'policy']],
    ['Third-party and supply-chain risk', 'Assess vendor access, dependencies, attestations and exit plans.', ['supply-chain', 'risk']],
  ].map(([title, summary, tags]) => ({ title: title as string, summary: summary as string, tags: tags as string[] })),
  ejpt: [
    ['Rules of engagement and scope', 'Plan an authorised assessment with scope, exclusions, evidence and stop conditions.', ['recon', 'ethics']],
    ['Passive reconnaissance', 'Collect names, ranges and technologies without touching systems aggressively.', ['osint', 'recon']],
    ['Service discovery and fingerprinting', 'Turn open ports into a ranked attack surface and verify false positives.', ['nmap', 'scanning']],
    ['Web enumeration', 'Map hosts, paths, parameters and authentication boundaries in an owned lab.', ['web', 'enumeration']],
    ['Credential attack safety', 'Choose spraying, guessing or offline cracking only when authorised and measurable.', ['credentials', 'passwords']],
    ['Linux privilege escalation', 'Find unsafe permissions, services, capabilities and secrets without blind exploitation.', ['linux', 'privesc']],
    ['Windows privilege escalation', 'Inspect services, tokens, scheduled tasks and local policy for escalation paths.', ['windows', 'privesc']],
    ['Pivoting and port forwarding', 'Reach an isolated segment through a controlled foothold and document every hop.', ['pivoting', 'tunnelling']],
    ['Payload handling and evasion limits', 'Understand payload trade-offs while keeping the exercise safe and observable.', ['payloads', 'opsec']],
    ['Post-exploitation evidence', 'Collect only what proves impact, protect secrets and preserve timestamps.', ['post-exploitation', 'evidence']],
    ['Exploit validation', 'Reproduce a finding, confirm impact and avoid confusing a scanner result with proof.', ['exploitation', 'validation']],
    ['Professional penetration-test reporting', 'Write an executive summary, reproducible finding and remediation plan.', ['reporting', 'remediation']],
  ].map(([title, summary, tags]) => ({ title: title as string, summary: summary as string, tags: tags as string[] })),
  soc: [
    ['Alert triage and confidence scoring', 'Separate signal, benign activity and unresolved suspicion with explicit evidence.', ['triage', 'siem']],
    ['Security Onion hunt workflow', 'Pivot from an alert into endpoint, Zeek, Suricata and packet evidence.', ['security-onion', 'hunting']],
    ['Zeek connection and DNS analysis', 'Use conn, dns, http and ssl records to build a timeline of behaviour.', ['zeek', 'dns']],
    ['Suricata signatures and rule tuning', 'Explain a signature hit, suppress noise safely and preserve detection coverage.', ['suricata', 'ids']],
    ['Windows event hunting', 'Correlate logon, process, PowerShell and scheduled-task events into an attack story.', ['windows', 'event-logs']],
    ['Active Directory attack paths', 'Identify privilege edges, risky delegation and abnormal privileged logons.', ['active-directory', 'identity']],
    ['Linux authentication hunting', 'Investigate sshd, sudo, cron and shell history without over-trusting one source.', ['linux', 'hunting']],
    ['Phishing investigation', 'Extract sender, authentication results, URLs and attachments before containment.', ['phishing', 'email']],
    ['DNS tunnelling detection', 'Use query length, entropy, volume and domain age to score a suspected tunnel.', ['dns', 'exfiltration']],
    ['Endpoint isolation decisions', 'Choose containment that stops harm while preserving the evidence responders need.', ['containment', 'edr']],
    ['Threat-intelligence enrichment', 'Use indicators, context, confidence and expiry dates instead of copy-pasting feeds.', ['threat-intel', 'ioc']],
    ['SOC handoff and escalation', 'Write a handoff another analyst can execute without repeating your investigation.', ['escalation', 'tickets']],
  ].map(([title, summary, tags]) => ({ title: title as string, summary: summary as string, tags: tags as string[] })),
  'cloud-security': [
    ['Cloud shared-responsibility model', 'Map provider, platform and customer controls for each service boundary.', ['cloud', 'governance']],
    ['AWS IAM policy evaluation', 'Resolve identity, resource, boundary, SCP and explicit-deny decisions.', ['aws', 'iam']],
    ['Azure Entra identity controls', 'Design conditional access, privileged identity and workload identities.', ['azure', 'entra']],
    ['Cloud network segmentation', 'Use VPC/VNet routing, security groups, NACLs and private endpoints deliberately.', ['vpc', 'networking']],
    ['Cloud audit logging', 'Enable, centralise, retain and test control-plane and data-plane logs.', ['cloudtrail', 'logging']],
    ['Object-storage exposure', 'Detect public access, weak policies and sensitive data in buckets and blobs.', ['s3', 'storage']],
    ['Container image security', 'Scan provenance, dependencies, secrets and runtime configuration before deployment.', ['containers', 'supply-chain']],
    ['Kubernetes RBAC and network policy', 'Constrain service accounts, namespaces and east-west traffic.', ['kubernetes', 'rbac']],
    ['Serverless security', 'Validate event permissions, dependency risk, secrets and function boundaries.', ['serverless', 'lambda']],
    ['Cloud incident response', 'Acquire snapshots, logs and identity evidence while preserving the timeline.', ['cloud-ir', 'forensics']],
    ['Infrastructure as code review', 'Find insecure defaults before Terraform or CloudFormation changes are applied.', ['terraform', 'iac']],
    ['Cloud cost and security guardrails', 'Prevent abuse and drift with budgets, policy-as-code and alert ownership.', ['finops', 'guardrails']],
  ].map(([title, summary, tags]) => ({ title: title as string, summary: summary as string, tags: tags as string[] })),
  linux: [
    ['Linux boot and systemd', 'Trace boot targets, dependencies, failed units and recovery mode.', ['linux', 'systemd']],
    ['Filesystem permissions and ACLs', 'Calculate effective access across owners, groups, modes and POSIX ACLs.', ['linux', 'permissions']],
    ['Processes, signals and jobs', 'Find a runaway process, understand signals and recover a service safely.', ['processes', 'operations']],
    ['Linux networking', 'Inspect links, routes, neighbours, namespaces and listening sockets.', ['networking', 'iproute2']],
    ['DNS resolution on Linux', 'Follow resolv.conf, systemd-resolved, search domains and split DNS.', ['dns', 'linux']],
    ['SSH hardening and bastions', 'Build key-based access, forced commands, logging and safe forwarding.', ['ssh', 'hardening']],
    ['Journald and log rotation', 'Query time windows and units, then retain logs without filling the disk.', ['logs', 'journald']],
    ['Linux firewalling with nftables', 'Translate intent into chains, stateful rules and verifiable counters.', ['nftables', 'firewall']],
    ['Containers and namespaces', 'Explain isolation boundaries and troubleshoot a container with no network.', ['containers', 'namespaces']],
    ['Cron, timers and persistence', 'Distinguish legitimate automation from a persistence mechanism.', ['cron', 'hunting']],
    ['Backups and restore testing', 'Prove that a backup can be restored and meets the stated RPO.', ['backup', 'recovery']],
    ['Linux performance triage', 'Use CPU, memory, IO and network measurements to find the bottleneck.', ['performance', 'observability']],
  ].map(([title, summary, tags]) => ({ title: title as string, summary: summary as string, tags: tags as string[] })),
  'windows-ad': [
    ['Active Directory forests and trusts', 'Model domains, forests, trusts and authentication paths before changing them.', ['active-directory', 'identity']],
    ['Domain controllers and replication', 'Read replication health and isolate a lingering-object or partner failure.', ['ad', 'replication']],
    ['DNS for Active Directory', 'Explain locator records, secure dynamic updates and split-brain failure modes.', ['dns', 'ad']],
    ['Group Policy processing', 'Trace LSDOU order, security filtering, WMI filters and loopback processing.', ['gpo', 'windows']],
    ['Kerberos authentication', 'Follow AS-REQ, TGT, TGS and service tickets through clock and SPN failures.', ['kerberos', 'authentication']],
    ['NTLM and legacy authentication', 'Identify fallback, relay exposure and safe migration steps.', ['ntlm', 'hardening']],
    ['Privileged access workstations', 'Separate admin identities, tiers, jump hosts and workstation trust.', ['pam', 'tiering']],
    ['Windows event forwarding', 'Centralise security events and prove collection coverage.', ['wef', 'logging']],
    ['PowerShell logging and hunting', 'Use script-block and module logs to reconstruct suspicious execution.', ['powershell', 'hunting']],
    ['AD CS and certificate abuse', 'Review templates, enrollment rights and risky authentication mappings.', ['adcs', 'pki']],
    ['File shares and NTFS access', 'Resolve share plus NTFS permissions and eliminate accidental exposure.', ['smb', 'permissions']],
    ['Domain recovery planning', 'Design a tested recovery path for compromise, backup and trust restoration.', ['recovery', 'ad']],
  ].map(([title, summary, tags]) => ({ title: title as string, summary: summary as string, tags: tags as string[] })),
  automation: [
    ['Automation safety and idempotency', 'Make repeated runs converge without duplicating or destroying configuration.', ['automation', 'idempotency']],
    ['Ansible inventory and variables', 'Model environments cleanly and keep secrets out of playbooks.', ['ansible', 'configuration']],
    ['Network facts and templating', 'Generate device-specific configuration from verified facts.', ['jinja', 'networking']],
    ['Netmiko and SSH automation', 'Open controlled sessions, handle prompts and capture command evidence.', ['python', 'netmiko']],
    ['REST API authentication', 'Use tokens, scopes, expiry and retries without leaking credentials.', ['api', 'security']],
    ['Git-based configuration workflow', 'Review, test, approve and roll back network changes as code.', ['gitops', 'change-management']],
    ['CI validation for infrastructure', 'Run lint, schema, policy and dry-run gates before deployment.', ['ci', 'testing']],
    ['Telemetry and streaming data', 'Consume interface, route and security telemetry without losing ordering.', ['telemetry', 'observability']],
    ['Event-driven remediation', 'Turn a trusted alert into a bounded, reversible action.', ['soar', 'remediation']],
    ['Secrets management', 'Rotate credentials and keep them out of source, logs and artifacts.', ['secrets', 'vault']],
    ['Failure handling and retries', 'Distinguish a transient network error from a dangerous partial change.', ['reliability', 'retries']],
    ['Automation testing with fixtures', 'Test parsing and intent with deterministic device responses.', ['pytest', 'testing']],
  ].map(([title, summary, tags]) => ({ title: title as string, summary: summary as string, tags: tags as string[] })),
  'incident-response': [
    ['Incident command and roles', 'Set an incident lead, scribe, technical lead and communications path.', ['incident', 'coordination']],
    ['Triage under uncertainty', 'Make a safe first decision while facts are incomplete and changing.', ['triage', 'decision-making']],
    ['Timeline construction', 'Normalise timestamps and join identity, endpoint, network and cloud evidence.', ['timeline', 'forensics']],
    ['Containment strategy', 'Choose host, account, network or application containment with known trade-offs.', ['containment', 'response']],
    ['Memory and disk acquisition', 'Select volatile evidence and preserve integrity before destructive remediation.', ['forensics', 'evidence']],
    ['Ransomware response', 'Stop propagation, protect backups and coordinate recovery without improvising.', ['ransomware', 'recovery']],
    ['Business email compromise', 'Trace mailbox rules, tokens, forwarding and payment-change requests.', ['bec', 'email']],
    ['Insider-risk investigation', 'Use least-privilege evidence and privacy-aware escalation.', ['insider', 'governance']],
    ['Malware triage', 'Classify a sample safely from hashes, behaviour and telemetry.', ['malware', 'analysis']],
    ['Eradication and recovery', 'Remove persistence, rebuild trust and verify the environment before reopening.', ['eradication', 'recovery']],
    ['Lessons learned and CAPA', 'Convert an incident into owned corrective actions with due dates and proof.', ['lessons-learned', 'capa']],
    ['Executive and regulatory reporting', 'Explain impact, uncertainty and next actions to different audiences.', ['reporting', 'compliance']],
  ].map(([title, summary, tags]) => ({ title: title as string, summary: summary as string, tags: tags as string[] })),
  helpdesk: [
    ['Structured ticket writing', 'Record impact, scope, evidence, actions and a reproducible resolution.', ['tickets', 'communication']],
    ['Urgency versus impact', 'Choose priority from business effect and time sensitivity, not caller volume.', ['triage', 'priority']],
    ['The OSI troubleshooting method', 'Move from physical link to application without skipping evidence.', ['osi', 'troubleshooting']],
    ['Endpoint network diagnosis', 'Use ipconfig, ping, tracert, arp and name resolution in the right order.', ['windows', 'networking']],
    ['Printer and peripheral failures', 'Separate driver, queue, network, power and hardware causes.', ['endpoint', 'support']],
    ['Account lockout investigation', 'Find the stale credential source without repeatedly locking the user out.', ['identity', 'windows']],
    ['DNS and DHCP support calls', 'Prove whether the failure is lease, reachability, name or application.', ['dns', 'dhcp']],
    ['Remote support safely', 'Verify identity, protect data and leave an auditable session record.', ['remote-support', 'security']],
    ['Escalation quality', 'Hand off a case with facts, tests already run and a precise ask.', ['escalation', 'operations']],
    ['Knowledge-base article design', 'Write a fix another analyst can follow and safely reverse.', ['knowledge-base', 'documentation']],
    ['Change communication', 'Explain maintenance windows, user impact and rollback in plain language.', ['change-management', 'communication']],
    ['Customer empathy under pressure', 'De-escalate a difficult interaction while still collecting technical facts.', ['customer-service', 'communication']],
  ].map(([title, summary, tags]) => ({ title: title as string, summary: summary as string, tags: tags as string[] })),
};

const IMAGE_BY_TOPIC: Record<string, { src: string; alt: string; caption: string }> = {
  'Security Onion hunt workflow': { src: '/learn/visuals/security-onion/alert-timeline.png', alt: 'Simulated Security Onion alert timeline with annotated hunting steps', caption: 'Simulated training interface: begin with the alert time window, then pivot into the related evidence.' },
  'Zeek connection and DNS analysis': { src: '/learn/visuals/security-onion/zeek-suricata-evidence.png', alt: 'Simulated Zeek and Suricata evidence view with annotated fields', caption: 'Simulated training interface: compare connection, DNS and detection evidence before making a conclusion.' },
  'Active Directory attack paths': { src: '/learn/visuals/active-directory/privileged-logon.png', alt: 'Simulated Active Directory privileged logon investigation', caption: 'Simulated training interface: verify the account, source host, time and privilege context.' },
  'DNS tunnelling detection': { src: '/learn/visuals/network-forensics/dns-tunneling.png', alt: 'Simulated DNS tunnelling investigation view', caption: 'Simulated training interface: look for entropy, query length, volume and domain context together.' },
  'Containment strategy': { src: '/learn/visuals/incident-response/contain-escalate.png', alt: 'Simulated incident response containment and escalation workflow', caption: 'Simulated training interface: choose containment that reduces harm while preserving evidence.' },
};

const COURSE_LABELS: Record<TrackId, string> = {
  ccna: 'Networking / CCNA',
  ccnp: 'Advanced Networking / CCNP',
  'security-plus': 'Security+ fundamentals',
  ejpt: 'eJPT offensive security',
  soc: 'SOC analyst',
  'cloud-security': 'Cloud security',
  linux: 'Linux administration',
  'windows-ad': 'Windows and Active Directory',
  automation: 'Network automation',
  'incident-response': 'Incident response',
  helpdesk: 'Help desk and IT support',
};

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function makeLesson(track: TrackId, topic: Topic): Lesson {
  const visual = IMAGE_BY_TOPIC[topic.title];
  const course = COURSE_LABELS[track];
  const visualBlock = visual ? [{ type: 'image' as const, src: visual.src, alt: visual.alt, caption: visual.caption }] : [];
  return {
    id: `topic-${track}-${slug(topic.title)}`,
    title: topic.title,
    summary: topic.summary,
    tracks: [track],
    minutes: 30,
    difficulty: 3,
    tags: [...topic.tags, 'advanced-topic', track],
    sections: [
      {
        id: 'brief',
        title: 'Mission brief',
        blocks: [
          { type: 'p', text: `This **${course}** lesson treats **${topic.title}** as an operator task, not a vocabulary exercise. ${topic.summary}` },
          ...visualBlock,
          { type: 'callout', tone: 'info', title: 'Evidence standard', text: 'Do not stop at “it looks fixed”. Record the observation, the test, the expected result and the result you actually received.' },
          { type: 'list', ordered: true, items: ['Define the asset, user or flow in scope.', 'Collect a baseline before changing anything.', 'Make one reversible change at a time.', 'Verify both the success path and the failure path.', 'Write the handoff so another operator can reproduce it.'] },
        ],
      },
      {
        id: 'operator-workflow',
        title: 'Operator workflow',
        advanced: true,
        blocks: [
          { type: 'h', text: 'What expert operators check' },
          { type: 'table', head: ['Stage', 'Question', 'Evidence to keep'], rows: [
            ['Scope', 'What system, identity or traffic is actually affected?', 'Asset ID, owner, time window'],
            ['Observe', 'What changed and what stayed normal?', 'Logs, counters, packet or process evidence'],
            ['Decide', 'Which hypothesis best explains all observations?', 'Rejected hypotheses and reason'],
            ['Act', 'What is the smallest safe corrective action?', 'Command, change ID, rollback'],
            ['Prove', 'How do we know the issue is resolved?', 'Before/after test and monitoring result'],
          ], caption: 'Use this evidence loop for every advanced topic.' },
          { type: 'callout', tone: 'warn', title: 'Common failure', text: 'A successful command is not proof of a successful service. Check the dependent path, the user-visible outcome and the relevant telemetry.' },
          { type: 'quiz', id: `quiz-${track}-${slug(topic.title)}`, questions: [
            { q: 'What should happen before a corrective change?', options: ['Collect a baseline and define success', 'Delete the noisy logs', 'Restart every device'], answer: 0, explain: 'A baseline makes the change measurable and gives you a safe comparison.' },
            { q: 'What makes an escalation useful?', options: ['Only the error message', 'Facts, tests already run and a precise ask', 'A screenshot with no timestamp'], answer: 1, explain: 'A strong handoff prevents duplicate work and preserves the decision trail.' },
          ] },
        ],
      },
      {
        id: 'practical-check',
        title: 'Practical check',
        blocks: [
          { type: 'p', text: `Open the Lab or Games area and create a small scenario for **${topic.title}**. Capture the initial state, introduce one controlled fault, diagnose it, and document the verification result.` },
          { type: 'reveal', prompt: 'What earns a passing operator handoff?', answer: 'A clear scope, a timestamped observation, the evidence that supports the diagnosis, the exact change or escalation, and a verification step that another person can repeat.' },
        ],
      },
    ],
  };
}

export const ADVANCED_TOPIC_LESSONS: Lesson[] = (Object.entries(COURSE_TOPICS) as [TrackId, Topic[]][]).flatMap(([track, topics]) => topics.map((topic) => makeLesson(track, topic)));

export const ADVANCED_TOPIC_COUNTS = Object.fromEntries(Object.entries(COURSE_TOPICS).map(([track, topics]) => [track, topics.length])) as Record<TrackId, number>;
