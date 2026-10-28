SALONE AEGIS — Platform Build Blueprint

SALONE AEGIS — Platform Build Blueprint
Oct 28, 2026

· ​@joe

Purpose
This is the build spec for the AEGIS Operator Platform: the single dashboard where you
run the whole lab. You receive notifications, work tickets, talk to clients, open consoles,
fix real faults, explain the fix, and get interviewed on it, all without leaving one screen.
The lab design itself (sites, VLANs, SOC, AWS, the MSP clients) lives in the SALONE
AEGIS — Master Lab Design. This doc covers only the platform software that drives it.
Who uses this doc and how
Reader

Owns

Reads first

Joe

Product owner: approves contract
changes, runs the lab, merges pull
requests

Operator loop, milestones, open
decisions

Claude

Front end ( apps/web ) and the first draft
of every contract file

Contracts, front-end spec

Codex

Back end ( services/* ), lab adapters,
workers

Contracts, back-end spec, Codex
handoff brief

The one rule that keeps the two halves connected: the contracts in contracts/ are the
single source of truth. Neither side invents an endpoint, field, or event that isn't in them. A
change to a contract is a pull request Joe approves, and both sides regenerate their code
from it.

Benchmark: the best labs, and where we go beyond
Each of the world's leading labs is excellent at one slice. None combines IT operations,
networking, SOC, cloud, client communication, and interviews in one loop on
infrastructure you own. That combination is the platform.

Page 1 of 22

SALONE AEGIS — Platform Build Blueprint

Platform

What it does best

What we take

Where AEGIS goes
further

Hack The Box
Professional
Labs

Realistic corporate
networks to attack; a
browser attack box
(Pwnbox); ranges
refreshed with new
CVEs

Browser-only access;
content kept current
with real CVEs

You operate and
defend the network,
not only break in

HTB SOC Range
and LetsDefend

An alert queue
where you claim an
alert into your own
channel and triage it,
including false
positives

Queue, claim
ownership, true and
false positives

Alerts come from
real telemetry in
your own lab, not
canned logs

TryHackMe SOC
Sim

A live, dynamic
queue mixing true
and false positives;
reports reviewed by
managers

Mixed alert quality;
written reports

Reports reviewed by
the AI interviewer
with your real
evidence

Instruqt

Split-pane
instructions plus
terminal; setup,
check, solve, and
cleanup scripts per
challenge

The setup / check /
solve / cleanup
lifecycle for every
scenario

Faults hide inside a
living network, not a
fresh container

Cisco Modeling
Labs 2.9

Real Cisco images, a
full API, Docker
nodes, Git-backed
labs

API-driven topology;
real IOS for the
CCNP/CCIE backbone

Network faults
arrive as client
tickets with SLAs

SimSpace

Digital-twin ranges
defined as code,
automated user
activity, a canvas
plus YAML editor, an
attack engine

Range as code;
simulated users;
scenario YAML

One person's lab,
with tickets, clients,
and interviews on
top

Page 2 of 22

SALONE AEGIS — Platform Build Blueprint

Platform

What it does best

What we take

Where AEGIS goes
further

Immersive Labs
Crisis Sim

Branching crisis
storylines with
decisions for
technical and
executive roles

Decision points with
consequences during
incidents

Decisions act on real
systems, then you
defend them in a
debrief

Four things no benchmark does, and AEGIS will:
1. Clients you talk to. An AI client whose answers come from the real state of the broken
VM.
2. Automatic debrief. Clicking Resolved starts a verification, then an interview about
your exact fix.
3. One cockpit. Consoles, tickets, chat, topology, packets, and scores on one screen.
4. Evidence by default. Every action, check, and answer is recorded, scored, and
replayable.

The operator loop
Every piece of work follows one loop, the same way a real IT or security job does. The
platform enforces the order, so a ticket can't close until the fix is proven, explained, and
defended.

operator loop · 7 steps, 1 check gate, 2 loops

Page 3 of 22

SALONE AEGIS — Platform Build Blueprint

A failed check sends the ticket back to investigation. Weak answers in the debrief
schedule new tickets that target those skills, so the loop keeps aiming at what you don't
know yet.

System architecture
The cockpit talks only to the API. Services talk to each other only through the event bus,
and only the adapters touch the lab. Those three boundaries let two builders work in
parallel and let the platform run with no lab attached.

platform architecture · cockpit, API, 4 services, adapters, lab

Colour marks the owner. Every arrow into the cockpit is defined in contracts/ , which is
why the front end and back end connect on the first try.

Page 4 of 22

SALONE AEGIS — Platform Build Blueprint

Who builds what
One repository ( aegis-platform ), split by folder. Each builder works only in its own
folders and never edits the other side's code. Both read contracts/ .
aegis-platform/
├── contracts/
# SHARED: drafted by Claude, changed only by
approved PR
│
├── openapi.yaml
# REST API (Contract 2)
│
├── events.schema.json # WebSocket events (Contract 3)
│
├── scenario.schema.json# Scenario pack format (Contract 4)
│
└── examples/
# One example payload per endpoint and event
├── apps/
│
└── web/
# CLAUDE: Next.js cockpit
├── services/
│
├── api/
# CODEX: FastAPI gateway, auth, REST, WebSocket
│
├── orchestrator/
# CODEX: scenario engine, fault injection, checks
│
├── adapters/
# CODEX: Proxmox, OPNsense, AD, Wazuh, AWS,
CML/Containerlab
│
├── telemetry/
# CODEX: flows, health, topology discovery
│
├── ai/
# CODEX: client simulator, interviewer,
guardrails
│
└── evidence/
# CODEX: evidence store, scoring, replay
├── scenarios/
# SHARED CONTENT: scenario packs (YAML + check
scripts)
├── infra/
# CODEX: docker-compose, Ansible, Terraform for
the platform
└── docs/
# ADRs, runbooks

Area

Owner

Hand-off point

Contracts (first
draft)

Claude

Joe approves; Codex reviews for
feasibility

Cockpit UI, state,
real-time client

Claude

Generated TypeScript client from

Mock back end for UI
work

Claude

API gateway, auth,
WebSocket hub

Codex

openapi.yaml

Mocks generated from
contracts/examples/

Implements openapi.yaml and
events.schema.json exactly

Page 5 of 22

SALONE AEGIS — Platform Build Blueprint

Area

Owner

Hand-off point

Lab adapters and
scenario engine

Codex

Emits the contract events

AI services

Codex (prompts co-written
with Claude)

Read-only lab tools, defined in the
back-end spec

Scenario packs

Both

Validated in CI against
scenario.schema.json

CI contract tests

Codex runs them, Claude
keeps the examples current

A pull request fails if code and
contract disagree

Contract 1: domain model
These are the nouns both sides share. Every ID is a UUID, every timestamp is UTC ISO
8601, and every record carries client_id so the platform is multi-tenant from day one.
Entity

Key fields

Notes

Client

id, name, sector, sla_tier, status

A tenant: bank, clinic, school,
small business, startup, home
user, factory

Site

id, client_id, name, cidr

HQ, branch, AWS, recovery

Node

id, client_id, site_id, kind, name,
mgmt_ip, platform_ref, health

kind: vm, router, switch, firewall,
cloud_resource, container

Link

id, a_node_id, b_node_id, kind,
state

Configured link; observed
traffic is a Flow

Flow

edge_id, src, dst, port, proto,
bytes_per_s, verdict, observed_at

verdict: allowed, denied; denied
comes from firewall logs

Notification

id, client_id, kind, severity, title,
body, source, ticket_id

source: scenario, cisa_kev,
patch_tuesday, monitor, client

Ticket

id, client_id, number, title, priority,
status, sla_due_at,
reporter_persona_id,
scenario_run_id

Platform-native ticketing

Page 6 of 22

SALONE AEGIS — Platform Build Blueprint

Entity

Key fields

Notes

ChatMessage

id, ticket_id, author, channel, body,
created_at

author: operator, client, system;
channel: chat, email, voice

Persona

id, client_id, name, role, traits,
verify_identity_answers

Who the client is and how they
talk

ScenarioDefinition

id, version, title, tags, difficulty,
faults, checks, debrief

Loaded from scenarios/

ScenarioRun

id, scenario_id, client_id, state,
injected_at, resolved_at,
hints_used

The live instance of a scenario

CheckResult

id, scenario_run_id, check_id,
passed, output, ran_at

Proof the fix is real

Debrief

id, ticket_id, persona, state,
questions, overall_score

The automatic interview

EvidenceRecord

id, ticket_id, kind, payload,
created_at

Commands run, checks,
answers, timings; append-only

SkillScore

skill, level, evidence_ids,
updated_at

Skill tree mapped to
CCNA/CCNP/CCIE, Security+,
AWS

Ticket states (one direction, no skipping): new → acknowledged → investigating →
pending_verification → verified (or back to investigating if a check fails) →
client_explanation → debrief → closed . A debrief can be deferred, which parks the

ticket in debrief until it runs.

Contract 2: REST API
All endpoints live under /api/v1 , take and return JSON, and require a Keycloak access
token. Lists are paginated with cursor and limit . Errors use one shape: {"error":
{"code", "message", "details"}} . Every write that triggers lab work returns 202
Accepted with a job ID; the result arrives as an event.

Page 7 of 22

SALONE AEGIS — Platform Build Blueprint

Method and path

Purpose

Milestone

GET /me

Current operator, roles,
preferences

M0

GET /clients · GET /clients/{id}

Tenants with sector, SLA tier,
health summary

M0

GET /topology?client_id=

Sites, nodes, links, current health
in one payload

M1

GET /nodes/{id}

Node detail: specs, IPs, open
tickets, recent alerts

M1

POST /nodes/{id}/actions

start , stop , reboot , snapshot ,

M2

revert (202)
POST /nodes/{id}/console-sessions

Returns a short-lived tunnel URL
and token for SSH, RDP, VNC, or
serial

M2

GET /notifications · POST

The notification feed

M1

GET /tickets · GET /tickets/{id}

Queue with filters (client, priority,
status, SLA breach)

M3

PATCH /tickets/{id}

Status, assignee, work notes

M3

POST /tickets/{id}/resolve

Runs the scenario's checks (202);
moves to verified or back to

M3

/notifications/{id}/ack

investigating
GET /tickets/{id}/chat · POST

Client conversation; the reply
streams as events

M4

Records the identity check you
performed

M4

Library and manual launch
(normally the scheduler launches)

M3

POST /scenario-runs/{id}/hint

Next rung of the hint ladder; costs
points

M3

POST /scenario-runs/{id}/abort

Aborts and restores the baseline

M3

/tickets/{id}/chat
POST /tickets/{id}/chat/verifyidentity
GET /scenarios · POST /scenarioruns

Page 8 of 22

SALONE AEGIS — Platform Build Blueprint

Method and path

Purpose

Milestone

GET /tickets/{id}/debrief · POST

The interview; questions stream as
events

M5

POST /debriefs/{id}/defer

Debrief later; it reopens at the
next session start

M5

GET /evidence?ticket_id= · GET

M5

/scorecards

Evidence trail and scorecards
(operator, control, skills)

GET /flows?edge_id=&since=

Recent flows for one map edge

M6

GET /replay/{ticket_id}

Timeline of every event for timetravel replay

M6

POST /lab/baseline/restore

Restore the golden baseline
(requires confirmation token)

M2

/debriefs/{id}/answers

The full schemas, including every request and response body, live in
contracts/openapi.yaml . This table is the index, not the spec.

Contract 3: real-time events
One WebSocket, GET /api/v1/events , carries everything live. The client authenticates
with its token, subscribes to topics, and resumes after a disconnect by sending the last
seq it saw; the server replays what it missed. The UI never polls.
Every event uses one envelope:
{
"seq": 18421,
"type": "ticket.status_changed",
"occurred_at": "2026-10-28T21:14:03Z",
"client_id": "7c1e...",
"subject": { "kind": "ticket", "id": "a91f..." },
"data": { "from": "pending_verification", "to": "verified" }
}

Page 9 of 22

SALONE AEGIS — Platform Build Blueprint

Event type

Fires when

Cockpit reaction

notification.created

A scenario, feed, or
monitor raises something

Toast, bell count, phone
push if P1

ticket.created ·

Any ticket change

Queue and workspace
update live

chat.message · chat.typing

The client persona replies
or is typing

Chat panel streams the
reply

scenario.state_changed

Injected, running,
resolved, aborted

Map highlights affected
nodes in exercise mode

check.result

Each verification check
finishes

Pass/fail list fills in live

node.health_changed

Health from Prometheus
or the hypervisor
changes

Node colour on the map

flow.batch

Every 2 seconds,
aggregated flows per
edge

Edge thickness and
colour; denied flows
dashed red

alert.fired

The SIEM raises an alert

Alert badge on the node;
SOC queue

debrief.started ·

The interview runs

Debrief overlay opens
and streams questions

A 202 job finishes

Spinner resolves; errors
shown in place

ticket.updated ·
ticket.status_changed

debrief.question ·
debrief.scored
job.completed · job.failed

The full schema per data payload lives in contracts/events.schema.json .

Contract 4: scenario pack format
Every ticket the lab can generate is one folder in scenarios/ : a scenario.yaml plus its
scripts. It follows the setup, check, solve, and cleanup lifecycle that Instruqt popularized,
extended with a client persona, a hint ladder, and a debrief. Scenarios are content, not

Page 10 of 22

SALONE AEGIS — Platform Build Blueprint

code, so new ones need no platform release.
id: net-gateway-wrong
version: 3
title: "PC has an IP but can't leave its subnet"
client: salone-mutual
tags: [ccna, interview, release-1]
difficulty: 2
# 1 single clear fault ... 9 sabotage
sla: { priority: P3, resolve_within: 4h }
notification:
channel: chat
persona: aminata-finance-clerk
opening: "Hi, my computer says connected but I can't open anything. Payroll
is due today."
setup:
- target: ws-fin-02

# inject the fault; must be reversible

run: scripts/inject.ps1
cleanup:

# sets a wrong default gateway

- target: ws-fin-02
run: scripts/restore.ps1
client_facts:

# what the persona can report; values read live from

the lab
- ask: [ipconfig, ip address, gateway]
tool: read.ipconfig
target: ws-fin-02
- ask: [did you change anything]
answer: "No... well, IT came by yesterday to fix my printer."
hints:

# each rung costs points

- "Can the PC reach other hosts on its own subnet?"
- "Compare its default gateway to the VLAN's gateway."
- "The gateway is set to 10.10.20.254; the VLAN's is 10.10.20.1."
checks:
- id: gw-correct

# all must pass to reach 'verified'

target: ws-fin-02
run: scripts/check_gateway.ps1
- id: reaches-salonepay
target: ws-fin-02
run: scripts/check_http.ps1 https://salonepay.corp.salonemutual.lab

Page 11 of 22

SALONE AEGIS — Platform Build Blueprint

debrief:
interviewer: senior-network-engineer
root_cause: "Static default gateway pointed at a non-existent address."
must_cover: [arp, default-gateway-role, dhcp-vs-static, how-you-isolatedit]
what_ifs:
- "Same symptom, but the gateway is correct. What next?"
- "How would you prevent this across 500 PCs?"
rubric: { root_cause: 30, safe_fix: 25, verification: 20, documentation:
15, client_explanation: 10 }

CI validates every pack against contracts/scenario.schema.json and runs its inject,
check, and cleanup scripts against a test copy of the lab before the pack can merge.

Front-end spec (Claude)
The cockpit is one Next.js app, keyboard-first, dark NOC theme by default with a light
theme. Everything happens in panels that dock, resize, and pop out, so the screen works
like a real operations desk, not a website.

cockpit default layout · 6 panes

Page 12 of 22

SALONE AEGIS — Platform Build Blueprint

This is the default layout; every pane can be moved, resized, or popped out, and layouts
save per role. The debrief opens over all of it as a full-screen overlay.
Stack
Need

Choice

Why

Framework

Next.js (App Router) + TypeScript

Joe's existing stack

Styling and
components

Tailwind + shadcn/ui

Fast, consistent, accessible

Panels

dockview

Dockable, resizable, saved
layouts per role

API client and
mocks

orval from openapi.yaml (typed
client + MSW mocks)

Front end never drifts from the
contract

Server state

TanStack Query, updated by
WebSocket events

Live data without polling

UI state

Zustand

Simple global state (layout,
selection)

Topology map

React Flow (xyflow)

Interactive nodes, animated
edges, minimap

Terminal and
consoles

xterm.js + guacamole-common-js

SSH, RDP, VNC, and serial
consoles in a panel

Config and log
viewer

Monaco editor

Read configs, diff before and
after a change

Charts

ECharts

Scorecards, SLA, and coverage
trends

Command palette

cmdk

Ctrl+K for every action

Tests

Vitest + Playwright

Unit and end-to-end, run
against mocks in CI

Screens

Page 13 of 22

SALONE AEGIS — Platform Build Blueprint

Screen

What it holds

Cockpit (home)

Live topology map, ticket queue, notification feed,
SLA clock, on-call state

Ticket workspace

Ticket and timeline, client chat, console or terminal,
runbook and hints, checks panel

Debrief overlay

Full-screen interview: question, your answer,
follow-ups, live score, then feedback

Topology explorer

All clients and sites; click a node for detail, click an
edge for flows and packets

SOC view

Alert queue (claim, triage, classify), linked to
tickets

Scenario library

Browse, filter by tag (CCNA, CCNP, interview),
launch manually, practice or exam mode

Skill tree

Skills mapped to CCNA/CCNP/CCIE, Security+,
AWS; proven vs studied

Evidence and scorecards

Operator, control, and skill scorecards; per-ticket
evidence trail

Replay

Timeline scrubber that rebuilds the map, alerts,
and chat at any moment

Settings

Clients, schedule and difficulty, notifications,
layouts

Behaviour rules
Every screen updates from events; nothing needs a refresh.
Every destructive action (stop, revert, restore baseline) asks for confirmation and
shows what it will affect.
The resolve button is disabled until work notes exist; the debrief opens automatically
on verified .
Every panel has an empty state, a loading state, and an error state that names the
failed call.
Accessible: full keyboard navigation, visible focus, and colour never the only signal.

Page 14 of 22

SALONE AEGIS — Platform Build Blueprint

Back-end spec (Codex)
Python 3.12 services with FastAPI, PostgreSQL as the system of record, and Redis
Streams as the event bus. Each service is small, owns its own tables, and talks to the
others only through the bus or internal APIs.
Services
Service

Responsibilities

Key technology

api

Public REST and WebSocket, auth
with Keycloak (OIDC), per-role
access, event fan-out with seq and
replay

FastAPI, Pydantic v2, uvicorn

orchestrator

Scenario scheduler, fault injection,
check runner, hint ladder, ticket
state machine, SLA clocks

FastAPI worker, a state machine
persisted in Postgres

adapters

One module per system, behind one
interface: Proxmox, OPNsense,
Active Directory, Wazuh, AWS, CML
or Containerlab, Guacamole

proxmoxer, ldap3, pywinrm, boto3,
netmiko, httpx

telemetry

Topology discovery from APIs,
health from Prometheus, flows from
Zeek and firewall logs via
OpenSearch, batched into

Vector, OpenSearch client,
Prometheus API

flow.batch
ai

Client persona chat, interviewer,
scoring, guardrails

LLM provider abstraction, tool
calling, prompt files in Git

evidence

Append-only evidence log,
scorecards, skill scores, replay
timelines

Postgres, hash-chained records

Data stores
PostgreSQL 16: clients, nodes, tickets, scenarios, runs, debriefs, evidence. Migrations
with Alembic.
Redis 7: event bus (Streams), job queue, short-lived console tokens, caches.
OpenSearch: logs and flows (already part of the lab's SOC).

Page 15 of 22

SALONE AEGIS — Platform Build Blueprint

Object storage (MinIO): session recordings, packet captures, exports.
Engineering rules
1. Every fault is reversible. No scenario merges without a cleanup script that CI has
proved restores the baseline.
2. Every lab action is a job. Long operations return 202, run in a worker, retry safely
(idempotency keys), and emit job.completed or job.failed .
3. Adapters are the only code that touches the lab. Each has a fake implementation so
the platform runs and tests with no lab attached.
4. The contract is law. Responses are validated against openapi.yaml in tests; events
against events.schema.json .
5. Observable by default. Structured JSON logs, OpenTelemetry traces, and a health
endpoint per service.
6. Secrets never in code. Lab credentials come from Vault at runtime, scoped per
adapter.

AI services: client simulator and interviewer
Both AI roles are grounded in real lab state and recorded evidence, so neither can drift
into fiction. Each has a fixed persona file, a short list of read-only tools, and hard limits.
Client simulator
Plays the persona from the scenario (role, urgency, technical level, quirks) and only
knows symptoms, never the root cause.
When you ask for something a user could do ("run ipconfig", "what does the screen
say?"), it calls an allowlisted read tool through the adapters and reports the real output
in the persona's words.
It can only run read tools on the scenario's own target nodes. It can never change the
lab.
Some personas are impostors ( verify_identity_answers set to fail). Sensitive
requests such as a password reset or MFA change must be preceded by verifyidentity ; skipping it is scored as a social-engineering failure.
At client_explanation , it judges your plain-language explanation: it asks again if you
use unexplained jargon, and confirms when the explanation is clear and correct.
Interviewer

Page 16 of 22

SALONE AEGIS — Platform Build Blueprint

Starts automatically on verified . Its input is the evidence record: commands run,
first hypothesis, hints used, timings, checks, and the scenario's debrief block.
Drills down from the ticket into protocol depth, then what-ifs, then prevention at scale.
It stops where your answers stop being correct, and that edge becomes the study list.
Rotates persona by ticket type: senior network engineer, SOC lead, hiring manager,
CISO, recruiter screen.
Scores each answer on accuracy (checked against the scenario's root cause and
evidence), depth, structure, numbers, honesty, and length, then assigns follow-up
scenarios for weak skills.
Guardrails for both
Prompts live in Git and are versioned like code.
Tool calls are logged to the evidence store; the lab-facing tools are read-only by
construction.
Text that comes from the lab (logs, ticket text, file contents) is treated as data, and the
prompt-injection test suite from the master design runs against both roles.
An evaluation set of recorded sessions is replayed on every prompt change, so a
prompt edit that makes the interviewer softer or the client inconsistent fails CI.

Securing the platform itself
The platform can start, stop, and change every machine in the lab, so it is a Tier 0 system:
compromising it compromises everything. It gets the same protection as a domain
controller.
Placement: runs in the management VLAN (10) only. The cockpit is reached through
WireGuard or the jump host, never exposed to the internet.
Identity: Keycloak login with MFA. Roles: operator (works tickets), admin (changes
clients, scenarios, baselines), viewer (read-only, used by recruiter mode's sanitized
replay).
Least privilege per adapter: each adapter has its own service account scoped to
exactly what it does. The Proxmox adapter cannot read AD, and the AI service has no
write access anywhere.
Console sessions: short-lived, single-use tokens (5 minutes to connect), brokered by
Guacamole; credentials never reach the browser.

Page 17 of 22

SALONE AEGIS — Platform Build Blueprint

Scenario safety: fault scripts run only against nodes tagged lab and never against the
platform's own hosts. Exam-mode sabotage is limited to its declared targets.
Audit: every API write and every adapter action is written to the evidence store with
who, what, when, and the result.
Supply chain: dependency pinning, Trivy and Dependabot in CI, signed container
images.
Recruiter mode: a separate static build that replays sanitized evidence. It has no
connection to the live platform at all.

Build milestones
Seven milestones, each ending in a gate Joe demonstrates himself before the next begins.
M0 needs no hardware, so it can start today; M1 onward needs the lab host.

Page 18 of 22

SALONE AEGIS — Platform Build Blueprint

build milestones · M0 to M6, each with an acceptance gate

After M6 come the larger expansions from the master design: more MSP clients, the
CCNP/CCIE backbone, real-world feeds (CISA KEV, Patch Tuesday), and voice calls. Each
arrives as new scenario packs and adapters, not a rebuild.

Working agreement: how the two halves stay connected
Two builders working in parallel will drift apart unless the process prevents it. These rules
make a broken connection fail in CI, not in front of Joe.
1. Contract first. M0 ends with openapi.yaml , events.schema.json ,
scenario.schema.json , and example payloads merged. No feature code before that.

Page 19 of 22

SALONE AEGIS — Platform Build Blueprint

2. Generate, don't hand-write. The front end's API client and mocks are generated from
openapi.yaml . The back end validates every response and event against the same

files in its tests.
3. Mocks unblock both sides. Claude builds every screen against mocks generated from
contracts/examples/ , so front-end work never waits for the back end. Codex's fake
adapters let the back end run with no lab.
4. Contract changes are their own pull request. Labelled contract-change , with a short
reason. Joe approves; the other builder reviews. Code that depends on it lands after.
5. Additive by default. New fields and endpoints are fine. Removing or renaming
anything needs a new version and a migration note.
6. One integration test suite. Playwright runs the real front end against the real back end
with fake adapters on every pull request to main . Red blocks the merge.
7. Small pull requests. One feature or one contract change each, with screenshots for UI
changes.
8. Joe is the merge gate. Nothing lands on main without his approval, and he runs the
demo for each milestone before it is called done.

Codex handoff brief
Before handing off, export this doc as Markdown into the repo at docs/blueprint.md , so
Codex reads the same spec. Then paste the brief below as Codex's task.
You are the back-end engineer for the AEGIS Operator Platform, a training
platform that runs a simulated multi-client enterprise lab. Read
docs/blueprint.md fully before writing code. The contracts in contracts/
are the single source of truth.
YOUR SCOPE: services/*, infra/, and back-end tests.
DO NOT EDIT: apps/web/ (the front end belongs to another engineer) or
contracts/ (propose changes in a separate PR labelled contract-change).
STACK: Python 3.12, FastAPI, Pydantic v2, PostgreSQL 16 with Alembic,
Redis 7 Streams for events and jobs, pytest. Docker Compose for local runs.
MILESTONE M0 (do this first, nothing else):
1. Scaffold services/api with health endpoint, Keycloak OIDC auth stub,
and the error shape from the blueprint.
2. Implement every M0 endpoint in contracts/openapi.yaml, returning data
from fake adapters.

Page 20 of 22

SALONE AEGIS — Platform Build Blueprint

3. Implement the WebSocket at /api/v1/events with the envelope from
contracts/events.schema.json, seq numbers, and resume-from-seq replay.
4. Write the adapter interface and a Fake adapter for every system listed
in the blueprint, so everything runs with no lab attached.
5. Add contract tests: every response validated against openapi.yaml,
every event against events.schema.json. CI fails on any mismatch.
6. docker compose up must start api, postgres, redis, and keycloak with
seed data for two clients: salone-mutual and kamara-logistics.
RULES: every lab action is an idempotent job returning 202; every fault
must be reversible; adapters are the only code that touches the lab;
no secrets in code; structured JSON logs. Small PRs, one feature each,
with tests. Stop and report when M0's acceptance test passes.

Each later milestone gets its own short brief in the same format, pointing at the
milestone's rows in the build plan.

Open decisions
M0 can start now; these must be settled before the milestone noted.
Lab hardware (before M1): CPU, RAM, and storage of the host. Decides how many
client tenants run at once.
Where the platform runs (before M1): on the lab host itself, or on a small separate
machine. A separate machine keeps the cockpit alive when the lab host is being broken
on purpose.
LLM provider and budget (before M4): which model API powers the client and
interviewer, and a monthly spending cap.
Network simulator (before the backbone work): Cisco Modeling Labs (real Cisco
images, paid licence) or Containerlab (free, lighter, multi-vendor). Both have APIs the
adapter can drive.
Ticketing (confirm): this blueprint makes ticketing native to the platform, replacing
GLPI or Zammad from the master design, so the cockpit owns the whole loop. Confirm
or keep an external ITSM.
Event bus (confirm before M1): Redis Streams is the simple default; NATS JetStream if
the event volume outgrows it.

Page 21 of 22

SALONE AEGIS — Platform Build Blueprint

Sources
Benchmark research, October 2026.
Hack The Box: Professional Labs
Hack The Box: SOC Range on HTB Enterprise
HackerDNA: LetsDefend guide (2026)
TryHackMe: SOC Sim help article
Instruqt: challenge lifecycle scripts
Cisco: what's new in Cisco Modeling Labs 2.9
SimSpace: platform capabilities
Immersive Labs: cyber exercising from techs to execs

Page 22 of 22

