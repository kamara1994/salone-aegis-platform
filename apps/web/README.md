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
