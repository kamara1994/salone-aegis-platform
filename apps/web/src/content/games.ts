// Game scenarios. Each template is a role (help desk, NOC, SOC…) with cases written as data: who calls,
// what they say, which questions are useful, the evidence each tool shows, and the right triage,
// diagnosis, fix and escalation. All content is original and fictional.
import type { GameCase, GameTemplate } from './types';

const q = (id: string, ask: string, answer: string, useful = true) => ({ id, ask, answer, useful });
const ev = (id: string, tool: GameCase['evidence'][number]['tool'], title: string, content: string, key = true) => ({ id, tool, title, content, key });
const opt = (id: string, text: string, correct: boolean, why: string) => ({ id, text, correct, why });

// ---------------- help desk ----------------

const helpdesk: GameCase[] = [
  {
    id: 'hd-vlan-move',
    caller: { name: 'Aminata Sesay', role: 'Payroll officer, Finance', avatar: 'AS', mood: 'stressed' },
    channel: 'phone',
    opening: 'Hi, I moved to the desk by the window this morning and now nothing works. No email, no SalonePay, and payroll has to go out by noon!',
    urgency: 'high',
    impact: 'individual',
    triageWhy: 'One person is affected (individual impact), but the payroll deadline makes it urgent.',
    questions: [
      q('when', 'When did it stop working?', 'Right after I moved desks at about 8:30. It was fine yesterday at my old desk.'),
      q('others', 'Is anyone else around you affected?', 'No, everyone else here is working.'),
      q('cable', 'Is the network cable plugged into the wall jack?', 'Yes, the light on the PC is on. The wall jack says 2B-14.'),
      q('ip', 'Can you run ipconfig and read me the IPv4 address?', 'It says 169.254.88.12.'),
      q('restart', 'Have you tried turning it off and on?', 'Yes, twice. Still the same.', false),
      q('vip', 'Who is your manager?', 'Mr. Koroma. Why does that matter?', false),
    ],
    evidence: [
      ev('ipconfig', 'terminal', 'WS-FIN-07: ipconfig /all', 'Ethernet adapter Ethernet:\n   DHCP Enabled. . . : Yes\n   Autoconfiguration IPv4 Address: 169.254.88.12\n   Default Gateway . : (none)'),
      ev('port', 'device-panel', 'SW-ACC-01 Gi0/14 (jack 2B-14)', 'Gi0/14  connected  vlan 30  a-full a-1000\nDescription: (none)\nOther Finance ports: VLAN 20'),
      ev('history', 'ticket-history', 'Recent tickets', 'INC-2231 yesterday: facilities re-patched desks on floor 2 (no network change logged)', false),
      ev('dhcp', 'logs', 'DHCP server log (VLAN 30)', 'No DHCPDISCOVER from bc:24:11:2b:b2:e3 in scope 10.10.30.0/24 (servers VLAN has no client scope)'),
    ],
    diagnoses: [
      opt('vlan', 'The new desk port is in the wrong VLAN (30, servers) so DHCP never answers', true, 'APIPA + port in VLAN 30 while Finance uses VLAN 20: no DHCP scope there.'),
      opt('dhcp-down', 'The DHCP server is down', false, 'Everyone else gets addresses; the problem follows the port.'),
      opt('nic', 'The PC network card is broken', false, 'The link is up at 1 Gb/s full duplex; the NIC works.'),
      opt('dns', 'DNS is broken', false, 'DNS cannot explain a 169.254 address.'),
    ],
    fixes: [
      opt('setvlan', 'Set Gi0/14 to access VLAN 20, add a port description, then ipconfig /renew', true, 'Puts the user back in the Finance VLAN where DHCP answers.'),
      opt('static', 'Give the PC a static IP in 10.10.20.0/24', false, 'A static address on the wrong VLAN still cannot reach the gateway, and it bypasses DHCP control.'),
      opt('reimage', 'Reimage the PC', false, 'Wastes hours; nothing is wrong with the PC.'),
    ],
    escalation: { correct: 'none', options: ['none', 'Network team', 'Desktop team', 'Security'], why: 'Help desk usually has rights to change an access port VLAN; if not, escalate to the network team with this evidence.' },
    noteKeywords: ['vlan', '20', 'gi0/14', 'renew'],
    hints: ['Senior engineer: "169.254 means the PC never heard back from DHCP. Why would DHCP stay silent for just this desk?"', 'Senior engineer: "Look at the switch port behind jack 2B-14. Which VLAN is it in?"'],
    lab: { challenge: 'wrong-vlan' },
    minutes: 6,
  },
  {
    id: 'hd-lockout',
    caller: { name: 'Ibrahim Conteh', role: 'Sales lead', avatar: 'IC', mood: 'angry' },
    channel: 'phone',
    opening: 'My account keeps locking every ten minutes! I changed my password this morning like IT told me to and now I can’t work.',
    urgency: 'medium',
    impact: 'individual',
    triageWhy: 'One user, work is slowed but there is a workaround (unlock); medium urgency.',
    questions: [
      q('change', 'When exactly did you change your password?', 'Around 8 this morning, on my laptop.'),
      q('devices', 'Which other devices use your account? Phone email, tablet, mapped drives?', 'My phone has my work email. And I think my old laptop is still on in the meeting room.'),
      q('where', 'Do you get locked out even when you are not typing your password?', 'Yes! I’m just sitting here and it locks again.'),
      q('caps', 'Is Caps Lock on?', 'No.', false),
    ],
    evidence: [
      ev('4740', 'logs', 'DC01 Security log, event 4740', '09:12 Account locked: i.conteh  Caller Computer: MR-LAPTOP-03\n09:24 Account locked: i.conteh  Caller Computer: MR-LAPTOP-03'),
      ev('4771', 'logs', 'DC01 event 4771 (Kerberos pre-auth failed)', '09:10 i.conteh from 10.10.20.88 (MR-LAPTOP-03) x5\n09:22 i.conteh from 10.10.20.88 (MR-LAPTOP-03) x5'),
      ev('policy', 'ticket-history', 'Lockout policy', 'Threshold 5 failures, lockout 15 min, reset 10 min', false),
    ],
    diagnoses: [
      opt('stale', 'A device (the old meeting-room laptop) keeps trying the old password', true, 'Every lockout names MR-LAPTOP-03 as the caller computer.'),
      opt('attack', 'Someone is brute-forcing his account from outside', false, 'The failures come from one internal laptop he used to own, right after a password change.'),
      opt('typo', 'He is typing the new password wrong', false, 'He is locked out while not typing at all.'),
    ],
    fixes: [
      opt('signout', 'Sign him out of MR-LAPTOP-03 (and update the phone mail password), then unlock the account', true, 'Removes the source of the bad attempts; unlocking first would just lock again.'),
      opt('unlock', 'Just unlock the account', false, 'It locks again in minutes.'),
      opt('policy', 'Raise the lockout threshold for everyone', false, 'Weakens security for the whole company to hide one stale session.'),
    ],
    escalation: { correct: 'none', options: ['none', 'Identity / AD team', 'Security', 'Desktop team'], why: 'This is a help-desk fix. Escalate to security only if failures came from unknown sources.' },
    noteKeywords: ['mr-laptop-03', 'stale', 'unlock', '4740'],
    hints: ['Senior engineer: "Event 4740 has a Caller Computer field. Whose machine is it?"'],
    minutes: 5,
  },
  {
    id: 'hd-printer',
    caller: { name: 'Fatmata Bangura', role: 'HR assistant', avatar: 'FB', mood: 'calm' },
    channel: 'chat',
    opening: 'Hello, the HR printer says "offline" for all of us. Not urgent, we can use the 3rd floor printer for now.',
    urgency: 'low',
    impact: 'team',
    triageWhy: 'A shared device for one team (team impact) with a working alternative (low urgency).',
    questions: [
      q('screen', 'What does the printer’s own screen show for IP address?', 'It says 169.254.3.4.'),
      q('since', 'Since when?', 'Since the power cut last night.'),
      q('others', 'Can anyone print to it?', 'Nobody in HR.'),
      q('paper', 'Does it have paper?', 'Yes, plenty.', false),
    ],
    evidence: [
      ev('port', 'device-panel', 'SW-ACC-01 Gi0/18 (HR printer)', 'Gi0/18  connected  vlan 40  description HR-PRN-02\nHR VLAN is 40, DHCP scope 10.10.40.0/24'),
      ev('dhcp', 'logs', 'DHCP server', 'Scope 10.10.40.0/24: 100% used (254/254). DHCPNAK / no free leases for 3c:52:82:aa:10:04'),
      ev('leases', 'terminal', 'Lease list (top)', '10.10.40.20-253: 231 leases from guest-style MACs, lease time 30 days', false),
    ],
    diagnoses: [
      opt('pool', 'The HR DHCP scope is exhausted, so the printer cannot renew after the power cut', true, 'The scope is 100% used and the printer is NAKed.'),
      opt('cable', 'The printer cable is unplugged', false, 'The port shows connected.'),
      opt('driver', 'The print driver on the PCs is broken', false, 'The printer itself has no valid address.'),
    ],
    fixes: [
      opt('reserve', 'Give the printer a DHCP reservation (or static outside the pool) and shorten the 30-day lease / clean stale leases', true, 'Printers need a stable address, and the scope needs room.'),
      opt('reboot', 'Reboot the printer again', false, 'There are still no free leases.'),
      opt('newprinter', 'Order a new printer', false, 'Nothing is wrong with the hardware.'),
    ],
    escalation: { correct: 'Server / infrastructure team', options: ['none', 'Server / infrastructure team', 'Vendor support', 'Security'], why: 'Changing DHCP scopes and lease times is usually the server team’s job; send them the scope usage evidence.' },
    noteKeywords: ['dhcp', 'scope', 'exhausted', 'reservation'],
    hints: ['Senior engineer: "169.254 again. Is the DHCP server down, or just out of addresses?"'],
    minutes: 5,
  },
  {
    id: 'hd-ransom',
    caller: { name: 'Mohamed Kamara', role: 'Accounts clerk', avatar: 'MK', mood: 'confused' },
    channel: 'walk-up',
    opening: 'Sorry to bother you… my files all have a weird ".locked" ending and there is a note on my desktop asking for bitcoin. I opened an invoice email earlier.',
    urgency: 'critical',
    impact: 'department',
    triageWhy: 'Possible ransomware: it spreads through shared drives, so treat it as critical even though one user reported it.',
    questions: [
      q('when', 'When did you open the email?', 'About 20 minutes ago. It was an invoice ZIP from a supplier.'),
      q('network', 'Is your PC still connected to the network?', 'Yes, it’s plugged in.'),
      q('share', 'Do you have the shared Finance drive mapped?', 'Yes, F: drive.'),
      q('pay', 'Did you pay anything?', 'No!', false),
    ],
    evidence: [
      ev('note', 'console', 'Desktop: README_RESTORE.txt', 'All your files are encrypted. Send 0.5 BTC to … Do not contact IT.'),
      ev('share', 'logs', 'File server FS01 audit', 'WS-FIN-12 renamed 1,204 files on \\\\FS01\\finance to *.locked in the last 6 minutes'),
      ev('mail', 'email', 'Mail gateway', 'From: billing@supp1ier-invoices.example  Attachment: Invoice_8842.zip (contains .js)'),
    ],
    diagnoses: [
      opt('ransom', 'Ransomware from the phishing attachment, actively encrypting the Finance share', true, 'Renamed files on FS01 from WS-FIN-12 and a ransom note.'),
      opt('sync', 'OneDrive sync problem', false, 'Sync problems do not leave ransom notes or rename to .locked.'),
    ],
    fixes: [
      opt('isolate', 'Isolate WS-FIN-12 from the network now (unplug / EDR isolate / quarantine VLAN), do not power off, escalate to security', true, 'Stops the encryption spreading and preserves memory evidence.'),
      opt('shutdown', 'Shut the PC down and restore files from backup', false, 'Powering off destroys evidence; restoring before containment re-infects.'),
      opt('pay', 'Pay the ransom quickly to save the files', false, 'Never: no guarantee, funds crime, and it is a security/legal decision.'),
    ],
    escalation: { correct: 'Security / SOC', options: ['none', 'Security / SOC', 'Desktop team', 'Manager only'], why: 'Ransomware is a security incident: isolate, then hand over to the SOC immediately.' },
    noteKeywords: ['isolate', 'ransomware', 'fs01', 'soc'],
    hints: ['Security on-call: "Every minute that PC stays on the network, more of the Finance share gets encrypted. What is your first move?"'],
    minutes: 4,
  },
  {
    id: 'hd-wifi',
    caller: { name: 'Hawa Jalloh', role: 'Visiting auditor', avatar: 'HJ', mood: 'calm' },
    channel: 'walk-up',
    opening: 'My laptop can see the AEGIS-LAB Wi-Fi but says "can’t connect to this network". Colleagues got on fine.',
    urgency: 'medium',
    impact: 'individual',
    triageWhy: 'One visitor; she can work offline for a while.',
    questions: [
      q('password', 'Which password did you type?', 'The one on the welcome sheet: Aegis2026!'),
      q('security', 'Can you check the network security type your laptop shows?', 'It says WPA3-Personal is required.'),
      q('others', 'Are your colleagues on the same Wi-Fi?', 'Yes, AEGIS-LAB.'),
    ],
    evidence: [
      ev('wlc', 'logs', 'WLC client log', 'Client 3c:7d:… SAE authentication failed: wrong passphrase (4-way handshake incomplete)'),
      ev('sheet', 'ticket-history', 'Change log', 'Guest Wi-Fi passphrase rotated yesterday; welcome sheet not updated'),
    ],
    diagnoses: [opt('pass', 'The welcome sheet has yesterday’s passphrase', true, 'The WLC logs a wrong passphrase and the passphrase was rotated yesterday.'), opt('ap', 'The access point is down', false, 'Colleagues are connected to it.')],
    fixes: [opt('give', 'Give her the current guest passphrase securely and update the welcome sheet', true, 'Fixes her and the next visitor.'), opt('open', 'Make the SSID open for visitors', false, 'Removes all protection from the network.')],
    escalation: { correct: 'none', options: ['none', 'Network team', 'Security'], why: 'Handled at the help desk; tell facilities to update the sheet.' },
    noteKeywords: ['passphrase', 'rotated', 'welcome sheet'],
    hints: ['Senior engineer: "The controller tells you exactly why the handshake failed."'],
    minutes: 4,
  },
  {
    id: 'hd-ceo-wallpaper',
    caller: { name: 'Director Samuel Cole', role: 'Managing director', avatar: 'SC', mood: 'angry' },
    channel: 'phone',
    opening: 'This is the managing director. My desktop wallpaper keeps changing back to the company logo. Fix it NOW, this is unacceptable!',
    urgency: 'low',
    impact: 'individual',
    triageWhy: 'Loud and senior, but cosmetic and one person: low priority, polite and prompt service.',
    questions: [
      q('when', 'When does it change back?', 'Every time I log in.'),
      q('other', 'Is anything else not working?', 'No, everything else is fine.'),
    ],
    evidence: [ev('gpo', 'logs', 'gpresult /r', 'Applied GPO: "Corporate Desktop Standard" (enforces wallpaper) on all staff OUs')],
    diagnoses: [opt('gpo', 'A group policy enforces the corporate wallpaper at every logon', true, 'gpresult shows the wallpaper GPO.'), opt('virus', 'Malware is changing it', false, 'The setting comes from a known GPO.')],
    fixes: [opt('explain', 'Explain the policy politely and offer to raise an exception request with the policy owner', true, 'Respects policy and the user.'), opt('disable', 'Disable the GPO for everyone', false, 'Breaks policy for the whole company to satisfy one request.')],
    escalation: { correct: 'none', options: ['none', 'Windows / AD team', 'Security'], why: 'A policy exception request, not an incident.' },
    noteKeywords: ['gpo', 'policy', 'exception'],
    hints: ['Manager: "Seniority sets the tone of the call, not the priority of the ticket."'],
    minutes: 3,
  },
];

// ---------------- other roles ----------------

const t = (id: string, title: string, role: string, summary: string, tracks: GameTemplate['tracks'], mentor: string, cases: GameCase[]): GameTemplate => ({ id, title, role, summary, tracks, mentor, cases });

const base = (c: Partial<GameCase> & Pick<GameCase, 'id' | 'caller' | 'opening' | 'urgency' | 'impact' | 'triageWhy' | 'questions' | 'evidence' | 'diagnoses' | 'fixes' | 'escalation' | 'noteKeywords' | 'hints'>): GameCase => ({ channel: 'phone', minutes: 6, ...c });

export const GAME_TEMPLATES: GameTemplate[] = [
  t('helpdesk', 'Help desk triage', 'Help desk analyst', 'Callers queue up with real problems. Pick who to help, set impact and urgency, ask the right questions, collect evidence, fix or escalate, and write the note.', ['helpdesk'], 'Senior engineer', helpdesk),
  t('noc-outage', 'Network outage commander', 'NOC engineer', 'A site is down. Coordinate, find the failed link or device, and restore service.', ['ccna', 'ccnp'], 'Network manager', [
    base({ id: 'noc-uplink', channel: 'alert', caller: { name: 'Monitoring', role: 'Zabbix alert', avatar: 'MON', mood: 'calm' }, opening: 'ALERT: Bo branch unreachable. 42 users. Tunnel0 on BO-RTR01 down for 3 minutes.', urgency: 'high', impact: 'department', triageWhy: 'A whole branch is offline during business hours.', questions: [q('isp', 'Does the branch internet work locally?', 'Branch manager: websites load fine, only head-office apps fail.'), q('change', 'Any change tonight or today?', 'Change CHG-1077: FW01 WireGuard keys rotated at 10:00.')], evidence: [ev('wg', 'logs', 'FW01 WireGuard log', 'wg0: handshake for peer BO-RTR01 did not complete after 5 seconds, retrying (invalid key)'), ev('ping', 'terminal', 'BO-RTR01 ping 8.8.8.8', 'Success rate is 100 percent (5/5)')], diagnoses: [opt('key', 'The tunnel peer key was rotated on FW01 but not on BO-RTR01', true, 'Internet works, tunnel handshakes fail with invalid key right after a key rotation.'), opt('isp', 'The branch ISP is down', false, 'The branch reaches the internet.')], fixes: [opt('update', 'Install the new public key on BO-RTR01 (or roll back CHG-1077) and verify the handshake', true, 'Restores the tunnel.'), opt('reboot', 'Reboot the branch router', false, 'The key is still wrong after reboot.')], escalation: { correct: 'none', options: ['none', 'Carrier', 'Security'], why: 'The NOC owns the tunnel; update the change record.' }, noteKeywords: ['key', 'wireguard', 'chg-1077'], hints: ['Network manager: "Internet up, tunnel down, change at 10:00. Connect the dots."'] }),
  ]),
  t('soc-alert', 'SOC alert investigation', 'SOC analyst (tier 1)', 'Alerts pour in. Decide true or false positive with evidence, contain, and escalate.', ['soc', 'security-plus'], 'SOC lead', [
    base({ id: 'soc-spray', channel: 'alert', caller: { name: 'Wazuh', role: 'Rule 60204 level 12', avatar: 'SIEM', mood: 'calm' }, opening: 'ALERT: 38 different accounts failed logon from 203.0.113.77 against the VPN portal in 4 minutes.', urgency: 'high', impact: 'organization', triageWhy: 'Password spraying against an internet-facing service can compromise any account.', questions: [q('success', 'Did any of the attempts succeed?', 'One success: m.turay at 09:43.'), q('geo', 'Where is 203.0.113.77?', 'Unknown hosting provider; never seen before.')], evidence: [ev('vpn', 'siem', 'VPN auth log', '09:40-09:44 FAIL x37 from 203.0.113.77 (37 users)\n09:43 SUCCESS m.turay from 203.0.113.77 (no MFA prompt: legacy profile)'), ev('mfa', 'ticket-history', 'Identity', 'm.turay is on the legacy VPN profile without MFA', false)], diagnoses: [opt('spray', 'Password spraying with one successful compromise (m.turay)', true, 'Many accounts, one source, and a success without MFA.'), opt('fp', 'False positive: users forgot passwords', false, '37 users from one unknown IP in 4 minutes is not forgetfulness.')], fixes: [opt('contain', 'Block 203.0.113.77, kill m.turay sessions, reset password, enforce MFA, check what the session accessed', true, 'Contain the account and the source.'), opt('ignore', 'Close as noise', false, 'An account was compromised.')], escalation: { correct: 'Incident response (tier 2)', options: ['none', 'Incident response (tier 2)', 'Help desk'], why: 'A confirmed account compromise goes to IR for scoping.' }, noteKeywords: ['spray', 'm.turay', 'mfa', 'block'], hints: ['SOC lead: "Many users, one source: what does the one success mean?"'] }),
  ]),
  t('phishing', 'Phishing response', 'Security analyst', 'Users report suspicious emails. Decide, purge, and protect the people who clicked.', ['soc', 'security-plus', 'incident-response'], 'SOC lead', [
    base({ id: 'ph-payroll', channel: 'email', caller: { name: 'Mariama Kanu', role: 'HR officer', avatar: 'MK', mood: 'confused' }, opening: 'I got an email from "HR Payroll" asking me to confirm my bank details on a portal. It looks real but the link is weird. Did I do something wrong? I clicked it but didn’t type anything.', urgency: 'high', impact: 'department', triageWhy: 'A credential-phishing campaign may have reached many staff.', questions: [q('who', 'Did others get it?', 'Yes, the whole HR team.'), q('typed', 'Did you enter any password?', 'No, I closed it when it asked for my login.')], evidence: [ev('hdr', 'email', 'Message headers', 'From: "HR Payroll" <payroll@salonemutual-hr.example>\nReply-To: collect@freemail.example\nSPF: fail  DKIM: none'), ev('proxy', 'logs', 'Proxy log', '14 users visited salonemutual-hr.example/login today; 2 POSTs (m.bangura, j.koroma)')], diagnoses: [opt('phish', 'Credential phishing campaign; two users submitted credentials', true, 'Look-alike domain, SPF fail, and two form POSTs.'), opt('legit', 'Legitimate HR email', false, 'Look-alike domain and failing SPF.')], fixes: [opt('purge', 'Purge the email from all mailboxes, block the domain, reset the two users who submitted, revoke their sessions', true, 'Removes the lure and protects the victims.'), opt('only', 'Reply to Mariama that she is fine', false, 'Others submitted credentials.')], escalation: { correct: 'Incident response (tier 2)', options: ['none', 'Incident response (tier 2)', 'Help desk'], why: 'Two compromised accounts need IR follow-up.' }, noteKeywords: ['purge', 'block', 'reset', 'look-alike'], hints: ['SOC lead: "She is fine. Who else visited that link, and who submitted the form?"'] }),
  ]),
  t('ransomware', 'Ransomware containment', 'Incident responder', 'Encryption is spreading. Contain fast without destroying evidence.', ['incident-response', 'soc'], 'IR lead', [{ ...helpdesk[3], id: 'rw-fs01' }]),
  t('firewall', 'Firewall incident', 'Network security engineer', 'Business apps break after a firewall change. Find the rule and fix it safely.', ['ccna', 'security-plus'], 'Change manager', [
    base({ id: 'fw-rule', caller: { name: 'Finance team', role: '4 tickets linked', avatar: 'FIN', mood: 'stressed' }, opening: 'Since 9:40 nobody in Finance can open SalonePay. Everything else works.', urgency: 'high', impact: 'department', triageWhy: 'A department cannot reach a business-critical app with a deadline today.', questions: [q('change', 'Was there a firewall change this morning?', 'CHG-1042 at 09:35: rule clean-up on FW01.')], evidence: [ev('log', 'logs', 'FW01 filterlog', 'block in igb1.20 10.10.20.52 -> 10.10.30.20:443 rule 99 (default deny)'), ev('diff', 'ticket-history', 'CHG-1042 diff', 'Removed: rule 12 "Users to SalonePay (HTTPS)" (marked duplicate)')], diagnoses: [opt('rule', 'Rule 12 was removed as a "duplicate"; traffic now hits the default deny', true, 'The log shows rule 99 blocking 443 and the diff shows rule 12 removed.'), opt('app', 'SalonePay server is down', false, 'Other VLANs reach it; the firewall blocks Finance.')], fixes: [opt('restore', 'Restore rule 12 via an emergency change and add a reachability test to the change template', true, 'Fixes now and prevents repeats.'), opt('anyany', 'Add a pass any-any rule on VLAN 20', false, 'Opens everything to everyone.')], escalation: { correct: 'none', options: ['none', 'Vendor', 'Security'], why: 'Owned by the network security team; record an emergency change.' }, noteKeywords: ['rule 12', 'chg-1042', 'restore'], hints: ['Change manager: "What did CHG-1042 actually remove?"'], lab: { workbook: 'acl' } }),
  ]),
  t('cloud-breach', 'Cloud breach', 'Cloud security engineer', 'Suspicious API activity in the cloud account. Contain identities and data.', ['cloud-security', 'incident-response'], 'Cloud security lead', [
    base({ id: 'cl-keys', channel: 'alert', caller: { name: 'GuardDuty-style alert', role: 'High severity', avatar: 'AWS', mood: 'calm' }, opening: 'ALERT: Access key AKIA…7Q of user ci-deployer used from an unfamiliar country to call ListBuckets and GetObject on the backups bucket.', urgency: 'critical', impact: 'organization', triageWhy: 'Leaked credentials with data access are actively being used.', questions: [q('where', 'Where else is this key used?', 'Only the CI pipeline, from a fixed IP.'), q('repo', 'Was anything committed recently?', 'A developer pushed a .env file to a public repo yesterday.')], evidence: [ev('trail', 'logs', 'CloudTrail', '02:14 ListBuckets  src 198.51.100.200 (new)\n02:15 GetObject backups/2026-10-28.tar.gz x 31'), ev('repo', 'ticket-history', 'Repo scan', 'Public repo commit 9ac3: .env contains AWS_ACCESS_KEY_ID=AKIA…7Q')], diagnoses: [opt('leak', 'The CI access key leaked in a public commit and is being used to download backups', true, 'Same key in the public commit, used from a new IP.'), opt('ci', 'Normal CI activity', false, 'CI never runs from that IP or at that time.')], fixes: [opt('rotate', 'Deactivate the key, rotate CI credentials (prefer roles/OIDC), purge the commit, review what was downloaded, notify per policy', true, 'Stops access and limits damage.'), opt('delete', 'Delete the backups bucket', false, 'Destroys your own data and evidence.')], escalation: { correct: 'Incident response (tier 2)', options: ['none', 'Incident response (tier 2)', 'Developers only'], why: 'Data was accessed: IR and possibly legal/privacy must be involved.' }, noteKeywords: ['deactivate', 'rotate', 'cloudtrail', 'public repo'], hints: ['Cloud lead: "Find where that key was exposed, then make it useless."'] }),
  ]),
  t('wireless', 'Wireless outage', 'Wireless engineer', 'A floor loses Wi-Fi. Is it RF, power, the controller or authentication?', ['ccna', 'ccnp'], 'Network manager', [
    base({ id: 'wl-poe', channel: 'phone', caller: { name: 'Floor 3 staff', role: '12 users', avatar: 'F3', mood: 'stressed' }, opening: 'Wi-Fi on the whole 3rd floor dropped about 15 minutes ago. Floors 1 and 2 are fine.', urgency: 'high', impact: 'department', triageWhy: 'A floor of users is offline.', questions: [q('change', 'Anything new on floor 3?', 'Facilities installed 6 new security cameras this morning.')], evidence: [ev('poe', 'device-panel', 'SW-FL3 show power inline', 'Available:370.0(w) Used:368.5(w) Remaining:1.5(w)\nGi0/1-4 (APs): off  (power denied)'), ev('wlc', 'logs', 'WLC', 'AP-F3-1..4 disassociated 10:41 (power loss)')], diagnoses: [opt('poe', 'The new cameras used up the switch PoE budget, so the APs lost power', true, 'PoE nearly exhausted and AP ports denied power.'), opt('rf', 'Radio interference', false, 'The APs are powered off, not interfered.')], fixes: [opt('prio', 'Set PoE priority high on AP ports / move cameras to another PoE switch, then verify APs rejoin', true, 'Restores AP power.'), opt('reboot', 'Reboot the controller', false, 'The APs have no power.')], escalation: { correct: 'none', options: ['none', 'Facilities', 'Vendor'], why: 'Fix at the switch; tell facilities about PoE planning.' }, noteKeywords: ['poe', 'budget', 'cameras', 'priority'], hints: ['Network manager: "What changed on floor 3, and what do APs and cameras both need from the switch?"'] }),
  ]),
  t('active-directory', 'Active Directory failure', 'Systems administrator', 'Logons and group policy fail across the office.', ['windows-ad'], 'Infrastructure lead', [
    base({ id: 'ad-time', caller: { name: 'Help desk', role: 'Ticket flood', avatar: 'HD', mood: 'stressed' }, opening: 'Dozens of users get "The trust relationship / clock skew" errors at logon since this morning.', urgency: 'critical', impact: 'organization', triageWhy: 'Most users cannot log on.', questions: [q('time', 'What time does DC01 show?', '10:52. The wall clock says 10:45.')], evidence: [ev('w32', 'logs', 'DC01 System log', 'Time-Service: PDC emulator configured to sync from time.invalid (unreachable); local clock drifted +7 min'), ev('krb', 'logs', 'Kerberos', 'KRB_AP_ERR_SKEW from many clients')], diagnoses: [opt('skew', 'The PDC emulator lost its NTP source; clock skew > 5 minutes breaks Kerberos', true, 'Kerberos allows 5 minutes of skew; DC01 is 7 minutes off.'), opt('dns', 'DNS is broken', false, 'The errors are skew errors.')], fixes: [opt('ntp', 'Point the PDC emulator at a reachable NTP source (w32tm /config /manualpeerlist…), resync, verify', true, 'Restores time and Kerberos.'), opt('rejoin', 'Rejoin every PC to the domain', false, 'Hours of work that does not fix the clock.')], escalation: { correct: 'none', options: ['none', 'Microsoft support', 'Security'], why: 'Owned by the infrastructure team.' }, noteKeywords: ['ntp', 'skew', 'kerberos', 'pdc'], hints: ['Infrastructure lead: "Kerberos is picky about one thing above all: time."'] }),
  ]),
  t('cable-repair', 'Server-room cable repair', 'Data centre technician', 'Find and replace the faulty cable without taking down the wrong server.', ['helpdesk', 'ccna'], 'DC supervisor', [
    base({ id: 'cr-duplex', channel: 'phone', caller: { name: 'Backup team', role: 'Backups slow', avatar: 'BK', mood: 'calm' }, opening: 'Nightly backups to BKP01 take 6 hours instead of 1, and file copies keep failing.', urgency: 'medium', impact: 'team', triageWhy: 'Backups still complete; risk grows if it continues.', questions: [q('when', 'When did it start?', 'After the switch port was hard-set during last week’s maintenance.')], evidence: [ev('if', 'device-panel', 'SW-ACC-01 Gi0/7', 'Speed 100 (forced), duplex half (forced)\n  1,204 late collisions, 3,880 CRC'), ev('nic', 'terminal', 'BKP01 NIC', 'Link 100 Mb/s full duplex (autonegotiated)')], diagnoses: [opt('duplex', 'Duplex mismatch: switch forced half, server negotiated full', true, 'Late collisions and CRC errors are the duplex-mismatch signature.'), opt('cable', 'Bad cable', false, 'Errors match the forced settings, not a cable fault.')], fixes: [opt('auto', 'Set Gi0/7 back to speed auto / duplex auto (or hard-set both ends identically), clear counters, watch', true, 'Both ends agree again.'), opt('replace', 'Replace the server', false, 'Nothing is wrong with the server.')], escalation: { correct: 'none', options: ['none', 'Network team', 'Vendor'], why: 'Technician can fix with network approval.' }, noteKeywords: ['duplex', 'auto', 'late collisions'], hints: ['DC supervisor: "Late collisions on a switched link mean one thing."'], lab: { challenge: 'duplex' } }),
  ]),
  t('dns', 'DNS failure', 'Systems administrator', 'Sites fail by name but work by IP.', ['windows-ad', 'linux', 'helpdesk'], 'Infrastructure lead', [
    base({ id: 'dns-forwarder', caller: { name: 'Several users', role: 'Internet "down"', avatar: 'US', mood: 'stressed' }, opening: 'The internet is down! Well… Teams works but websites say "server not found".', urgency: 'high', impact: 'organization', triageWhy: 'Everyone loses web access by name.', questions: [q('ip', 'Does 1.1.1.1 open by IP?', 'Yes, by IP it works.')], evidence: [ev('nslookup', 'terminal', 'nslookup example.com', 'Server: dc01.corp  Address: 10.10.10.10\n*** dc01.corp can’t find example.com: Server failed'), ev('dnslog', 'logs', 'DC01 DNS log', 'Forwarder 198.51.100.53 timed out (ISP retired this resolver yesterday)')], diagnoses: [opt('fwd', 'DC01’s DNS forwarder points at a retired ISP resolver', true, 'Internal names work, external fail with SERVFAIL; the forwarder times out.'), opt('fw', 'The firewall blocks the internet', false, 'Traffic by IP works.')], fixes: [opt('change', 'Update the DNS forwarders on DC01/DC02 to working resolvers and clear the cache', true, 'Restores external name resolution.'), opt('hosts', 'Add sites to every PC hosts file', false, 'Unmaintainable and incomplete.')], escalation: { correct: 'none', options: ['none', 'ISP', 'Security'], why: 'Owned by infrastructure; note the ISP change.' }, noteKeywords: ['forwarder', 'dns', 'servfail'], hints: ['Infrastructure lead: "By IP works, by name fails. Ask the DNS server what it asks upstream."'] }),
  ]),
  t('vpn', 'VPN failure', 'Network engineer', 'Remote staff cannot connect or connect but reach nothing.', ['ccna', 'security-plus'], 'Network manager', [
    base({ id: 'vpn-pool', caller: { name: 'Remote staff', role: 'Late joiners', avatar: 'RS', mood: 'angry' }, opening: 'Half of us connected this morning; anyone joining after 9:00 gets "no addresses available".', urgency: 'high', impact: 'department', triageWhy: 'A large group of remote workers cannot work.', questions: [q('count', 'How many are connected?', '250 sessions.')], evidence: [ev('pool', 'logs', 'VPN gateway', 'Address pool 10.250.0.0/24 exhausted (250/250 allocated, 4 reserved)')], diagnoses: [opt('pool', 'The VPN client address pool (/24) is too small for today’s demand', true, 'Pool exhausted at 250 sessions.'), opt('licence', 'Licence expired', false, 'The error is address exhaustion.')], fixes: [opt('widen', 'Expand the pool (e.g. /23, routed and allowed on the firewall), then verify new clients connect', true, 'Adds addresses; remember routing and rules for the new range.'), opt('kick', 'Disconnect morning users', false, 'Just moves the outage.')], escalation: { correct: 'none', options: ['none', 'Vendor', 'Security'], why: 'Network team change.' }, noteKeywords: ['pool', 'exhausted', '/23'], hints: ['Network manager: "Count the sessions and count the addresses."'] }),
  ]),
  t('pentest', 'Penetration-testing mission', 'Junior penetration tester', 'Work inside your scope: enumerate, find the weakness, prove it safely, report.', ['ejpt', 'security-plus'], 'Engagement lead', [
    base({ id: 'pt-telnet', channel: 'chat', caller: { name: 'Engagement lead', role: 'Rules of engagement', avatar: 'EL', mood: 'calm' }, opening: 'Scope: 10.10.50.0/24 only, no denial of service, stop at proof. Find one high-risk finding and report it.', urgency: 'medium', impact: 'team', triageWhy: 'A scheduled assessment, not an emergency.', questions: [q('scope', 'Is 10.10.40.0/24 in scope?', 'No. Stay in 10.10.50.0/24.')], evidence: [ev('nmap', 'terminal', 'nmap -sV 10.10.50.0/24', '10.10.50.1  23/tcp open telnet Cisco IOS telnetd\n10.10.50.1  22/tcp closed'), ev('banner', 'console', 'telnet 10.10.50.1', 'User Access Verification\nPassword: (default "cisco" accepted)')], diagnoses: [opt('telnet', 'Management over cleartext Telnet with a default password on the edge firewall/router', true, 'Telnet open, SSH closed, default credentials accepted.'), opt('none', 'No findings', false, 'Default credentials on a management plane is critical.')], fixes: [opt('report', 'Stop at proof, document evidence, recommend SSH only + strong secrets + management ACL, notify the lead', true, 'Proof without damage, actionable fix.'), opt('pivot', 'Use the access to scan 10.10.40.0/24', false, 'Out of scope: never exceed the rules of engagement.')], escalation: { correct: 'Engagement lead', options: ['none', 'Engagement lead', 'Client CEO'], why: 'Critical findings are reported to the engagement lead immediately.' }, noteKeywords: ['telnet', 'default', 'ssh', 'scope'], hints: ['Engagement lead: "What is the riskiest service an admin should never expose?"'] }),
  ]),
  t('disaster-recovery', 'Disaster recovery', 'Infrastructure engineer', 'A server room is lost. Restore in the right order within the RTO.', ['incident-response', 'windows-ad'], 'IT director', [
    base({ id: 'dr-order', channel: 'phone', caller: { name: 'IT director', role: 'DR invoked', avatar: 'IT', mood: 'stressed' }, opening: 'Flood in the server room. We are failing over to the backup site. RTO is 4 hours. What do you restore first?', urgency: 'critical', impact: 'organization', triageWhy: 'Everything is down.', questions: [q('backups', 'Are last night’s backups verified?', 'Yes, offsite copies verified at 02:00.')], evidence: [ev('deps', 'ticket-history', 'Dependency map', 'SalonePay → DB01 → AD/DNS; file shares → AD; everything → network + DNS')], diagnoses: [opt('order', 'Restore order: network → AD/DNS → databases → applications → file shares → user services', true, 'Every service depends on network, identity and name resolution.'), opt('apps', 'Restore SalonePay first because it is most important', false, 'It cannot authenticate or resolve names without AD/DNS.')], fixes: [opt('runbook', 'Follow the DR runbook in dependency order, verify each tier, communicate status every 30 minutes', true, 'Meets the RTO safely.'), opt('all', 'Restore everything in parallel', false, 'Dependencies fail and waste time.')], escalation: { correct: 'none', options: ['none', 'Vendor', 'Insurance'], why: 'You are the escalation; keep the director informed.' }, noteKeywords: ['dependency', 'ad', 'dns', 'rto'], hints: ['IT director: "What does every other system need before it can start?"'] }),
  ]),
  t('change-window', 'Change-window management', 'Change implementer', 'Run a change safely: pre-checks, implement, verify, roll back if needed.', ['ccna', 'automation'], 'Change manager', [
    base({ id: 'cw-rollback', channel: 'chat', caller: { name: 'Change manager', role: 'CHG-1100 window 22:00-23:00', avatar: 'CM', mood: 'calm' }, opening: 'CHG-1100: change native VLAN to 99 on all trunks. It is 22:40 and two access switches are unreachable after your change. Window ends at 23:00.', urgency: 'high', impact: 'department', triageWhy: 'Users will arrive to a broken network; the window is closing.', questions: [q('plan', 'Was there a rollback plan?', 'Yes: revert native VLAN to 1 from the console.')], evidence: [ev('cdp', 'logs', 'CORE syslog', '%CDP-4-NATIVE_VLAN_MISMATCH on Te1/1/3 (99), with ASW-07 Gi0/25 (1)')], diagnoses: [opt('mismatch', 'The far ends still use native VLAN 1, so management (untagged) traffic is lost', true, 'CDP reports native mismatch on the trunks.'), opt('stp', 'STP loop', false, 'Logs show a native mismatch.')], fixes: [opt('rollback', 'Execute the rollback now from console, verify reachability, close the change as failed and replan with both ends', true, 'Restores service inside the window.'), opt('push', 'Keep trying to fix it after 23:00 without approval', false, 'Running past the window without approval breaks change control.')], escalation: { correct: 'Change manager', options: ['none', 'Change manager', 'Vendor'], why: 'Report the rollback to the change manager.' }, noteKeywords: ['rollback', 'native vlan', 'mismatch'], hints: ['Change manager: "When the window is closing, what does the plan say to do?"'] }),
  ]),
  t('customer-escalation', 'Customer escalation', 'Service desk lead', 'An unhappy customer escalates. Calm, own, fix, and follow up.', ['helpdesk'], 'Service manager', [
    base({ id: 'ce-sla', channel: 'email', caller: { name: 'Kadiatu Fofanah', role: 'Client office manager', avatar: 'KF', mood: 'angry' }, opening: 'This is the THIRD time this week our internet drops. Your team keeps closing the ticket. I want someone senior NOW.', urgency: 'high', impact: 'organization', triageWhy: 'A client’s whole office keeps losing internet and trust is at risk.', questions: [q('tickets', 'Can you give me the previous ticket numbers?', 'INC-3301, INC-3318.')], evidence: [ev('hist', 'ticket-history', 'INC-3301, INC-3318', 'Both closed as "router rebooted, working". No root cause recorded.'), ev('wan', 'logs', 'Client router log', 'WAN link flaps every ~2 days, CRC errors on the ISP hand-off cable')], diagnoses: [opt('root', 'A recurring physical fault on the WAN hand-off that previous tickets never investigated', true, 'Repeated flaps with CRC errors; tickets closed without root cause.'), opt('user', 'The client is exaggerating', false, 'Logs confirm the flaps.')], fixes: [opt('own', 'Acknowledge, own the issue, schedule cable/ISP replacement, give a clear timeline and follow up after the fix', true, 'Fixes the cause and the relationship.'), opt('reboot', 'Reboot the router again and close', false, 'That is why she escalated.')], escalation: { correct: 'Network team', options: ['none', 'Network team', 'Sales'], why: 'The physical WAN fault needs the network team and the ISP; you keep ownership of the customer.' }, noteKeywords: ['root cause', 'crc', 'follow up', 'timeline'], hints: ['Service manager: "She is not angry about one outage. What did the last two tickets fail to do?"'] }),
  ]),
];
