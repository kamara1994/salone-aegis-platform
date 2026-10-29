# AEGIS operator cockpit

The one screen an operator works from: live map, ticket queue, client chat, consoles, automatic checks,
SOC queue, scenario library, skill tree, evidence, replays and the debrief interview.
Built on Next.js 15 (App Router), React 19, TypeScript and Tailwind 4.

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000 (bundles the scenario packs first)
npm run build && npm start
```

### Two modes, one code path

| `NEXT_PUBLIC_API_MODE` | What answers the API | Use it for |
|---|---|---|
| `mock` (default) | `src/mock/engine.ts`: a simulated lab running in the browser | Building and demoing without a back end; e2e tests |
| `live` | The real back end at `AEGIS_API_ORIGIN`, events over WebSocket | The real lab |

Both implement the same `AegisApi` and `EventStream` interfaces (`src/api/client.ts`, `src/api/events.ts`),
which are typed from `contracts/openapi.yaml`. Components never know which one they are talking to.

### Live mode settings

| Variable | Meaning |
|---|---|
| `AEGIS_API_ORIGIN` | Back-end origin. `/api/v1/*` is proxied to it by Next, so the browser stays same-origin |
| `NEXT_PUBLIC_WS_URL` | Event stream URL. Empty means `wss://<this host>/api/v1/events` |
| `NEXT_PUBLIC_OIDC_AUTHORITY`, `NEXT_PUBLIC_OIDC_CLIENT_ID` | Keycloak realm and public client for sign-in (authorization code + PKCE) |

Sign-in uses `oidc-client-ts`; the access token goes on every request as `Authorization: Bearer` and on the
WebSocket as `?access_token=`. Consoles in live mode call `POST /nodes/{id}/console-sessions` and connect
`guacamole-common-js` to the returned `tunnel_url` with its single-use `token` (RDP, SSH, VNC, serial).

## Screens

| Route | What it is for |
|---|---|
| `/` Cockpit | Dockable panels: live topology map, ticket queue, SOC queue, inspector, shift summary, activity. Drag tabs anywhere; the layout is saved |
| `/tickets` | All tickets with views (open, unclaimed, closed), priority and SLA filters |
| `/tickets/[id]` | The workspace: client chat, ticket details, console tabs, affected map, checks, runbook and hint ladder, inspector, work notes, timeline, evidence chain |
| `/topology` | Full map or list, node inspector (metrics, power, snapshots, console, tickets, alerts) and link inspector (flows, reconstructed packets) |
| `/lab` | Lab designer: a Packet Tracer-style canvas over the same lab (see below) |
| `/soc` | Alert queue, investigation, verdict with rationale, open an investigation ticket |
| `/scenarios` | Scenario library; launch in practice or exam mode |
| `/skills` | Skill tree earned only from closed tickets, checks and debrief scores, with links to the evidence |
| `/evidence` | Operator scorecard (SLA, MTTR, reopen rate, debrief trend), control scorecard, per-ticket hash-chained evidence |
| `/replay`, `/replay/[id]` | Step through any incident: map at that moment, events, chat, commands. Export for recruiter mode |
| `/settings` | Scheduler, on-call and quiet hours, browser notifications, restore lab baseline, reset layouts and demo data |
| `/recruiter` | Read-only public showcase built from an exported replay (static export with `AEGIS_RECRUITER_EXPORT=1`) |
| `/login`, `/auth/callback` | Sign-in (live mode) |

Always on top of every screen: the client switcher, most urgent SLA, next scheduled ticket, on-call toggle,
notifications drawer, `Ctrl K` command palette, the console dock and the debrief overlay, which opens by
itself when the server emits `debrief.started`.

### Keyboard

`Ctrl K` actions · `Enter` send chat, `Shift Enter` new line · `Ctrl Enter` submit a debrief answer ·
`Up`/`Down` console history, `Ctrl L` clear, `Ctrl C` cancel line · `Esc` close drawers and dialogs.

## Lab designer (`/lab`)

An editable network canvas built on the live topology.

- **Canvas**: pan, zoom, minimap, grid with snapping, box and Ctrl/Shift multi-select, groups, align and
  distribute, duplicate, copy/paste, delete, undo/redo (100 steps), keyboard shortcuts (`?` lists them),
  right-click menus for devices, cables and the canvas. Devices and cables move: drag a selected cable's round
  handle to route it, or drag one of its square end handles onto another device to reconnect it.
- **Devices** come from a catalog of real models (Cisco ISR 4331 and 1941, Catalyst 2960-X and 9300,
  OPNsense DEC2750, Dell R650, Proxmox VM, OptiPlex, legacy 100 Mb PC, ThinkPad, Catalyst 9120 AP, AWS VPC,
  ISP cloud, Axis camera, IoT sensor) with their actual port layouts. Each tile shows name, model, IP, VLAN,
  MAC, port count, power, health and how many links are up. Illustrations live in `public/lab/devices/`.
- **Cables**: straight-through, crossover, fibre, serial, console, trunk, access, WAN and virtual. Physical
  mistakes are refused with the reason and the fix (wrong port family, occupied port, wrong cable without
  auto-MDIX, console misuse, trunk to an end device). Configuration problems connect but keep the link down or
  amber (speed mismatch, duplex mismatch with lab counters, VLAN and trunk mismatches, shutdown ports, power off).
  Every cable has link lights at both ends, port labels, and a menu to inspect, replace, disable, test or remove.
- **Inspector** tabs: overview, ports, interfaces (editable), configuration (generated IOS, pf or Windows/netplan),
  terminal, logs, packets, routes, VLANs, firewall rules (ordered, editable) and actions (power, snapshot, VM
  console, ping). Terminal and VM console always request a session from the back end
  (`POST /nodes/{id}/console-sessions`); in live mode a failed request shows "Live console unavailable" with the
  reason and nothing is simulated.
- **Packet simulation**: send a ping (4 echoes) or a TCP/UDP packet between any two devices or to an IP. The
  simulator applies source address choice, ARP and the default gateway, 802.1Q switching per VLAN, longest-prefix
  routing, first-match firewall rules with implicit deny, TTL and the listening port. Results are delivered,
  blocked, dropped, malformed (CRC on a duplex-mismatched link) or delayed, each with the exact reason, the hop,
  and a fix. The packet animates across the canvas; the event list and per-hop PDU (MACs, VLAN tag, IPs, TTL,
  ports, route, ACL decision, timestamp) are inspectable. Live traffic from `flow.batch` events animates on cables,
  with blocked flows in red.
- **Control plane** (computed from the design on every change, `src/lab/protocols.ts`): Rapid-PVST root
  election, port roles and blocked ports (BLK on the cable, Root on the switch), broadcast-storm detection when a
  loop has STP off, EtherChannel (LACP, PAgP, static) with mismatch reasons, OSPF adjacencies with the exact
  reason one is down (area, mask, hello/dead, MTU, passive, router ID) and SPF routes (O, O IA, O*E2, AD 110),
  HSRP active/standby and virtual IP ownership, PAT, DHCP DORA through relays, PoE budgets (a camera on a non-PoE
  port stays off and says why) and wireless association (SSID, WPA2/WPA3, passphrase).
- **Design CLI** (Terminal tab, `src/lab/cli.ts`): an IOS-style CLI on routers, switches and firewalls (modes,
  `interface range`, addresses, VLANs, trunks, `channel-group`, `standby`, `ip nat`, `ip helper-address`,
  `router ospf`, static routes, `spanning-tree`, DHCP pools, SSH/enable secret/banner, 20+ `show` commands, ping,
  traceroute, `write memory`) and a Windows command prompt on hosts (`ipconfig /renew`, `ping`, `tracert`,
  `arp -a`, `netsh`). It always runs against the design and says so; real devices keep their back-end console.
- **Services tab**: DHCP client renew, SSID and client join, STP priority and port table, EtherChannel, OSPF per
  interface with neighbour state, HSRP, NAT, DHCP relay and server pools, PoE budget and management hardening.
- **Cable physics**: length limits (100 m copper, 550/300 m multimode, 10 km single-mode) and CML-style link
  conditioning (latency, jitter, loss, bandwidth) that the simulator applies.
- **Tools panel**: design audit with a score (link faults, control-plane problems, duplicate and off-subnet
  addressing, Telnet/no SSH/no enable secret, VLAN 1 and native VLAN 1, any-any and shadowed firewall rules,
  single points of failure, PoE budget); goals ("A must reach B on 443") with Check results; troubleshooting
  challenges that hide one realistic fault and reveal it afterwards; an any-to-any reachability matrix;
  Wireshark-style capture per cable with layer decode, hex dump and a real `.pcap` download; export of the lab
  JSON, port inventory CSV, all running configs and a bill of materials, and JSON import.
- **Switching and routing labs**: port security (sticky, maximum, shutdown/restrict/protect, err-disabled and
  recovery), BPDU guard and root guard, DTP and VTP (including the VTP bomb), DHCP snooping against rogue
  servers, dynamic ARP inspection, layer 3 switching (`ip routing`, SVIs, routed ports), IOS standard and
  extended ACLs (numbered and named, in/out, match counters), static NAT, VRRP and GLBP, EIGRP, and local SPAN
  into the capture tool. All of it is typed in the Design CLI or set in the Services and Physical tabs, and the
  simulator enforces it with the exact reason on every packet.
- **Guided labs** (Tools → Labs, or Learn → Lab drills): 17 CCNA and CCNP workbooks (basic switch and SSH,
  VLANs and trunking, router-on-a-stick, layer 3 switching, STP, EtherChannel, port security, DHCP and relay,
  DHCP snooping and DAI, static routing, OSPF single/multi-area, ACLs, NAT, HSRP, EIGRP, VTP/DTP, STP guards).
  Each builds its own topology (your design is saved as a layout first) and grades every task live from the
  configuration, control plane and real packet simulation, with hints.
- **Notes** on the canvas (text, box, oval; resizable, coloured; double-click to edit, Delete to remove).
- **Library tabs**: Devices and Cables. The Cables tab works like Packet Tracer's Connections: pick a cable
  (Automatic, straight-through, crossover, trunk, access, fibre, console, serial, WAN, virtual/wireless), then
  click two devices and choose their ports; each card says what the cable is for, its connector and its limit.
- **Hover card**: rest the mouse on a device to see what the model looks like, its ports, power and where it
  sits in a real building. It uses a licensed photo from `public/lab/photos/<model>.webp` when one exists
  (credited in `public/lab/ATTRIBUTION.md`), otherwise the illustration.
- **Physical tab**: the front panel drawn from the device's real port list, with live link lights (up, problem,
  STP blocking, no link, empty, shut down). Click a port to see what is plugged in, unplug it, plug a cable in
  there, or shut it down.
- **Find**: jump to a device by name, IP or MAC from the toolbar.
- **Lab structure**: sites, racks (place devices by U), VLANs (pushed to switch VLAN databases), subnets (with
  duplicate-address detection), WAN links (provider, bandwidth, latency used by the simulator) and cloud
  connections. Add or remove devices and interfaces (sub-interfaces, SVIs, loopbacks, tunnels, extra ports).
- **Layouts**: the draft autosaves; named layouts save and load; reset to baseline; compare with baseline
  highlights added, changed and removed devices, interfaces, rules and cables. When the lab changes under a saved
  design, a banner offers Refresh from lab (keeps positions and design-only devices).

Data sources: in mock mode the designer reads ports, VLANs, leases, counters and firewall rules from the simulated
lab, so a scenario's injected fault shows up on the canvas and in packet results. In live mode it uses only
`GET /topology`: the contract has no ports, MACs or routes, so cable ports are inferred (marked as such), MACs show
"not reported", and edits stay in the design. Layouts are stored in the browser until the API offers an endpoint.

Code: `src/lab/` (model, catalog, validation, simulator, control plane, CLI, audit, capture, challenges,
inventory, generated config, diff, store) and `src/components/lab/` (canvas, inspector, services, simulation and
tools panels, dialogs). Tests: `tests/unit/lab-*.test.ts`, `tests/e2e/lab-designer.spec.ts` and
`tests/e2e/lab-advanced.spec.ts`. What is built and what is still on the roadmap compared with Packet Tracer, CML,
EVE-NG, GNS3 and containerlab: `docs/LAB-GAP-ANALYSIS.md`.

## Learn (`/learn`)

Separate from the lab. AI-generated practice for CCNA, CCNP, Security+ and AWS Security (quiz, timed exam,
flashcards), AI mock interviews (network, SOC, help desk, cloud security) with per-answer feedback, optional
questions about your own lab design, and progress by objective. The questions and grading come from the back
end's model through `/learn/*` (client in `src/learn/api.ts`); the key never reaches the browser. In mock mode,
or when the back end has no model or no Learn endpoints yet, the page says exactly that. Subnetting drills
(generated and checked by arithmetic) and lab troubleshooting drills (open `/lab?challenge=<id>`) work offline.

## Code map

```
src/
  api/            contracts in code: generated schema types, REST client, event stream, auth, React Query hooks
  app/            routes (the (desk) group shares the shell and the sign-in gate)
  components/
    shell/        top bar, nav rail, command palette, notifications, console dock, toasts
    map/          topology map (React Flow) with live traffic, node and link inspectors
    tickets/      queue, status stepper, resolve dialog, checks, hints and runbooks, notes, timeline, evidence
    chat/         client conversation and identity verification
    console/      xterm.js console for the simulated lab, Guacamole client for the real one
    debrief/      full-screen interview with per-question scoring, voice answers, study list
    dock/         dockable layout (dockview), stacks into collapsible panels on phones
    replay/       incident replay player
    charts/       ECharts line chart themed to the desk
    providers.tsx runtime, React Query, event-to-cache bridge
  mock/           the simulated lab: topology and state, shells (PowerShell, IOS, OPNsense, Linux),
                  scenario behaviours, client personas, interviewer, engine (scheduler, SLA, flows, SOC, evidence)
  state/ui.ts     UI and live state (zustand)
scripts/bundle-scenarios.mjs   validates ../../scenarios against Contract 4 and bundles them
tests/unit/                    lab, scenario, debrief and contract tests (vitest)
tests/e2e/                     the full operator loop in a browser (Playwright)
```

## Tests

```bash
npm run typecheck
npm test                      # vitest: lab model, every scenario pack, interviewer, persona, contracts
npm run test:e2e              # Playwright: cockpit, full ticket loop to a scored debrief, SOC, launch, every screen, phone
PW_CHROMIUM_PATH=/path/to/chromium npm run test:e2e   # use an existing browser
npm run contracts:examples    # regenerate ../../contracts/examples from the simulated lab
```

## Design

Night-shift desk: ink-blue base, one blue for actions, green only for healthy, amber degraded, red down.
IBM Plex Sans for text, IBM Plex Mono for addresses, commands and hashes. Light theme from the top bar.
Respects reduced motion; every control is reachable by keyboard.
