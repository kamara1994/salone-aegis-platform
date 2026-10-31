# Lab Arena

Packet Tracer style assessed labs, organised by CCNA topic (book chapter order). Route: `/arena`,
also embedded under a cert dashboard: Scenario lab › Lab Arena.

## How it works

1. **Launch.** `/arena` → Start opens `/lab?arena=<labId>`. The lab's `build()` loads its own
   initial network into the designer (the user's design is saved under Layouts first).
2. **Work.** The Lab Arena panel (right) shows the brief, tasks and addressing table. The terminal
   dock (bottom, `Ctrl+\``) opens several device consoles in tabs, like Packet Tracer's CLI tab.
   Double-clicking a device on the canvas opens its console in the dock.
3. **Grade.** `gradeArena()` scores the live design: weighted assessment items (config and control
   plane) plus connectivity tests (real simulated packets). Nothing reads typed commands.
4. **Submit.** Records an attempt (score, time, hints, missed items) in `localStorage`
   (`aegis.arena.v1`). Results show the assessment tree, connectivity tests and the debrief.

## Lab kinds

| Kind | Live ticks | Hints | Check results | Notes |
|---|---|---|---|---|
| guided | yes | yes (half points) | yes | Teaches. |
| skills | no | yes (half points) | yes (practice check) | Build to a design document. |
| troubleshoot | fixed faults only | yes (half points) | yes, unfixed faults masked | Faults are injected in `build()`; listed in `faults` for the debrief. |
| challenge | no | no | no | `timeLimit` in minutes; auto-submits at zero. |

## Adding a lab

1. Add an `ArenaLab` to a `labs-<topic>.ts` file in `apps/web/src/lab/arena/` and spread it into
   `ARENA_LABS` in `index.ts`. Set the topic's `status` to `'ready'` in `ARENA_TOPICS`.
2. `build()` uses the workbook `builder()` (devices, IPs, cables, notes). For troubleshooting labs,
   build the working network first, then break it.
3. Every item needs a `group` (tree path), `points` and a `check(ctx)` that returns
   `{ ok, detail }`. Write `detail` as what is wrong, in the student's terms.
4. Add the lab to `tests/unit/lab-arena.test.ts`: the catalog test checks the topology and that the
   lab starts unsolved; add one test that solves it through `DesignCli` and expects no misses.

## Engine additions in this release

- Voice VLAN: `switchport voice vlan <n>` (CLI, running-config, `show vlan`, simulation). An
  `ip-phone-8845` on the port tags its traffic with the voice VLAN, as if learned by CDP/LLDP-MED.
- `show interfaces <if> switchport`: administrative and operational mode, DTP negotiation, access,
  native and voice VLANs, allowed VLANs.
