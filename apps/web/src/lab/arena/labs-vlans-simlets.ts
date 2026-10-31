// Chapter 8 simlets: live networks you investigate with show, ping and traceroute, then answer
// questions about. Modelled on the Cisco exam simlet (config locked, you run the commands yourself)
// and the CCNP TSHOOT ticket (device, technology, fix). Distractors use real terms in the wrong place,
// so guessing from keywords does not work. Every answer is checked against the simulator in tests.
import { applyDtp } from '../l2features';
import type { Device, Iface, LabDoc } from '../types';
import { builder } from '../workbooks';
import type { ArenaLab } from './types';

const opts = (...t: string[]) => t.map((text, k) => ({ id: 'abcdef'[k], text }));

function subif(d: Device, parent: string, vlan: number, ip: string) {
  const mac = d.interfaces.find((i) => i.name === parent)?.mac ?? '';
  const s: Iface = { name: `${parent}.${vlan}`, type: 'virtual', speeds: [1000], speed: 'auto', duplex: 'auto', mac, shutdown: false, mode: 'routed', parent, vlan, ip, prefix: 24 };
  d.interfaces.push(s);
  return s;
}
const find = (doc: LabDoc, id: string) => doc.devices.find((d) => d.id === id)!;

export const VLAN_SIMLETS: ArenaLab[] = [
  // ---------------- S8.1 reachability audit ----------------
  {
    id: 'sim-vlan-reach',
    topicId: 'ch8-vlans',
    title: 'Simlet: branch audit, who can really talk to whom',
    kind: 'simlet',
    difficulty: 2,
    minutes: 12,
    brief:
      'You are taking over the Riverside branch from another engineer. Before you change anything, your lead wants a written audit of what works and what does not. The configuration is locked: use show commands, ping and traceroute on BR-SW1, BR-SW2 and the PCs, then answer the questions.\n\nDesign on record: VLAN 10 SALES 10.20.10.0/24, VLAN 20 ENG 10.20.20.0/24, VLAN 30 PRINT 10.20.30.0/24. Every VLAN should exist on both switches and cross the trunk.',
    objectives: ['Read show vlan brief and show interfaces trunk together', 'Spot a VLAN pruned from a trunk', 'Recognise an inactive access port', 'Prove reachability with ping instead of guessing'],
    exam: ['2.1', '2.2'],
    build() {
      const b = builder();
      b.dev('sw1', 'c2960x24', 'BR-SW1', 220, 120, { vlans: { 1: 'default', 10: 'SALES', 20: 'ENG', 30: 'PRINT' } });
      b.dev('sw2', 'c2960x24', 'BR-SW2', 620, 120, { vlans: { 1: 'default', 10: 'SALES', 20: 'ENG' } });
      b.cable('sw1', 'Gi0/24', 'sw2', 'Gi0/24');
      b.set('sw1', 'Gi0/24', { mode: 'trunk', allowedVlans: [10, 30], nativeVlan: 1 });
      b.set('sw2', 'Gi0/24', { mode: 'trunk', allowedVlans: 'all', nativeVlan: 1 });
      const hosts: [string, string, string, string, string, number, number, number][] = [
        ['s1', 'SALES-PC1', 'sw1', 'Gi0/1', '10.20.10.11', 10, 60, 330],
        ['e1', 'ENG-PC1', 'sw1', 'Gi0/2', '10.20.20.11', 20, 200, 330],
        ['p1', 'PRINT-SRV', 'sw1', 'Gi0/3', '10.20.30.11', 30, 340, 330],
        ['s2', 'SALES-PC2', 'sw2', 'Gi0/1', '10.20.10.12', 10, 480, 330],
        ['e2', 'ENG-PC2', 'sw2', 'Gi0/2', '10.20.20.12', 20, 600, 330],
        ['e3', 'ENG-PC3', 'sw2', 'Gi0/3', '10.20.20.13', 20, 720, 330],
        ['p2', 'LABEL-PRINTER', 'sw2', 'Gi0/4', '10.20.30.12', 30, 840, 330],
        ['s3', 'SALES-PC3', 'sw2', 'Gi0/5', '10.20.10.13', 20, 960, 330],
      ];
      for (const [id, name, sw, port, ip, vl, x, y] of hosts) {
        b.dev(id, 'optiplex', name, x, y);
        b.ip(id, 'Ethernet', ip, 24);
        b.cable(sw, port, id, 'Ethernet');
        b.set(sw, port, { mode: 'access', vlan: vl });
      }
      return b.doc;
    },
    items: [],
    tests: [],
    questions: [
      {
        id: 'q1',
        prompt: 'Which two pings succeed? (Choose two.)',
        options: opts('SALES-PC1 → SALES-PC2', 'ENG-PC1 → ENG-PC2', 'ENG-PC2 → ENG-PC3', 'PRINT-SRV → LABEL-PRINTER', 'SALES-PC2 → SALES-PC3'),
        answer: ['a', 'c'],
        points: 20,
        hint: 'Ping each pair from the PC consoles. Do not assume: the trunk and both VLAN databases all matter.',
        explain: 'SALES-PC1 to SALES-PC2 works because VLAN 10 is allowed on the trunk and exists on both switches. ENG-PC2 and ENG-PC3 share BR-SW2, so the trunk never matters. ENG-PC1 fails at the BR-SW1 trunk (VLAN 20 pruned), PRINT-SRV fails because VLAN 30 does not exist on BR-SW2, and SALES-PC3 sits in VLAN 20 with a Sales address.',
      },
      {
        id: 'q2',
        prompt: 'ENG-PC1 cannot reach ENG-PC2. What is the cause?',
        options: opts('VLAN 20 is not in the allowed VLAN list on BR-SW1 Gi0/24', 'VLAN 20 does not exist on BR-SW2', 'A native VLAN mismatch on the trunk drops VLAN 20', 'DTP failed, so Gi0/24 is not trunking'),
        answer: ['a'],
        points: 20,
        hint: 'show interfaces trunk on both switches. Compare "Vlans allowed on trunk".',
        explain: 'show interfaces trunk on BR-SW1 lists only 10,30 as allowed. BR-SW2 allows all, but a trunk carries a VLAN only if both ends allow it. VLAN 20 exists on both switches (show vlan brief), the native VLAN is 1 on both ends, and the trunk is up, so the other answers are traps.',
      },
      {
        id: 'q3',
        prompt: 'What is the state of BR-SW2 Gi0/4, the LABEL-PRINTER port?',
        options: opts('Access port in VLAN 30, inactive because VLAN 30 is not in BR-SW2’s VLAN database', 'Err-disabled by port security', 'Trunking with native VLAN 30', 'Access port in VLAN 1 because VLAN 30 was rejected'),
        answer: ['a'],
        points: 20,
        hint: 'show interfaces gi0/4 switchport and show vlan brief on BR-SW2. Look for what is missing.',
        explain: 'show interfaces gi0/4 switchport says Access Mode VLAN: 30 (Inactive), and show vlan brief on BR-SW2 has no VLAN 30 row, so Gi0/4 is not listed anywhere. The port keeps its VLAN 30 assignment but forwards nothing until the VLAN is created. That is why PRINT-SRV cannot reach it even though VLAN 30 is allowed on the trunk.',
      },
      {
        id: 'q4',
        prompt: 'SALES-PC3 cannot reach any Sales host. Which single change fixes it?',
        options: opts('BR-SW2 Gi0/5: switchport access vlan 10', 'BR-SW1 Gi0/24: switchport trunk allowed vlan add 20', 'SALES-PC3: set a default gateway', 'BR-SW2: vlan 10'),
        answer: ['a'],
        points: 20,
        hint: 'show vlan brief on BR-SW2: which VLAN lists Gi0/5?',
        explain: 'Gi0/5 is in VLAN 20 (ENG) while the PC has a Sales address. Same-subnet traffic never uses a gateway, so a gateway change does nothing. VLAN 10 already exists on BR-SW2, and allowing VLAN 20 on the trunk fixes ENG-PC1, not SALES-PC3.',
      },
      {
        id: 'q5',
        prompt: 'Which single command on BR-SW2 lets PRINT-SRV reach LABEL-PRINTER?',
        options: opts('vlan 30 (in global configuration)', 'switchport trunk allowed vlan add 30 on Gi0/24', 'spanning-tree portfast on Gi0/4', 'switchport mode trunk on Gi0/4'),
        answer: ['a'],
        points: 20,
        hint: 'What does BR-SW2 need before a VLAN 30 port can forward?',
        explain: 'Gi0/4 is already assigned to VLAN 30 and BR-SW2 Gi0/24 already allows all VLANs, so the only thing missing is the VLAN itself. PortFast only skips the spanning tree listening and learning delay, and turning a printer port into a trunk would break it completely.',
      },
    ],
    debrief:
      'This is the read-before-you-touch habit. Three different faults look the same to users ("I cannot reach X"), and each shows up in a different command: a pruned VLAN only in show interfaces trunk, a missing VLAN only by its absence in show vlan brief (and as Inactive in show interfaces switchport), and a wrong access VLAN only when you compare the port to the IP plan. On the exam, simlet questions are built so that one output alone never gives the answer; correlate at least two.',
    verify: ['show vlan brief', 'show interfaces trunk', 'show interfaces gi0/4 switchport', 'show logging', 'ping from each PC'],
  },

  // ---------------- S8.2 DTP forensics ----------------
  {
    id: 'sim-vlan-dtp',
    topicId: 'ch8-vlans',
    title: 'Simlet: four uplinks, four DTP outcomes',
    kind: 'simlet',
    difficulty: 3,
    minutes: 15,
    brief:
      'DIST1 connects to four access switches. Over the years different contractors configured the uplinks, and nobody hard-coded them the same way. Users on two floors cannot reach FILESRV (10.40.10.5, VLAN 10 on DIST1). Configuration is locked. Work out how each uplink actually came up and answer the questions.',
    objectives: ['Read Administrative vs Operational mode', 'Predict every DTP combination', 'Spot a trunk on one end and access on the other', 'Pick the hardened uplink configuration'],
    exam: ['2.2', '2.1'],
    build() {
      const b = builder();
      const vl = { 1: 'default', 10: 'USERS' };
      b.dev('d', 'c2960x24', 'DIST1', 460, 60, { vlans: { ...vl } });
      b.dev('fs', 'services-server', 'FILESRV', 820, 60);
      b.ip('fs', 'eno1', '10.40.10.5', 24);
      b.cable('d', 'Gi0/10', 'fs', 'eno1');
      b.set('d', 'Gi0/10', { mode: 'access', vlan: 10 });
      for (let k = 1; k <= 4; k++) {
        b.dev(`a${k}`, 'c2960x24', `ACC${k}`, 100 + (k - 1) * 240, 220, { vlans: { ...vl } });
        b.cable('d', `Gi0/${k}`, `a${k}`, 'Gi0/24');
        b.dev(`pc${k}`, 'optiplex', `PC-ACC${k}`, 100 + (k - 1) * 240, 380);
        b.ip(`pc${k}`, 'Ethernet', `10.40.10.${10 + k}`, 24);
        b.cable(`a${k}`, 'Gi0/1', `pc${k}`, 'Ethernet');
        b.set(`a${k}`, 'Gi0/1', { mode: 'access', vlan: 10 });
      }
      b.set('d', 'Gi0/1', { dtp: 'desirable', mode: 'access' });
      b.set('a1', 'Gi0/24', { dtp: 'auto', mode: 'access' });
      b.set('d', 'Gi0/2', { dtp: 'auto', mode: 'access' });
      b.set('a2', 'Gi0/24', { dtp: 'auto', mode: 'access' });
      b.set('d', 'Gi0/3', { mode: 'trunk', allowedVlans: 'all', nativeVlan: 1, nonegotiate: true });
      b.set('a3', 'Gi0/24', { dtp: 'desirable', mode: 'access' });
      b.set('d', 'Gi0/4', { mode: 'trunk', allowedVlans: 'all', nativeVlan: 1 });
      b.set('a4', 'Gi0/24', { dtp: 'auto', mode: 'access' });
      applyDtp(b.doc);
      return b.doc;
    },
    items: [],
    tests: [],
    questions: [
      {
        id: 'q1',
        prompt: 'Which two uplinks are operating as trunks on both ends? (Choose two.)',
        options: opts('DIST1 Gi0/1 to ACC1', 'DIST1 Gi0/2 to ACC2', 'DIST1 Gi0/3 to ACC3', 'DIST1 Gi0/4 to ACC4'),
        answer: ['a', 'd'],
        points: 20,
        hint: 'show interfaces gi0/x switchport on BOTH ends. Read Operational Mode, not Administrative Mode.',
        explain: 'Gi0/1 is desirable to auto: desirable asks, auto agrees, trunk. Gi0/4 is a static trunk that still sends DTP, so ACC4 (auto) agrees. Gi0/3 trunks on DIST1 only, so it is not a trunk on both ends.',
      },
      {
        id: 'q2',
        prompt: 'Why is DIST1 Gi0/2 to ACC2 not trunking?',
        options: opts('Both ends are dynamic auto, so neither side starts the negotiation', 'VLAN 10 is not allowed on the link', 'The native VLANs do not match', 'ACC2 has switchport nonegotiate configured'),
        answer: ['a'],
        points: 20,
        hint: 'Compare Administrative Mode on both ends of this link.',
        explain: 'Dynamic auto only answers DTP, it never asks. Two auto ports wait for each other forever and fall back to access in VLAN 1. That is also why PC-ACC2 cannot reach FILESRV: VLAN 10 never crosses an access link in VLAN 1.',
      },
      {
        id: 'q3',
        prompt: 'What is happening on the DIST1 Gi0/3 to ACC3 link?',
        options: opts(
          'DIST1 is a static trunk with nonegotiate, so no DTP reaches ACC3; ACC3 stays access and drops the VLAN 10 frames DIST1 tags',
          'Both ends negotiated a trunk, but VLAN 10 is pruned',
          'Both ends are access ports in VLAN 1',
          'The port is err-disabled because of a DTP mismatch',
        ),
        answer: ['a'],
        points: 20,
        hint: 'show interfaces gi0/3 switchport on DIST1, then show interfaces gi0/24 switchport on ACC3. Check Negotiation of Trunking.',
        explain: 'Nonegotiate stops DTP frames. ACC3 is desirable, but desirable needs a DTP reply to become a trunk, so it stays access. DIST1 tags VLAN 10 frames with 802.1Q; an access port drops tagged frames for another VLAN. This mismatch does not err-disable anything, which is what makes it dangerous: both ports show up/up.',
      },
      {
        id: 'q4',
        prompt: 'Which two PCs can reach FILESRV 10.40.10.5? (Choose two.)',
        options: opts('PC-ACC1', 'PC-ACC2', 'PC-ACC3', 'PC-ACC4'),
        answer: ['a', 'd'],
        points: 20,
        hint: 'Ping 10.40.10.5 from each PC.',
        explain: 'Only the two working trunks carry VLAN 10. PC-ACC2 is cut off by the auto/auto access link, PC-ACC3 by the trunk/access mismatch.',
      },
      {
        id: 'q5',
        prompt: 'Which configuration on every uplink gives a predictable trunk and the smallest attack surface?',
        options: opts('switchport mode trunk and switchport nonegotiate on both ends', 'switchport mode dynamic desirable on both ends', 'dynamic desirable on DIST1 and dynamic auto on the access switches', 'switchport mode trunk on DIST1 only'),
        answer: ['a'],
        points: 20,
        hint: 'Which option removes DTP from the link completely?',
        explain: 'Hard-coding both ends removes the guesswork, and nonegotiate stops DTP frames, which also stops an attacker from negotiating a trunk with a spoofed DTP frame (switch spoofing). The desirable options work today but still depend on DTP, and trunk on one end only is how Gi0/4 got lucky.',
      },
    ],
    debrief:
      'Memorise the DTP table as three rules. Auto only answers. Desirable asks. Nonegotiate stops all DTP, so the other end must be hard-coded to match. Then remember the trap the exam loves: Administrative Mode is what someone typed, Operational Mode is what the link actually became, and a trunk/access mismatch leaves both ports up/up with VLANs silently dropped.',
    verify: ['show interfaces trunk', 'show interfaces gi0/1 switchport', 'show interfaces gi0/24 switchport (on each ACC)', 'ping 10.40.10.5'],
  },

  // ---------------- S8.3 native VLAN and voice ----------------
  {
    id: 'sim-vlan-native-voice',
    topicId: 'ch8-vlans',
    title: 'Simlet: half a VLAN works, one phone is dead',
    kind: 'simlet',
    difficulty: 3,
    minutes: 15,
    brief:
      'Help desk escalation at HQ: "Since yesterday, people in VLAN 10 on the second floor (HQ-SW2) cannot reach VLAN 10 on the first floor. Engineering in VLAN 20 is fine. Also PHONE-2 has no dial tone but PHONE-1 next to it works."\n\nDesign standard: VLAN 10 DATA, 20 ENG, 50 VOICE, native VLAN 999 on every trunk. CALL-MGR is 10.60.50.5 on HQ-SW1. Configuration is locked.',
    objectives: ['Read %CDP-4-NATIVE_VLAN_MISMATCH', 'Explain why a native mismatch breaks one VLAN in one direction', 'Read the Voice VLAN line in show interfaces switchport'],
    exam: ['2.1.b', '2.2'],
    build() {
      const b = builder();
      const vl = { 1: 'default', 10: 'DATA', 20: 'ENG', 50: 'VOICE', 999: 'NATIVE' };
      b.dev('sw1', 'c2960x24ps', 'HQ-SW1', 220, 120, { vlans: { ...vl } });
      b.dev('sw2', 'c2960x24ps', 'HQ-SW2', 620, 120, { vlans: { ...vl } });
      b.cable('sw1', 'Gi0/24', 'sw2', 'Gi0/24');
      b.set('sw1', 'Gi0/24', { mode: 'trunk', allowedVlans: 'all', nativeVlan: 999, nonegotiate: true });
      b.set('sw2', 'Gi0/24', { mode: 'trunk', allowedVlans: 'all', nativeVlan: 10, nonegotiate: true });
      b.dev('cm', 'services-server', 'CALL-MGR', 40, 120);
      b.ip('cm', 'eno1', '10.60.50.5', 24);
      b.cable('sw1', 'Gi0/10', 'cm', 'eno1');
      b.set('sw1', 'Gi0/10', { mode: 'access', vlan: 50 });
      const hosts: [string, string, string, string, string, number, number, number, number?][] = [
        ['pa', 'optiplex', 'PC-A', 'sw1', 'Gi0/1', 10, 120, 330],
        ['pb', 'optiplex', 'PC-B', 'sw1', 'Gi0/2', 20, 280, 330],
        ['pc', 'optiplex', 'PC-C', 'sw2', 'Gi0/1', 10, 480, 330],
        ['pd', 'optiplex', 'PC-D', 'sw2', 'Gi0/2', 20, 620, 330],
        ['ph1', 'ip-phone-8845', 'PHONE-1', 'sw2', 'Gi0/5', 10, 760, 330, 50],
        ['ph2', 'ip-phone-8845', 'PHONE-2', 'sw2', 'Gi0/6', 10, 900, 330],
      ];
      const ips: Record<string, string> = { pa: '10.60.10.11', pb: '10.60.20.11', pc: '10.60.10.12', pd: '10.60.20.12', ph1: '10.60.50.21', ph2: '10.60.50.22' };
      for (const [id, model, name, sw, port, vlan, x, y, voice] of hosts) {
        b.dev(id, model, name, x, y);
        b.ip(id, 'Ethernet', ips[id], 24);
        b.cable(sw, port, id, 'Ethernet');
        b.set(sw, port, { mode: 'access', vlan, ...(voice ? { voiceVlan: voice } : {}) });
      }
      return b.doc;
    },
    items: [],
    tests: [],
    questions: [
      {
        id: 'q1',
        prompt: 'What does show logging on HQ-SW2 report?',
        options: opts('%CDP-4-NATIVE_VLAN_MISMATCH on Gi0/24: HQ-SW2 native 10, HQ-SW1 native 999', '%LINK-3-UPDOWN: Interface GigabitEthernet0/24, changed state to down', '%DTP-5-TRUNKPORTON: Gi0/24 has become dot1q trunk', '%PM-4-ERR_DISABLE: psecure-violation on Gi0/6'),
        answer: ['a'],
        points: 20,
        hint: 'show logging on HQ-SW2.',
        explain: 'CDP carries each side’s native VLAN and logs a mismatch on both switches. It is the fastest clue you get, and on a real network it repeats every minute until fixed.',
      },
      {
        id: 'q2',
        prompt: 'Which two pings succeed? (Choose two.)',
        options: opts('PC-B → PC-D', 'PC-A → PC-C', 'PHONE-1 → CALL-MGR', 'PHONE-2 → CALL-MGR'),
        answer: ['a', 'c'],
        points: 20,
        hint: 'Ping each pair. VLAN 20 is tagged on both ends; VLAN 10 is not.',
        explain: 'VLAN 20 is tagged on both ends, so the mismatch never touches it. PHONE-1 tags its voice traffic with VLAN 50 (learned from the switch port), and VLAN 50 is tagged across the trunk. VLAN 10 and PHONE-2 fail for the reasons in the next questions.',
      },
      {
        id: 'q3',
        prompt: 'Why can VLAN 10 on HQ-SW2 not reach VLAN 10 on HQ-SW1, while VLAN 20 works?',
        options: opts(
          'HQ-SW2 sends VLAN 10 untagged because it is HQ-SW2’s native VLAN, and HQ-SW1 puts untagged frames into VLAN 999',
          'VLAN 10 is not in the allowed list on the trunk',
          'VLAN 10 does not exist on HQ-SW1',
          'DTP negotiated Gi0/24 down to an access port in VLAN 10',
        ),
        answer: ['a'],
        points: 20,
        hint: 'show interfaces trunk on both switches. Which VLAN is native on each end, and which end sends VLAN 10 without a tag?',
        explain: 'A switch sends its native VLAN without an 802.1Q tag. HQ-SW2 treats VLAN 10 as native, so VLAN 10 frames leave untagged; HQ-SW1 receives untagged frames into its own native VLAN, 999, where nobody lives. Frames the other way are tagged 10 and accepted, so the failure is one-directional, which is why some users report "it sort of works". The allowed list is ALL, VLAN 10 exists on both switches, and both ends are hard-coded trunks with DTP off.',
      },
      {
        id: 'q4',
        prompt: 'PHONE-2 has no dial tone. What is missing?',
        options: opts('switchport voice vlan 50 on HQ-SW2 Gi0/6', 'switchport access vlan 50 on HQ-SW2 Gi0/6', 'VLAN 50 on HQ-SW2', 'Power over Ethernet on HQ-SW2 Gi0/6'),
        answer: ['a'],
        points: 20,
        hint: 'show interfaces gi0/5 switchport and gi0/6 switchport on HQ-SW2. Compare the Voice VLAN line.',
        explain: 'Gi0/5 shows Voice VLAN: 50 (VOICE) and Gi0/6 shows Voice VLAN: none. Without it the phone is never told its voice VLAN (CDP/LLDP-MED), sends untagged, and lands in data VLAN 10 with a voice address. Changing the access VLAN to 50 would make the phone work but would put the PC behind it into the voice VLAN, which breaks the design. VLAN 50 exists and the phone is powered (it shows up in show power inline).',
      },
      {
        id: 'q5',
        prompt: 'Which change fixes VLAN 10 and follows the design standard?',
        options: opts('HQ-SW2 Gi0/24: switchport trunk native vlan 999', 'HQ-SW1 Gi0/24: switchport trunk native vlan 10', 'Both ends: switchport trunk allowed vlan remove 10', 'HQ-SW2 Gi0/24: no switchport nonegotiate'),
        answer: ['a'],
        points: 20,
        hint: 'Which end disagrees with the design standard?',
        explain: 'Matching HQ-SW1 to native 10 would also restore VLAN 10, but it breaks the standard and leaves user traffic untagged on a trunk, which is exactly what VLAN hopping attacks rely on. Fix the end that is wrong. DTP has nothing to do with the native VLAN.',
      },
    ],
    debrief:
      'A native VLAN mismatch is the classic "half broken" fault: only the VLAN that is native on one end breaks, sometimes in one direction only, and every other VLAN keeps working, so users describe it in confusing ways. Your fastest path is show logging (the CDP mismatch message), then show interfaces trunk on both ends. For phones, always read the Voice VLAN line in show interfaces switchport; show vlan brief lists the port under both VLANs and is easy to misread.',
    verify: ['show logging', 'show interfaces trunk', 'show interfaces gi0/6 switchport', 'show vlan brief', 'show power inline'],
  },

  // ---------------- S8.4 TSHOOT-style ticket ----------------
  {
    id: 'sim-vlan-ticket-roas',
    topicId: 'ch8-vlans',
    title: 'Ticket: Engineering lost the file share after a router change',
    kind: 'simlet',
    difficulty: 2,
    minutes: 12,
    brief:
      'Ticket INC-4471, priority 2.\n"Since the maintenance window last night, nobody in Engineering can open the file share or ping anything outside their own VLAN. Sales is fine. The network team changed something on the router." (ENG-PC1 user)\n\nAnswer the ticket like a NOC engineer: which device, which technology, what fix. Access is show, ping and traceroute only. Start at ENG-PC1 and ping outward one hop at a time.\n\nVLAN 10 SALES 192.168.10.0/24, VLAN 20 ENG 192.168.20.0/24, VLAN 30 SERVERS 192.168.30.0/24. Gateways are .1 on R1 sub-interfaces.',
    objectives: ['Isolate the fault hop by hop', 'Read 802.1Q sub-interfaces in a running config', 'Answer in the device, technology, fix format'],
    exam: ['2.1', '3.1'],
    build() {
      const b = builder();
      const r = b.dev('r1', 'isr4331', 'R1', 420, 40);
      b.dev('sw1', 'c2960x24', 'SW1', 420, 200, { vlans: { 1: 'default', 10: 'SALES', 20: 'ENG', 30: 'SERVERS' } });
      b.cable('r1', 'Gi0/0/0', 'sw1', 'Gi0/24');
      b.set('sw1', 'Gi0/24', { mode: 'trunk', allowedVlans: 'all', nativeVlan: 1 });
      for (const i of r.interfaces) if ((i.type === 'copper' || i.type === 'sfp') && i.name !== 'Gi0/0/0') i.shutdown = true;
      b.set('r1', 'Gi0/0/0', { shutdown: false });
      subif(r, 'Gi0/0/0', 10, '192.168.10.1');
      const eng = subif(r, 'Gi0/0/0', 21, '192.168.20.1');
      eng.name = 'Gi0/0/0.20';
      subif(r, 'Gi0/0/0', 30, '192.168.30.1');
      const hosts: [string, string, string, string, string, number, number][] = [
        ['ps', 'SALES-PC1', 'Gi0/1', '192.168.10.10', '192.168.10.1', 10, 160],
        ['e1', 'ENG-PC1', 'Gi0/2', '192.168.20.10', '192.168.20.1', 20, 330],
        ['e2', 'ENG-PC2', 'Gi0/3', '192.168.20.11', '192.168.20.1', 20, 500],
      ];
      for (const [id, name, port, ip, gw, vl, x] of hosts) {
        b.dev(id, 'optiplex', name, x, 380);
        b.ip(id, 'Ethernet', ip, 24, gw);
        b.cable('sw1', port, id, 'Ethernet');
        b.set('sw1', port, { mode: 'access', vlan: vl });
      }
      b.dev('fs', 'services-server', 'FILESRV', 700, 380);
      b.ip('fs', 'eno1', '192.168.30.10', 24, '192.168.30.1');
      b.cable('sw1', 'Gi0/10', 'fs', 'eno1');
      b.set('sw1', 'Gi0/10', { mode: 'access', vlan: 30 });
      return b.doc;
    },
    items: [],
    tests: [],
    questions: [
      {
        id: 'q1',
        tag: 'Device',
        prompt: 'Which device is causing the fault?',
        options: opts('R1', 'SW1', 'ENG-PC1', 'FILESRV'),
        answer: ['a'],
        points: 30,
        hint: 'From ENG-PC1: ping ENG-PC2 (same VLAN), then the gateway 192.168.20.1. Where do replies stop?',
        explain: 'ENG-PC1 reaches ENG-PC2, so the PC, its port and VLAN 20 on SW1 are fine. It cannot reach its gateway 192.168.20.1, and Sales can reach FILESRV through the same trunk, so SW1 and FILESRV are fine too. That leaves R1.',
      },
      {
        id: 'q2',
        tag: 'Technology',
        prompt: 'Which technology is involved?',
        options: opts('Inter-VLAN routing: 802.1Q sub-interface configuration', 'VLAN trunking: allowed VLAN list on SW1 Gi0/24', 'IPv4 addressing: wrong default gateway on the Engineering PCs', 'Access control lists on R1'),
        answer: ['a'],
        points: 35,
        hint: 'show running-config on R1. Read every sub-interface line by line.',
        explain: 'R1 Gi0/0/0.20 has the right address but encapsulation dot1Q 21. SW1 tags Engineering frames with 20, and R1 has no sub-interface for tag 20, so it discards them. SW1 allows all VLANs (show interfaces trunk), the PCs point at 192.168.20.1, and R1 has no ACLs.',
      },
      {
        id: 'q3',
        tag: 'Fix',
        prompt: 'What is the fix?',
        options: opts('R1: interface Gi0/0/0.20, encapsulation dot1Q 20', 'SW1: interface Gi0/24, switchport trunk allowed vlan add 21', 'Engineering PCs: change the default gateway to 192.168.21.1', 'R1: interface Gi0/0/0.20, ip address 192.168.21.1 255.255.255.0'),
        answer: ['a'],
        points: 35,
        hint: 'The sub-interface number is just a name. Which line decides the VLAN it serves?',
        explain: 'The number after the dot is only a label; encapsulation dot1Q decides which VLAN tag the sub-interface accepts. Changing the tag to 20 restores routing. The other options move the rest of the network to match the typo, which would break the design and the next engineer.',
      },
    ],
    debrief:
      'This is the CCNP TSHOOT ticket format, used here at CCNA level: identify the device, the technology and the fix, using only show and ping. The method matters more than the answer: ping the same VLAN first (proves the access layer), then the gateway (proves the trunk and the router), then the destination. Where replies stop tells you which device to read. On router-on-a-stick, the sub-interface number is cosmetic and the dot1Q tag is what counts, so always read the encapsulation line.',
    verify: ['ping 192.168.20.11 (ENG-PC1)', 'ping 192.168.20.1 (ENG-PC1)', 'show running-config (R1)', 'show ip interface brief (R1)', 'show interfaces trunk (SW1)'],
  },
];
