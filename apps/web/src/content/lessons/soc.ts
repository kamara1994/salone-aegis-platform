import type { Lesson } from '../types';

export const huntLesson: Lesson = {
  id: 'hunt-traffic',
  title: 'How to hunt suspicious traffic',
  summary: 'Start from a hypothesis, look for beaconing, odd ports and rare destinations, and confirm with packets and host evidence.',
  tracks: ['soc', 'security-plus', 'incident-response'],
  minutes: 18,
  difficulty: 2,
  tags: ['threat hunting', 'network', 'pcap'],
  sections: [
    {
      id: 'hypothesis',
      title: 'Start with a hypothesis',
      blocks: [
        { type: 'p', text: 'Hunting is not scrolling logs. Pick a question: "Is any workstation beaconing to the internet every 60 seconds?" Then pick the data that answers it.' },
        { type: 'table', head: ['Hypothesis', 'Data', 'Signal'], rows: [['C2 beaconing', 'Firewall / NetFlow', 'Same destination, regular interval, small constant size'], ['Data exfiltration', 'Flow bytes out', 'Large uploads at night to a new destination'], ['Lateral movement', 'Internal flows', 'Workstation-to-workstation SMB/RDP/WinRM'], ['DNS tunnelling', 'DNS logs', 'Very long or random subdomains, high query volume']] },
      ],
    },
    {
      id: 'look',
      title: 'What suspicious looks like',
      blocks: [
        { type: 'code', title: 'Firewall log excerpt', code: '09:00:01 pass out VLAN20 10.10.20.61:51544 -> 185.220.101.4:8443 tcp 412B\n09:01:01 pass out VLAN20 10.10.20.61:51551 -> 185.220.101.4:8443 tcp 412B\n09:02:01 pass out VLAN20 10.10.20.61:51558 -> 185.220.101.4:8443 tcp 412B' },
        { type: 'predict', question: 'What stands out?', options: ['Nothing, it is HTTPS', 'Exact 60-second interval, identical size, rare port to one external IP', 'The source port changes'], answer: 1, explain: 'Regular timing and constant size are classic beaconing. Next: which process on 10.10.20.61 opens these connections?' },
        { type: 'callout', tone: 'tip', text: 'In the Lab, capture on a link and filter by IP: the Wireshark-style list and .pcap export let you practise reading flows.' },
      ],
    },
    {
      id: 'confirm',
      title: 'Confirm on the host',
      blocks: [
        { type: 'cmd', prompt: 'PS C:\\>', command: 'Get-NetTCPConnection -RemoteAddress 185.220.101.4 | Select OwningProcess, State', output: 'OwningProcess State\n------------- -----\n         4412 Established', explain: 'Map the PID to a process (`Get-Process -Id 4412`), check its path, signature and parent.' },
        { type: 'reveal', prompt: 'You confirmed malware. What do you do before anything else?', answer: '**Contain**: isolate the host (EDR isolate or switch port to quarantine VLAN), preserve evidence, and escalate to incident response. Do not reboot or wipe yet.' },
      ],
    },
  ],
};

export const siemLesson: Lesson = {
  id: 'siem-alert',
  title: 'How to investigate a SIEM alert',
  summary: 'Triage an alert in five steps: understand the rule, scope, enrich, decide, document.',
  tracks: ['soc', 'security-plus'],
  minutes: 18,
  difficulty: 2,
  tags: ['siem', 'wazuh', 'triage'],
  sections: [
    {
      id: 'flow',
      title: 'Where alerts come from',
      blocks: [
        { type: 'diagram', name: 'siem-flow', caption: 'Log sources → collector/agents → SIEM rules → alert → analyst decision.' },
        { type: 'p', text: 'Every alert is a rule that matched. Before judging the alert, read **what the rule looks for** and **why it fired**.' },
      ],
    },
    {
      id: 'steps',
      title: 'Five-step triage',
      blocks: [
        { type: 'list', ordered: true, items: ['**Understand**: rule name, MITRE technique, raw event.', '**Scope**: one host or many? one user or many? first time?', '**Enrich**: asset owner, IP reputation, user role, recent changes.', '**Decide**: true positive, benign true positive, or false positive.', '**Document**: verdict, evidence, and actions; tune the rule if it was noise.'] },
        { type: 'code', title: 'Example alert (Wazuh-style)', code: 'rule.id: 60122  level: 10\nrule.description: Multiple Windows logon failures (4625)\nagent.name: WS-FIN-02   srcip: 10.10.20.45\ndata.win.eventdata.targetUserName: a.sesay   count: 23 in 2m' },
        { type: 'quiz', id: 'siem-quiz', questions: [
          { q: '23 failed logons for one user from her own workstation, right after a password change. Most likely?', options: ['Brute-force attack', 'Stale saved credentials (mapped drive, phone, service)', 'Malware'], answer: 1, explain: 'A password change followed by repeated failures from the user’s own device usually means an app still uses the old password.' },
          { q: 'Failures for 40 different users from one external IP in 5 minutes?', options: ['Password spraying', 'Normal', 'Stale credentials'], answer: 0, explain: 'Many users, one source, few attempts each is password spraying: block the source and check for any success.' },
        ] },
      ],
    },
  ],
};

export const firewallLogLesson: Lesson = {
  id: 'firewall-logs',
  title: 'How to read firewall logs',
  summary: 'Read a pf/OPNsense log line, find the rule that matched, and tell a misconfiguration from an attack.',
  tracks: ['soc', 'ccna', 'security-plus'],
  minutes: 12,
  difficulty: 2,
  tags: ['firewall', 'opnsense', 'logs'],
  lab: { workbook: 'acl' },
  sections: [
    {
      id: 'line',
      title: 'One log line, field by field',
      blocks: [
        { type: 'code', code: 'filterlog: 99,,,0,igb1.20,match,block,in,4,0x0,,64,0,0,DF,6,tcp,60,10.10.20.52,10.10.40.10,51044,5432,0,S' },
        { type: 'table', head: ['Field', 'Value', 'Meaning'], rows: [['Rule', '99', 'Which rule matched (here: the default deny)'], ['Interface', 'igb1.20', 'Arrived on the VLAN 20 interface'], ['Action / dir', 'block in', 'Dropped on the way in'], ['Proto', 'tcp', 'TCP'], ['Src → dst', '10.10.20.52 → 10.10.40.10', 'Workstation to database server'], ['Ports', '51044 → 5432', 'PostgreSQL'], ['Flags', 'S', 'SYN: a new connection attempt']] },
      ],
    },
    {
      id: 'judge',
      title: 'Misconfiguration or attack?',
      blocks: [
        { type: 'predict', question: 'A finance workstation trying the database on 5432, blocked by the default deny. What next?', options: ['Call it an attack and isolate', 'Ask whether finance apps should reach the DB directly; check for a change or a new app', 'Ignore it'], answer: 1, explain: 'Users should normally reach the app server, not the DB. It may be a new app (request a rule) or a compromise (investigate if unexpected).' },
        { type: 'lab', text: 'Practise: send packets in the Lab and read which rule blocked them', workbook: 'acl' },
      ],
    },
  ],
};

export const evidenceLesson: Lesson = {
  id: 'collect-evidence',
  title: 'How to collect incident evidence',
  summary: 'Order of volatility, chain of custody, hashing, and what to grab from network, host and cloud before it disappears.',
  tracks: ['incident-response', 'soc', 'security-plus'],
  minutes: 15,
  difficulty: 2,
  tags: ['forensics', 'evidence'],
  sections: [
    {
      id: 'volatility',
      title: 'Order of volatility',
      blocks: [
        { type: 'list', ordered: true, items: ['CPU registers, cache (rarely practical)', '**Memory**: running processes, network connections', '**Network state**: ARP, routing tables, active sessions', 'Temporary files, swap', 'Disk', 'Logs on remote systems (SIEM), backups'] },
        { type: 'callout', tone: 'danger', text: 'Rebooting or "cleaning" a machine destroys memory evidence. Isolate, do not power off, unless told to by incident response.' },
      ],
    },
    {
      id: 'custody',
      title: 'Chain of custody and hashes',
      blocks: [
        { type: 'cmd', prompt: '$', command: 'sha256sum memdump-WS-FIN-02.raw', output: '9f2c…e81a  memdump-WS-FIN-02.raw', explain: 'Hash at collection and before analysis: identical hashes prove the evidence was not altered.' },
        { type: 'table', head: ['Record', 'Example'], rows: [['What', 'Memory image WS-FIN-02, 16 GB'], ['When', '2026-10-29 10:42 UTC'], ['Who', 'J. Kamara (SOC)'], ['How', 'winpmem 4.0 to encrypted USB #7'], ['Hash', 'SHA-256 9f2c…e81a'], ['Handed to', 'IR lead, 11:05, signed']] },
      ],
    },
  ],
};

export const vlanDiagramsLesson: Lesson = {
  id: 'subnet-basics',
  title: 'IPv4 subnetting in five minutes',
  summary: 'Prefixes, masks, network and broadcast addresses, and the block-size trick, then unlimited drills.',
  tracks: ['ccna', 'helpdesk', 'security-plus'],
  minutes: 15,
  difficulty: 1,
  tags: ['subnetting', 'ipv4'],
  sections: [
    {
      id: 'mask',
      title: 'Prefix and mask',
      blocks: [
        { type: 'table', head: ['Prefix', 'Mask', 'Block size', 'Usable hosts'], rows: [['/24', '255.255.255.0', '256', '254'], ['/25', '255.255.255.128', '128', '126'], ['/26', '255.255.255.192', '64', '62'], ['/27', '255.255.255.224', '32', '30'], ['/28', '255.255.255.240', '16', '14'], ['/30', '255.255.255.252', '4', '2']] },
        { type: 'p', text: '**Block size** = 256 − the interesting mask octet. Networks start at multiples of the block size.' },
      ],
    },
    {
      id: 'example',
      title: 'Worked example',
      blocks: [
        { type: 'reveal', prompt: '10.10.20.77/27: network, broadcast, hosts?', answer: 'Block 32: networks at .0, .32, .64, .96. 77 is in **.64**. Network **10.10.20.64**, broadcast **10.10.20.95**, hosts **.65-.94** (30 hosts).' },
        { type: 'callout', tone: 'tip', text: 'Learn → Subnetting gives unlimited generated drills with a timer and streaks.' },
      ],
    },
  ],
};
