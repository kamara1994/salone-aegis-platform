# Implementation architecture and deviations

The API is a FastAPI gateway. The orchestrator, AI, telemetry and outbox run in separate
processes; adapter, evidence and shared persistence code are importable modules. The
API only contacts live systems through adapters. SQL transactions atomically persist
records, jobs, evidence and replay envelopes. A committed event is copied to Redis
Streams by the outbox process with its SQL sequence as the Redis stream ID. Repeated
outbox delivery of an existing sequence is harmless; do not manually trim the stream
without a coordinated retention design.

Jobs are claimed from PostgreSQL, not Redis. A worker marks a job running in one transaction,
then records outcome and evidence in a second. Fake jobs interrupted for more than ten
minutes may retry. Interrupted live jobs become `needs_reconciliation`; never repeat an
ambiguous mutation automatically. The trusted administrative recovery CLI records a
reason before retry or failure. Use one orchestrator and one AI worker in this version.

A transaction-wide PostgreSQL advisory lock serializes commands and sequence allocation;
SQLite uses `BEGIN IMMEDIATE` for equivalent offline tests. This ensures deterministic
idempotency, reservations and hash ordering, at the cost of concurrency. Some external
adapter and model calls currently run while holding this lock. Slow systems therefore
block other requests. Before scaling or production hardening, move external execution
outside aggregate transactions with fenced leases and a command/result event protocol.

Storage is a typed record catalogue plus dedicated jobs/events/evidence tables. It is not
one normalized table per domain entity, nor strict table ownership per microservice.
Evidence is appended in the same transaction as domain mutations, rather than depending
on asynchronous evidence delivery. This favors atomicity in a one-person lab, but is a
material departure from the blueprint's independently owned service data and bus-only
inter-service boundary. Service separation must be completed if that boundary is mandatory.

The WebSocket hub reads ordered PostgreSQL replay pages, filtering tenants before sending.
It does not rely on ephemeral Redis Pub/Sub. The browser never polls for event updates;
the server checks for new persisted events while awaiting disconnect/ping frames. Outbox
publication is available to downstream consumers, but Redis-triggered gateway wakeup and
consumer groups are not yet the primary transport.

The API intentionally exposes no arbitrary shell endpoint, no user-supplied script path,
and no AI-generated write tools. A scenario is read from a trusted deployment directory;
its setup/check/solve/cleanup scripts must exist within its own folder. Live Windows
scripts additionally require exact approved hashes from Vault. A generic scoped runner
is supplied for platform-specific operations and may execute only fixed manifest argv
arrays; an administrator must supply the commands for their actual targets.

Evidence records have tenant-local SHA-256 chains. UPDATE/DELETE are rejected by triggers.
This detects changed/missing records inside an anchored chain; it does not resist an
administrator rewriting the whole database and its chain. Export chain heads to a
separately protected audit system for stronger tamper evidence. Current evidence and
event tables have no retention policy, and paginated queries load some collections into
memory. Add archival, indexed domain queries and bounded replay before large deployments.

The integrated repository includes the operator frontend under `apps/web/`. It runs in
mock mode for offline demonstrations and can target the FastAPI service through the
configured API base URL. This repository still does not create a cloud account, actual
lab topology, private network, VPN, or real VM image; those require the Master Lab
Design and deployment inventory. A sanitized offline replay JSON exporter is included.
