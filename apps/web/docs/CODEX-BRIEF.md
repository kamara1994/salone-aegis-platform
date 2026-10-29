# Codex brief: back end for the SALONE AEGIS lab designer

Repo: `kamara1994/salone-aegis-platform`. The front end (`apps/web`) is built by Claude; this brief covers the
back-end work for Codex. Work in `services/`, `infra/`, `contracts/`, `tests/` and `compose.yaml`. **Do not edit
`apps/web/`** except where a task below says to add asset files. Every new or changed endpoint goes into
`contracts/openapi.yaml` first, so the front end can build against it.

Decision already made (Option 1): real devices. PCs and servers are real VMs on Proxmox; routers and switches are
containerlab nodes (FRRouting, VyOS, Arista cEOS; Cisco CML optional later); the firewall is OPNsense. The browser
only shows consoles through Guacamole. Never simulate a live device in live mode: when something is unavailable,
return an error with a clear reason.

What already exists and must be reused, not rewritten:
- Adapters in `services/adapters/`: `ProxmoxAdapter`, `ContainerlabAdapter` (Docker API proxy, allowlisted
  containers), `CMLAdapter`, `GuacamoleAdapter` + `ConsoleBroker` (single-use console tokens), `opnsense`,
  `active_directory`, `registry.py`, `guard()`.
- `POST /nodes/{id}/console-sessions` returns `{ id, protocol, tunnel_url, token, expires_at }` and the front end
  already opens it with Guacamole (`apps/web/src/components/console/ConsoleView.tsx`).
- `services/ai/provider.py`: OpenAI-compatible chat completions, JSON output, key read from a secret file
  (`LLM_MODE=openai-compatible`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY_FILE`). Works with OpenAI, a local
  model server (Ollama/vLLM) or any OpenAI-compatible gateway.
- Jobs (`Job` schema, `kind`, `status`) and the event stream the front end listens to.

The front end's design document type is `LabDoc` in `apps/web/src/lab/types.ts` (devices with model key,
interfaces, VLANs, routes, firewall rules, OSPF/HSRP/NAT/DHCP settings; cables with both ends, type, length,
link conditioning). Treat it as the payload format.

---

## Task 1: save designs on the server

Today designs and layouts live only in the browser (localStorage).

- `GET /lab/designs` (list: id, name, updated_at, owner), `POST /lab/designs` (body: `{ name, doc: LabDoc }`),
  `GET /lab/designs/{id}`, `PUT /lab/designs/{id}` (with `If-Match` version to prevent lost updates, 409 on
  conflict), `DELETE /lab/designs/{id}`.
- Store in Postgres (Alembic migration in `infra/alembic`). Validate size (max 2 MB) and `doc.version === 1`.
- Per-user ownership through the existing auth (`services/api/auth.py`).
- Tests: create, update with stale version → 409, other user cannot read.

## Task 2: Deploy a design to the real lab

The core of Option 1: the canvas becomes real VMs and real links.

- `POST /lab/designs/{id}/plan` → returns a **plan without changing anything**: for each design device, what
  will be created (Proxmox VM from template X with N vCPU / M GB RAM / disk, or containerlab node of image Y),
  each link (Linux bridge / containerlab veth / VLAN), and the total CPU/RAM/disk against the host's free
  capacity. Refuse with reasons when something does not fit or a model has no mapping.
- `POST /lab/designs/{id}/deploy` → `202 Job` (`kind: lab.deploy`). Steps, each reported as job progress events:
  1. Network: create one Proxmox Linux bridge (or OVS VLAN) per cable/broadcast domain; containerlab links as
     veth pairs; VLAN trunks as tagged interfaces.
  2. Routers/switches: generate a containerlab topology YAML from the design (`nodes`, `links`, `kind`,
     `image`, `startup-config` rendered from the design's interfaces/VLANs/routes/OSPF/HSRP/NAT) and deploy it.
  3. VMs: clone Proxmox templates (Windows 11, Windows Server 2022, Ubuntu 24.04, Kali), set NICs onto the
     right bridges, set static IPs or DHCP via cloud-init / unattend where possible, start them.
  4. Firewall: OPNsense VM with interfaces mapped, rules pushed through the existing OPNsense adapter.
  5. Register every created node in the inventory with `platform_ref` (Proxmox `host/vmid`, containerlab
     container id added to the allowlist, CML `lab/node`) and its console protocols (`rdp`/`vnc` for VMs,
     `ssh`/`serial` for network nodes), so `/topology` returns them and `console-sessions` works for each one.
- `POST /lab/deployments/{id}/destroy` (confirm required) tears everything down; `GET /lab/deployments/{id}`
  shows status and the device-to-node mapping.
- Model mapping file `services/orchestrator/lab_models.yaml`: front-end catalog key → backend target, e.g.
  `isr4331 → containerlab frr` (or `cml iosv` when CML is configured), `c2960x24 → containerlab ceos` or
  `vyos`, `dec2750 → proxmox template opnsense`, `optiplex → proxmox template win11`, `r650 → proxmox template
  winserver2022|ubuntu2404` (choose by device `os`), `proxmox-vm → proxmox template ubuntu2404`.
  Catalog keys are in `apps/web/src/lab/catalog.ts`.
- Safety: deploy only into a dedicated Proxmox pool and containerlab lab name prefix (`aegis-`); never touch
  anything outside it; idempotent re-deploy (diff and apply changes); concurrency lock per design.
- Tests: plan for the sample design, YAML generation snapshot, refusal when RAM is insufficient, fake-adapter
  deploy end to end (`services/adapters/fake.py`).

## Task 3: richer live topology

`GET /topology` has no ports, MACs or routes, so in live mode the designer has to infer ports.

- Add optional fields to the `Node` schema: `interfaces[]` (`name, type, mac, ip, prefix, vlan, mode,
  allowed_vlans, native_vlan, speed, duplex, shutdown, oper_status`), `routes[]`, `vlans{}`; and to `Link`:
  `a_port`, `b_port`.
- Fill them from the adapters: containerlab/FRR (`vtysh -c 'show interface json'`, `show ip route json`),
  Proxmox guest agent (`network-get-interfaces`), OPNsense API (interfaces, routes, rules).
- `GET /nodes/{id}/config` → running config text for network nodes (used for drift compare against the design).

## Task 4: AI for the Learn page

The front end will have a separate Learn page (not part of the lab designer). The AI writes all questions;
nothing is hard-coded. The key never reaches the browser.

- `POST /learn/questions` body `{ track: 'ccna'|'ccnp'|'security-plus'|'aws-security'|'interview-network'|
  'interview-soc'|'interview-helpdesk'|'interview-cloud', topic?, difficulty: 1-5, count: 1-20, mode: 'quiz'|
  'exam'|'flashcard', use_lab?: { design_id } }` → `{ questions: [{ id, type: 'single'|'multi'|'order'|'free',
  prompt, options?, answer_key (kept server side, not returned until answered), topic, objective }] }`.
- `POST /learn/answers` `{ question_id, answer }` → `{ correct, score, explanation, references_to_objectives }`.
- Interview mode: `POST /learn/interviews` `{ role, level }` → session; `POST /learn/interviews/{id}/turns`
  `{ answer }` → `{ feedback: { strengths[], missing[], score }, next_question }`; `GET` returns the transcript.
- `GET /learn/progress` → per track/objective accuracy and weak areas, built from stored answers.
- Use `Provider.complete` with new prompt files in `services/ai/prompts/` (`learn_questions.txt`,
  `learn_grade.txt`, `interviewer_tech.txt`). Rules in the prompts: original questions mapped to the official
  exam objectives; **never reproduce real exam questions or brain-dump content**; JSON output only.
- Validate model output against a JSON schema; retry once; otherwise 502 with a clear error. Rate limit per user.
  When `LLM_MODE` is not `openai-compatible`, return `503 provider_unavailable` (the UI shows "AI not connected").
- `use_lab`: include a compact summary of the user's design (VLANs, subnets, devices) in the context so
  questions can be about their own network.

## Task 5 (assets, the only `apps/web` change): real device photos for the hover card

- For each catalog model in `apps/web/src/lab/catalog.ts`, find a photo of that exact model (front view
  preferred) on **Wikimedia Commons** under a license that allows reuse (CC BY, CC BY-SA, CC0, public domain).
- Save as WebP, max 800 px wide, to `apps/web/public/lab/photos/<catalog-key>.webp`.
- Append to `apps/web/public/lab/ATTRIBUTION.md`: file, title, author, license, source URL, changes made.
- No photos from vendor sites, shops or image search results; no AI-generated images in this folder. Skip a
  model if no licensed photo exists and list it as missing.
- Do not change any `.ts`/`.tsx` file; the front end wires the photos in.

---

## Definition of done (every task)

- Contract updated first; `pytest` passes, including new tests; `ruff`/type checks as the repo already uses.
- No secrets in code or logs; credentials only through the existing vault/secret files.
- Destructive operations need `confirm: true` and are scoped to the `aegis-` pool/prefix.
- Short notes in `README.md` for configuration (env vars, Proxmox templates to prepare, containerlab images).
- Commit per task with a clear message.
