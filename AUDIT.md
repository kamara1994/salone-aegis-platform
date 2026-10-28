# Backend recheck — 2026-10-28

## Conclusion

The first package was **not a complete implementation of the blueprint**. It provided a
working, tested fake-lab core and code across the named backend areas, but several areas
were partial integrations or scaffolding. Merely having a module or endpoint does not
establish functional completion. This review found reproducible defects, corrected bounded
issues, and separates those fixes from requirements that are still unfinished.

The revised package remains a development implementation. Do not call it production-ready
or fully compliant with the blueprint.

## Defects corrected in this revision

| Finding | Consequence in the first package | Correction |
|---|---|---|
| Live task acceptance treated as completion | Proxmox/AWS/CML-style submission could emit `job.completed` before the action finished | Require explicit completion; ambiguous node actions become `needs_reconciliation` and emit failure, not successful completion. Native completion polling remains unfinished. |
| Operation IDs reused across nodes | A multi-node baseline restore could collide in a shared idempotent runner | Derive action IDs from job, node and action; IDs remain stable on retries. |
| Operation IDs reused across scenario runs | Different runs in one baseline restore could share a cleanup key | Include run ID, phase and step index. |
| Cleanup stopped on first failed target | Remaining targets could stay broken without a cleanup attempt | Continue across all cleanup targets, persist failures and fail the aggregate result. |
| Baseline restore stopped on first failure | Later runs/nodes could remain untouched | Attempt every eligible run and node; retain the maintenance fence and report incomplete restoration if any operation fails. |
| Empty identity factors accepted | Empty configured factors and empty submitted answers could verify successfully | Empty verification configuration now fails closed. |
| Non-ASCII identity answers/token crashed | Unicode strings passed directly to HMAC comparison could raise `TypeError` | Compare UTF-8 bytes; legitimate Unicode identity answers work and invalid Unicode dev tokens return 401. |
| Operator could manually exit pending verification | PATCH could move a ticket while the worker still owned the check gate | Worker exclusively controls transitions out of pending verification. |
| Resolve accepted for aborted runs | A pointless verification job was queued for a run that could no longer pass | Reject resolve before queueing unless the scenario is running. |
| Pack slug not bound to directory | Validating one pack could later resolve a different pack-relative live script | Restrict slug syntax and require it to match its folder. |
| Duplicate pack UUIDs silently overwritten | Startup could replace one scenario definition with another | Reject duplicate scenario IDs during load. |
| Client read tools not validated with pack | Invalid write-tool names/out-of-scope targets failed only at execution | Validate allowlisted read tools and declared targets before accepting the pack. |
| Lifecycle result could be an unconfirmed/no-op response | Setup/cleanup could proceed without a positive completion assertion | Require a fake state result, `applied: true`, or `completed: true`; checks still require an explicit boolean. |
| Client/node response details omitted | Client health summaries and node IP/spec/ticket/alert sections were absent | Added tenant-scoped projections. Unknown hardware specs remain empty rather than fabricated; inventory can now carry specs and IPs. |
| Production configuration allowed plaintext OIDC endpoints | A production deployment could retrieve signing keys over HTTP | Non-development OIDC issuer and JWKS URLs must use HTTPS. |

Additional validation: malformed OIDC role structures are rejected and unknown LLM modes
fail configuration validation. These are defensive code changes, not evidence of a live
Keycloak test.

## Requirements still incomplete

| Blueprint area | What exists | What remains |
|---|---|---|
| Shared contracts | Request models, contract-check scripts, route index | Approved OpenAPI/event/scenario schemas and examples were not supplied. Responses have no complete typed response-model layer. Tests do not cover every route/error/event branch. Generated integration compatibility is unproven. |
| Service architecture | Separate API, orchestrator, AI, telemetry and outbox processes | Shared record tables and direct module calls remain. Jobs are SQL-backed; Redis only receives the outbox. This does not satisfy isolated service-owned tables and bus/internal-API communication. |
| Concurrency/recovery | Durable jobs, idempotency, target reservations and maintenance fencing | External calls hold a global DB lock. Full leases/fencing, nonblocking external execution, worker concurrency, safe retry policy and comprehensive recovery tooling remain unfinished. |
| Live adapters | Native calls for selected operations, scoped runner, fake implementations | Complete platform-specific operations, native completion polling, inventory configuration and live reversible-fault verification. Some operations need custom administrator-authored runner commands. |
| General scenario content | One wrong-gateway pack and scripts, validator, fake lifecycle | Fake behavior is hardcoded to the gateway scenario. Arbitrary packs are not semantically simulated. No real-lab setup/check/cleanup acceptance runner is wired into CI. Loading new packs currently requires deployment/reseed; hot reload is absent. |
| Topology discovery | Seed/imported sites/nodes/links and health collection | Automatic discovery of topology and hardware/network details from lab APIs is absent. |
| Flow/log ingestion | Normalized ingestion, OpenSearch cursor and reads | Zeek/firewall parsers, Vector configuration, edge attribution and actual two-second flow aggregation are not implemented. Caller-supplied records must already be normalized. Wazuh `read.logs` currently queries agents, not alert/log records. |
| Client simulation | Keyword-selected read tools and provider wrapper | Persona-specific prompt/context behavior is incomplete. A generic prompt exists, but name/traits and conversation history are not fully incorporated. Sensitive-request classification is a keyword heuristic, not a complete policy. |
| Explanation gate | Demo heuristic and provider assessment | It does not reliably verify that the explanation matches the proven cause and recorded fix. The deterministic heuristic can accept an incorrect plain-language answer. |
| Interview and scoring | Fixed questions, demo evaluator, overall score and hint penalty | Weighted rubric application, scoring dimensions, adaptive questioning, skill-specific levels and validated model assessment remain unfinished. Current skills receive the same overall score. |
| Remediation scheduling | Requeues the original scenario after a weak overall score | Selecting new scenarios targeted at particular weak skills, progression policy and general scheduling controls are absent. |
| Evidence/replay | Append-only hash chain, check/chat/action evidence, replay JSON | Complete console command/session capture and a timeline containing every platform event are not implemented. Denied/failed API writes are not consistently recorded in the evidence ledger. |
| Object storage/recording | Private S3/MinIO upload helper and export utility | End-to-end recording/packet-capture collection, automatic upload, signed retrieval, retention and attachment lifecycle are not wired into the operator flow. |
| Aborted tickets | Scenario abort restores targets and marks the run aborted | The associated ticket remains open. The blueprint lacks a cancellation state; a coherent approved cancellation/archive policy is still needed. This revision rejects misleading resolve attempts. |
| Security deployment | OIDC verification, roles, tenant filtering, Vault interface and console grants | Production Keycloak/MFA/TLS, scoped database users, separate AI/mutator credentials, credential rotation and hardened deployment are not supplied by the dev Compose configuration. |
| Observability | JSON application logs, health endpoints, API tracing hook | End-to-end worker trace propagation, operational metrics and alerts are incomplete. |
| Infrastructure | Docker Compose, Alembic, Keycloak bootstrap and CI workflows | Ansible/Terraform for an actual host/cloud are not implemented. Placement/hardware are unresolved inputs in the blueprint. Supply chain uses direct pins but lacks a verified transitive lock and digest-pinned deployment. |
| Acceptance/testing | Core/security regressions and HTTP/WebSocket test code | Actual API/Keycloak/Postgres/Redis/Guacamole/LLM/lab integration execution, complete contract coverage, prompt session-regression fixtures and real-frontend integration testing remain outstanding. |

Future expansions explicitly placed after M6 in the blueprint—voice calling, CISA KEV,
Patch Tuesday feeds, more client packs and the larger network backbone—are not counted
as silently completed features. No frontend was requested or added.

## What was actually verified

The original suite was rerun together with 18 new focused regression tests. The first
11 regression cases reproduced failures in the original code (nine assertion failures
and two Unicode exceptions). They pass after correction. Additional tests cover fail-closed
completion reporting, full baseline attempts, new read projections and auth configuration.

Final result: **75 tests discovered; 64 passed; 11 HTTP/WebSocket tests skipped** because
FastAPI/httpx were unavailable in this workspace. Python compilation and YAML parsing
were also checked. No Docker or live service tests were executed. The contract gate remains
blocked by absent approved files. See `docs/test-results.txt` for the actual test output.

These checks are not proof that the remaining integrations work. The next acceptance work
should start with approved contracts and a runnable dependency/container environment,
then service/job architecture, live completion/recovery and scenario safety, followed by
telemetry, recording, AI evaluations and deployment hardening.
