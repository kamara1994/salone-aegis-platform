# SALONE AEGIS — integrated platform

This repository contains the integrated SALONE AEGIS FastAPI backend and Next.js operator cockpit.
The backend lives in `services/`; the frontend lives in `apps/web/`; shared API and event contracts
live in `contracts/`. The frontend supports `mock` mode for local demos and `live` mode through the
same-origin Next proxy configured with `AEGIS_API_ORIGIN`.

## Start the frontend

```bash
cd apps/web
npm ci --no-audit --no-fund
cp .env.example .env.local
npm run dev
```

The default mock mode runs without external services at http://localhost:3000. For live mode, set
`NEXT_PUBLIC_API_MODE=live` and `AEGIS_API_ORIGIN` in `apps/web/.env.local`.

## Start the backend

Python 3.12, FastAPI, PostgreSQL 16, Alembic, Redis Streams, Keycloak, separate
orchestrator/AI/telemetry/outbox processes, fake and live lab integrations.

**Status: incomplete development implementation, not a production acceptance sign-off.**
See `AUDIT.md` for the recheck findings, fixes and explicit remaining requirements. The full
operator loop is exercised against a persistent fake lab. The shared contracts were
not supplied; nothing has been created or changed in `contracts/`. Do not connect a
frontend or enable destructive live lab operations until the gates below are satisfied.

## Start the backend

Requirements: Python 3.12, Docker with Compose, internet access to package/image registries.
From this directory:

```bash
python -m scripts.bootstrap
docker compose up --build -d
python -m scripts.smoke
```

Bootstrap generates random development credentials in `.env` and imports two tenants,
`salone-mutual` and `kamara-logistics`, into the local seed. The local Keycloak user is
`joe`; the password is `DEMO_OPERATOR_PASSWORD` in `.env`. Never commit these files.
Bootstrap refuses to overwrite existing credentials. Keycloak and API bind only to
loopback. API: http://localhost:8000; generated development API docs: http://localhost:8000/docs;
Keycloak: http://localhost:8080.

`python -m scripts.smoke` authenticates against real Keycloak and verifies a scenario
job completes through the background worker. It does not print the access token.
The supplied Compose configuration is for development, uses Keycloak `start-dev`,
and does not configure MFA or TLS. See `docs/operations.md` before any live deployment.

## Test locally

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
ruff check services scripts tests
python -m scripts.contract_gate
VALIDATE_CONTRACTS=1 pytest tests/test_api.py -q
```

The contract gate deliberately fails until approved contract files and examples are
installed. This is a missing integration input, not a passing test. See `docs/contracts.md`.
`docs/verification.md` records which checks were actually executable during this build.

For an offline core demo, the only third-party requirements are PyYAML and cryptography:

```bash
python -m unittest discover -s tests -v
```

The HTTP/WebSocket suite reports explicit skips when FastAPI/httpx are unavailable.
Do not count skipped tests as passing.

## What is implemented

- All REST operations listed in the blueprint, plus job inspection, baseline confirmation,
  and one-use console-grant redemption as documented additive proposals.
- Keycloak RS256 verification (issuer, audience, expiry), role checks, tenant-scoped reads
  and writes, structured errors, rate limiting with Redis, health endpoints and request logs.
- Durable ordered events, tenant/topic filtering, reconnect replay, transactional outbox to
  Redis Streams. Access tokens go in the first WebSocket message, not the URL.
- Ticket state machine, worker jobs, idempotency keys, target reservations, scenario
  setup/check/solve/cleanup, hint costs, SLA notifications, abort and baseline restore.
- AI client read tools restricted to scenario targets, identity checks, explanation gate,
  interview queue, deferred interviews, scoring, study skills and remediation scheduling.
- Hash-chained evidence, PostgreSQL/SQLite append-only guards, replay, allowlisted
  recruiter export, and private MinIO/S3 attachment upload support.
- Health/flow/alert collection, OpenSearch cursors, Prometheus integration, and all eight
  named systems behind the adapter interface. See the exact capability matrix below.
- Deployment configuration, migration, seed data, PowerShell scenario scripts,
  backend CI, contract checks, vulnerability scanning and an opt-in signed-image workflow.

## Demonstrate the full operator loop

Use the API docs or your API client with a Keycloak access token. For each asynchronous
write, supply a new `Idempotency-Key`; reuse the same key only to retry the same request.

1. List `/api/v1/clients` and `/api/v1/scenarios`.
2. Launch `/scenario-runs` with `client_id` and `scenario_id`. Wait for `job.completed`
   over `/events` or inspect the added `/jobs/{id}` route. A ticket and notification appear.
3. PATCH the ticket to `acknowledged`, then `investigating`.
4. POST `/tickets/{id}/resolve`. Both checks fail while the gateway is broken, returning
   the ticket to `investigating`.
5. In fake mode only, POST `/nodes/{workstation_id}/actions` with
   `{"action":"start","arguments":{"gateway":"10.10.20.1"}}` for Salone Mutual
   (use `10.20.20.1` for Kamara Logistics). This is a labelled simulation convenience,
   not a live arbitrary-configuration endpoint.
6. Resolve again. The ticket becomes `verified`; a debrief is prepared. PATCH to
   `client_explanation`, then send a plain-language chat explanation.
7. Once accepted, answer each debrief question through `/debriefs/{id}/answers`.
   The worker closes the ticket after the interview and records skill scores.
8. Inspect evidence and replay. Weak scores queue a new scenario, subject to target availability.

Fake identity verification uses `{"answers":{"employee_code":"LAB-204"}}`. This is
training content only. Production identity verification procedures must be authored per persona.

## Important boundaries

The default evaluator is deterministic and explicitly labelled as a demonstration.
It is not a validated AI assessor. A configurable OpenAI-compatible JSON provider is
implemented, with bounded output and a per-tenant daily call budget; selecting a model,
evaluating its behavior and agreeing a monetary budget remain deployment work.

No live system, LLM, Windows host, PostgreSQL server, Redis server, Keycloak instance,
MinIO instance, or Docker engine was available for integration execution during this build.
Configuration and tests for those boundaries are included; successful live behavior is
not asserted. Generic runner operations require administrator-authored manifests and
approved scripts appropriate to the actual lab. This is not a preconfigured lab image.

The implementation uses a modular shared-store design with SQL-backed jobs and event
replay. Redis receives the committed event stream; workers currently claim jobs from SQL.
This is a deliberate, documented deviation from fully isolated service-owned tables and
Redis-only job transport. See `docs/architecture.md`; do not label it exact blueprint compliance.

## Files

`services/api`: HTTP, OIDC, WebSocket, request validation.
`services/orchestrator`: jobs, state machine, scheduler, scenario validation.
`services/adapters`: fake systems, native integrations, scoped runner, console broker.
`services/telemetry`: collectors and normalized flow/alert ingestion.
`services/ai`: provider abstraction, client/interviewer services, versioned prompts.
`services/evidence`: hash chain, scores and private attachment storage.
`infra`: Dockerfile, Alembic migration, Keycloak and database configuration.
`tests`: core behavior, security, HTTP and WebSocket tests.
`docs`: blueprint text, architecture, contract decisions, operations and verification.
