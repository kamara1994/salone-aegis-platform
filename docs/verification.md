# Verification record

Build date: 2026-10-28.

Executed in the supplied Python 3.12 workspace:

- Core behavior and security unit tests, using SQLite and persistent fake adapters.
- Python syntax compilation for services, scripts and tests.
- Scenario YAML loading, local path safety and lifecycle configuration validation.
- Static route inventory and Compose YAML parsing.
- Shared schemas and scenario packs are present. Route compatibility covers the
  frontend's scenario-run, alert, skills, controls, and settings reads. The contract
  gate still reports that response fixtures need to be promoted into the documented
  `contracts/examples/responses/` wrapper format before CI can certify every response.

See `test-results.txt` for the exact final test count and skip report. Passing tests cover
launch, idempotency, reservations, failed checks, successful verification, explanation and
debrief closure, cleanup failures, abort, tenant/role isolation, confirmation expiry/reuse,
read-tool restrictions, identity safeguards, event replay, evidence tampering, flow provenance,
alert deduplication, SLA notification deduplication, sanitized export and Guacamole assertion
cryptography. These tests exercise core code, not running production services.

Not executed: FastAPI/httpx integration tests, PostgreSQL/Alembic migration, Redis Streams,
Redis console Lua consumption, Keycloak/OIDC integration, Docker Compose, container scanning,
image signing, live adapters, Windows PowerShell, Guacamole session exchange, OpenSearch,
Prometheus, MinIO and live LLM evaluation. Dependency downloads were blocked by the execution
environment; Docker, PostgreSQL and Redis executables were unavailable. HTTP/WebSocket tests
are explicitly skipped in this environment, not counted as passed. No backend was deployed.

The attached blueprint is retained as extracted text in `docs/blueprint.md`. Diagrams and
visual milestone gates are not preserved by text extraction; the original PDF remains
authoritative. Production acceptance is not certified until the Docker/Keycloak/Redis
integration environment and response fixtures are exercised.

Recheck result: 75 tests discovered; 64 passed; 11 HTTP/WebSocket tests explicitly skipped.
Eighteen focused audit regressions were added. The first 11 reproduced failures before
correction; all new tests now pass. See `AUDIT.md` for remaining implementation gaps.
