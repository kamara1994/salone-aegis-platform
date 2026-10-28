# Operations and acceptance gates

## Local lifecycle

Start: `python -m scripts.bootstrap`, then `docker compose up --build -d`.
Check: `python -m scripts.smoke`; view process status with `docker compose ps`.
Logs: `docker compose logs --tail=100 api orchestrator ai telemetry outbox`.
Stop without destroying data: `docker compose down`.
Do not use `docker compose down -v` except for disposable development environments;
it deletes database, Redis and object-store volumes.

Database changes run through `alembic -c infra/alembic.ini upgrade head` in the migration
service. Seed is idempotent for tenant inventory. Scenario definitions update at startup;
live runs retain an immutable copy of the definition they started with.

For backups, use PostgreSQL's supported backup tools against the management network,
store encrypted backups outside the lab and verify restoration into a fresh instance.
Back up object storage and runner baselines too. Redis is not the system of record for
events/jobs, but outstanding console grants disappear if its data is lost. Do not run
an evidence-destroying down migration; the migration intentionally rejects it.

## Restore a tenant's baseline

An admin with membership in the tenant calls POST `/api/v1/lab/baseline/confirmation`
with `{client_id}` and reviews the affected tenant. POST `/api/v1/lab/baseline/restore`
with that tenant, the issued confirmation token and an idempotency key. Tokens are bound
to the actor, tenant and operation, expire after five minutes, and may be consumed once.
Restore cleans active scenario runs and invokes node revert. Snapshot availability is
adapter-specific; a missing live snapshot must fail, never guess a baseline.

Pending lab jobs must be drained or reconciled before baseline restore. A persisted
maintenance fence blocks new lab mutations and scheduled scenarios during restoration;
it remains active after a failed restore until a subsequent restore succeeds. After any failure, inspect all evidence and actual targets,
then run cleanup or recovery with a new reviewed operation. A failed restore can leave
some nodes restored and others not; it is not a transaction across physical systems.

## Interrupted jobs

Fake mode can retry stale running jobs. In live mode, stale jobs become
`needs_reconciliation`. After inspecting the target, a trusted deployment administrator
can use `python -m scripts.reconcile_job JOB_ID --actor OPERATOR_UUID --decision retry
--reason 'documented inspection result' --target-inspected`. The CLI assumes deployment
administrator access; it is not a public API or a substitute for OIDC authorization.
Some failed workflows may require explicitly restoring a ticket/run to a consistent state
through a reviewed migration; no unaudited automatic success is inferred.

## Live deployment prerequisites

1. Reconcile and approve the contracts. Run unit, HTTP, WebSocket and contract suites.
2. Run the Compose smoke test against actual PostgreSQL, Redis and Keycloak.
3. Configure management-only routing, WireGuard/jump-host access, TLS, Keycloak production
   mode and MFA. Disable direct-access password grants; use authorization-code/PKCE for
   the cockpit. Replace development bootstrap identities and verify role/tenant claims.
4. Split database users and Vault policies by service. Development Compose uses one
   database owner and shares process environment; it is not a hardened Tier 0 deployment.
5. Import verified lab inventory with `python -m scripts.inventory ... --actor ...`.
   Keep platform hosts untagged as lab and explicitly marked `platform_host=true`.
6. Provision read-only AI credentials, adapter-specific mutators, approved runner manifests,
   scenario script hashes, private object storage and Guacamole recording retention.
7. Demonstrate setup, failure, solve and cleanup on disposable real targets. Verify baseline
   restoration before allowing scenario scheduling. Test interrupted operations explicitly.
8. Validate native API task completion or use synchronous approved runner commands. Test
   console redemption, expiry, recording, credential non-disclosure and cross-tenant denial.
9. Select/evaluate the LLM provider and monetary budget; deterministic demo scoring does
   not demonstrate accurate live assessment. Establish prompt regression fixtures.
10. Review dependency/image scan results, pin transitive dependency locks and image digests,
    protect the release environment and branch rules, then build/sign an approved image.

The build supplies an opt-in signing workflow; nothing was published or deployed. No
Terraform cloud infrastructure is provisioned because deployment placement and host
inventory are open decisions in the source blueprint. Docker Compose is the supplied
local infrastructure. Ansible/Terraform for a selected actual host/cloud remain scoped
by that decision, not guessed from the PDF.

## Observability

API request logs and worker errors are JSON. Credentials, authorization headers, identity
answers and query strings are not logged by the application. Third-party dependencies
and container startup logs may use their own formats. OpenTelemetry FastAPI instrumentation
is enabled when `OTEL_EXPORTER_OTLP_ENDPOINT` is provided; cross-worker trace propagation
is not implemented. Health endpoints: API port 8000, workers port 9000 (internal only),
runner port 9100. Readiness verifies schema and Redis for the API, and recent work-loop
success for workers. An unavailable telemetry source becomes unknown health, not healthy.
