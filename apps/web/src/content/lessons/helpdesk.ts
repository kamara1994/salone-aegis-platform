import type { Lesson } from '../types';

export const ticketLesson: Lesson = {
  id: 'write-ticket',
  title: 'How to write a professional ticket',
  summary: 'Turn a vague complaint into a ticket the next engineer can act on: summary, impact, scope, steps, evidence and next action.',
  tracks: ['helpdesk', 'incident-response'],
  minutes: 15,
  difficulty: 1,
  tags: ['ticket', 'itsm', 'documentation'],
  sections: [
    {
      id: 'anatomy',
      title: 'Anatomy of a good ticket',
      blocks: [
        { type: 'p', text: 'A ticket is a message to a stranger who must fix the problem without calling you. It needs **what, who, since when, how bad, what was tried, and what is next**.' },
        { type: 'table', head: ['Field', 'Good example'], rows: [['Summary', 'Finance VLAN users cannot reach SalonePay (HTTPS) since 09:40'], ['Requester', 'Aminata Sesay, Finance, ext 2214'], ['Impact / urgency', 'Department / High (payroll run due 12:00)'], ['Scope', '6 users in Finance; other departments OK'], ['Steps to reproduce', 'From WS-FIN-07: browse https://salonepay.lab → timeout'], ['Evidence', 'Ping to 10.10.30.20 OK; TCP 443 blocked by FW01 rule 99 (screenshot attached)'], ['Next action', 'Network team to review FW01 change from 09:35']] },
      ],
    },
    {
      id: 'compare',
      title: 'Bad vs good',
      blocks: [
        { type: 'compare', before: { title: 'Bad', text: '"Internet broken for user, pls fix ASAP"' }, after: { title: 'Good', text: '"WS-FIN-07 (Aminata Sesay) cannot open SalonePay since 09:40. Other sites load. Ping to the server works, HTTPS times out. Two other Finance users affected. Suspect FW01 change at 09:35. Urgency high: payroll due 12:00."' } },
        { type: 'predict', question: 'Which detail saves the next engineer the most time?', options: ['The user is upset', '"Ping works, HTTPS times out"', 'The user restarted twice'], answer: 1, explain: 'It isolates the problem to layer 4/7 (port, firewall, service) and rules out cabling, IP and routing.' },
      ],
    },
    {
      id: 'practice',
      title: 'Practice',
      blocks: [
        { type: 'reveal', prompt: 'Rewrite: "printer not working"', answer: '"HR-PRN-02 (2nd floor) shows Offline for all HR users since 08:15. Printer screen shows IP 169.254.3.4 (DHCP failure). Power-cycled once, no change. Impact: team / medium."' },
        { type: 'callout', tone: 'tip', text: 'Write the summary last: once you know the facts it fits in one line.' },
      ],
    },
  ],
};

export const priorityLesson: Lesson = {
  id: 'impact-urgency',
  title: 'How to choose impact and urgency',
  summary: 'Use the impact × urgency matrix to set priority consistently, and avoid the two classic mistakes: shouting customer = P1, and VIP = P1.',
  tracks: ['helpdesk', 'incident-response'],
  minutes: 12,
  difficulty: 1,
  tags: ['priority', 'itil', 'triage'],
  sections: [
    {
      id: 'matrix',
      title: 'The priority matrix',
      blocks: [
        { type: 'p', text: '**Impact** = how many people or how much business is affected. **Urgency** = how fast the damage grows. Priority comes from both.' },
        { type: 'diagram', name: 'priority-matrix', caption: 'Impact down the side, urgency across the top. P1 needs an immediate response.' },
        { type: 'table', head: ['Impact', 'Meaning'], rows: [['Individual', 'One person'], ['Team', 'A small group or one shared device'], ['Department', 'A whole function (Finance, HR)'], ['Organization', 'Everyone, or a customer-facing service']] },
      ],
    },
    {
      id: 'traps',
      title: 'Traps',
      blocks: [
        { type: 'list', items: ['**Loud ≠ urgent.** An angry caller with a cosmetic issue is still low urgency.', '**VIP ≠ P1.** Executives get fast, polite service, but priority follows impact and urgency (unless your policy says otherwise).', '**Security beats convenience.** A possible compromise (ransom note, phishing click) is high urgency even if one user is affected.', '**Deadlines raise urgency**: payroll at noon, a flight in an hour.'] },
        { type: 'quiz', id: 'priority-quiz', questions: [
          { q: 'One user cannot change their desktop wallpaper. They are angry.', options: ['P1', 'P4 / low', 'P2'], answer: 1, explain: 'Individual impact, no business damage: low priority, polite service.' },
          { q: 'One user clicked a link and now sees a ransom note.', options: ['Low: one user', 'Critical/high: possible ransomware spreading', 'Medium'], answer: 1, explain: 'Ransomware spreads; urgency is critical. Isolate the machine and escalate to security now.' },
          { q: 'The whole Finance department cannot reach the payroll app, payroll due in 2 hours.', options: ['Department / High', 'Individual / Low', 'Organization / Low'], answer: 0, explain: 'A department is affected and a deadline makes it urgent.' },
        ] },
      ],
    },
  ],
};

export const macLesson: Lesson = {
  id: 'find-mac',
  title: 'How to find a MAC address on Cisco, Windows and Linux',
  summary: 'Read the MAC on each platform, convert between formats, and use the switch MAC table to find which port a device is on.',
  tracks: ['helpdesk', 'ccna', 'linux', 'windows-ad'],
  minutes: 15,
  difficulty: 1,
  tags: ['mac', 'arp', 'switching'],
  lab: { workbook: 'basic-switch' },
  sections: [
    {
      id: 'formats',
      title: 'One address, three spellings',
      blocks: [
        { type: 'table', head: ['Platform', 'Format', 'Example'], rows: [['Cisco', 'dotted quad (hhhh.hhhh.hhhh)', '`bc24.112b.b2e3`'], ['Windows', 'dashes, upper case', '`BC-24-11-2B-B2-E3`'], ['Linux / macOS', 'colons, lower case', '`bc:24:11:2b:b2:e3`']] },
        { type: 'p', text: 'The first 3 bytes are the **OUI** (vendor): `bc:24:11` is a Proxmox/KVM virtual NIC, `00:00:0c` is Cisco.' },
      ],
    },
    {
      id: 'windows',
      title: 'On Windows',
      blocks: [
        { type: 'cmd', prompt: 'C:\\>', command: 'ipconfig /all', output: 'Ethernet adapter Ethernet:\n   Physical Address. . . . . . . . . : BC-24-11-2B-B2-E3\n   DHCP Enabled. . . . . . . . . . . : Yes\n   IPv4 Address. . . . . . . . . . . : 10.10.20.52(Preferred)', explain: '**Physical Address** is the MAC. `getmac /v` lists every adapter.' },
      ],
    },
    {
      id: 'linux',
      title: 'On Linux',
      blocks: [
        { type: 'cmd', prompt: '$', command: 'ip link show eno1', output: '2: eno1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP\n    link/ether bc:24:11:2b:b2:e3 brd ff:ff:ff:ff:ff:ff', explain: 'The address after **link/ether** is the MAC.' },
      ],
    },
    {
      id: 'cisco',
      title: 'On a Cisco switch: which port is it on?',
      blocks: [
        { type: 'cmd', prompt: 'SW1#', command: 'show mac address-table address bc24.112b.b2e3', output: 'Vlan    Mac Address       Type        Ports\n----    -----------       --------    -----\n  20    bc24.112b.b2e3    DYNAMIC     Gi0/10', explain: 'The device is on **Gi0/10** in VLAN 20. If the port is a trunk, follow it to the next switch and repeat.' },
        { type: 'diagram', name: 'mac-table', caption: 'Switches learn source MACs per port and VLAN.' },
        { type: 'callout', tone: 'tip', text: 'Find the MAC from the IP first with `show ip arp 10.10.20.52` on the router or `arp -a` on a PC in the same subnet.' },
        { type: 'lab', text: 'Practise: open the Lab and run show mac address-table on SW-ACC-01', workbook: 'basic-switch' },
      ],
    },
  ],
};

export const arpLesson: Lesson = {
  id: 'read-arp',
  title: 'How to read an ARP table',
  summary: 'What ARP does, how to read `arp -a` and `show ip arp`, and what incomplete or duplicate entries tell you.',
  tracks: ['ccna', 'helpdesk', 'soc'],
  minutes: 12,
  difficulty: 1,
  tags: ['arp', 'layer2'],
  sections: [
    {
      id: 'how',
      title: 'How ARP works',
      blocks: [
        { type: 'diagram', name: 'arp', caption: 'ARP request is a broadcast ("who has 10.10.20.1?"); the reply is unicast ("10.10.20.1 is at 00:0d:b9:..").' },
        { type: 'p', text: 'A host only ARPs for addresses **in its own subnet**. For anything else it ARPs for its **default gateway**.' },
      ],
    },
    {
      id: 'read',
      title: 'Reading the table',
      blocks: [
        { type: 'cmd', prompt: 'R1#', command: 'show ip arp', output: 'Protocol  Address        Age (min)  Hardware Addr   Type   Interface\nInternet  10.10.20.1            -   000d.b938.6f0f  ARPA   Gi0/0/0.20\nInternet  10.10.20.52           3   bc24.112b.b2e3  ARPA   Gi0/0/0.20\nInternet  10.10.20.60           0   Incomplete      ARPA   Gi0/0/0.20' },
        { type: 'table', head: ['Entry', 'Meaning'], rows: [['Age "-"', 'The router’s own interface'], ['Incomplete', 'ARP sent, no reply: host off, wrong VLAN, or firewall'], ['Same MAC for many IPs', 'A router, proxy ARP, or an attacker spoofing (ARP poisoning)'], ['Gateway MAC keeps changing', 'Possible ARP spoofing or duplicate gateway; check DAI']] },
        { type: 'predict', question: 'Your PC shows two different IPs with the same MAC as the gateway. What is a likely explanation?', options: ['Normal', 'An HSRP virtual MAC or ARP spoofing', 'DNS problem'], answer: 1, explain: 'A virtual gateway MAC (HSRP 0000.0c07.acXX) is normal; an unexpected host MAC answering for the gateway is a spoofing red flag.' },
      ],
    },
  ],
};

export const cableTraceLesson: Lesson = {
  id: 'trace-cable',
  title: 'How to trace a cable to a switch port',
  summary: 'From the wall jack to the patch panel to the switch: labels, CDP/LLDP, the MAC table and the link light, without unplugging the wrong thing.',
  tracks: ['helpdesk', 'ccna'],
  minutes: 12,
  difficulty: 1,
  tags: ['cabling', 'physical'],
  sections: [
    {
      id: 'path',
      title: 'The physical path',
      blocks: [
        { type: 'diagram', name: 'cable-trace', caption: 'PC → wall jack (2B-14) → horizontal cable → patch panel port 14 → patch cord → switch Gi0/14.' },
        { type: 'list', ordered: true, items: ['Read the **wall jack label** (e.g. 2B-14 = floor 2, closet B, port 14).', 'In the closet, find **patch panel port 14**.', 'Follow the patch cord to the switch, or use the MAC table to confirm the port.', 'Confirm with the **link light**: unplug at the PC and watch the switch LED go off (only with permission).'] },
      ],
    },
    {
      id: 'cli',
      title: 'Confirm from the CLI',
      blocks: [
        { type: 'cmd', prompt: 'SW1#', command: 'show cdp neighbors', output: 'Device ID   Local Intrfce   Capability  Platform     Port ID\nIP-PHONE-7  Gi0/14          H P         IP Phone 88  Port 1', explain: 'CDP/LLDP shows what is plugged in, from the device’s own report.' },
        { type: 'callout', tone: 'danger', text: 'Never trace by pulling cables in production. Use the MAC table, CDP/LLDP or a toner.' },
        { type: 'lab', text: 'Practise in the Lab: use the Physical tab to see which cable is in each port', workbook: 'port-security' },
      ],
    },
  ],
};

export const escalationLesson: Lesson = {
  id: 'escalation-note',
  title: 'How to write an escalation note',
  summary: 'Escalate with everything the next tier needs: what you know, what you ruled out, the evidence, and the exact ask.',
  tracks: ['helpdesk', 'soc', 'incident-response'],
  minutes: 10,
  difficulty: 1,
  tags: ['escalation', 'communication'],
  sections: [
    {
      id: 'tiers',
      title: 'Who gets what',
      blocks: [
        { type: 'diagram', name: 'escalation', caption: 'Tier 1 help desk → Tier 2 desktop/server/network → Tier 3 engineering or vendor; security incidents go to the SOC.' },
        { type: 'table', head: ['Problem', 'Escalate to'], rows: [['Firewall rule blocking a business app', 'Network / firewall team'], ['Account locked repeatedly', 'Identity / Active Directory team'], ['Phishing click, malware, ransom note', 'SOC / security on-call (immediately)'], ['Server service down', 'Server / application team'], ['ISP circuit down', 'Network team → carrier']] },
      ],
    },
    {
      id: 'template',
      title: 'The template',
      blocks: [
        { type: 'code', title: 'Escalation note', code: 'SUMMARY:   Finance cannot reach SalonePay (HTTPS) since 09:40\nIMPACT:    Department / High - payroll due 12:00\nEVIDENCE:  ping 10.10.30.20 OK; TCP/443 blocked by FW01 rule 99 (capture attached)\nRULED OUT: cabling, DHCP, DNS (resolves 10.10.30.20)\nRECENT:    FW01 change CHG-1042 at 09:35\nASK:       Review CHG-1042 / add pass rule VLAN20 -> 10.10.30.20:443\nCONTACT:   Aminata Sesay ext 2214; I stay on the ticket' },
        { type: 'callout', tone: 'tip', text: 'Say exactly what you need ("review rule 99"), not "please look".' },
      ],
    },
  ],
};

export const closeTicketLesson: Lesson = {
  id: 'close-ticket',
  title: 'How to close a ticket professionally',
  summary: 'Verify with the user, write a resolution note that teaches, link the root cause, and close only when the user agrees.',
  tracks: ['helpdesk'],
  minutes: 8,
  difficulty: 1,
  tags: ['ticket', 'resolution'],
  sections: [
    {
      id: 'verify',
      title: 'Verify, then close',
      blocks: [
        { type: 'list', ordered: true, items: ['Confirm the fix **with the user** (they test, not you).', 'Write the **root cause** and the **fix** in plain words.', 'Note what prevents a repeat (change request, KB article).', 'Set the right **closure code** (fixed, workaround, duplicate, user error, no fault found).'] },
        { type: 'compare', before: { title: 'Weak note', text: '"Fixed."' }, after: { title: 'Strong note', text: '"Root cause: switch port Gi0/10 was moved to VLAN 30 during a desk move. Fix: set back to VLAN 20, user renewed DHCP (10.10.20.52), confirmed SalonePay works. Prevention: added port descriptions; KB-118 updated."' } },
      ],
    },
  ],
};

export const outageLesson: Lesson = {
  id: 'document-outage',
  title: 'How to document an outage',
  summary: 'Write an incident timeline and a blameless post-incident review: detection, impact, root cause, actions.',
  tracks: ['incident-response', 'helpdesk'],
  minutes: 12,
  difficulty: 2,
  tags: ['postmortem', 'incident'],
  sections: [
    {
      id: 'timeline',
      title: 'Timeline first',
      blocks: [
        { type: 'table', head: ['Time', 'Event'], rows: [['09:35', 'CHG-1042 applied on FW01 (rule clean-up)'], ['09:40', 'First Finance call: SalonePay timeout'], ['09:52', 'Help desk links 4 tickets, escalates to network'], ['10:05', 'Rule 12 restored; service back'], ['10:15', 'Users confirm; incident resolved']] },
        { type: 'p', text: 'Use exact times and facts. The timeline answers "how long were we down" and "how long did it take to notice".' },
      ],
    },
    {
      id: 'review',
      title: 'The post-incident review',
      blocks: [
        { type: 'list', items: ['**Impact**: 25 minutes, Finance department, payroll delayed 10 minutes.', '**Root cause**: a pass rule removed during clean-up; no test plan in the change.', '**What went well**: tickets linked quickly; capture showed the rule.', '**Actions**: add a reachability test (Goals) to every firewall change; owner and due date for each.'] },
        { type: 'callout', tone: 'info', text: 'Blameless: describe what the system allowed to happen, not who to punish.' },
      ],
    },
  ],
};
