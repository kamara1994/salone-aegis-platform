# Contract handoff — approval required before integration

The extracted blueprint describes the endpoint table as an index, not the schema. The
integrated project includes Claude's OpenAPI, event, scenario, and example files under
`contracts/`, and the backend/frontend are wired to those shared definitions. The
response fixtures are currently stored as direct example bodies; the CI checker still
expects the documented `{method,path,status,body}` wrappers under
`contracts/examples/responses/` and will remain red until those fixtures are promoted.

## Decisions to reconcile

- IDs are UUID strings. Scenario definitions use UUID `id` plus a human-readable `slug`.
  The PDF example's `id: net-gateway-wrong` conflicts with its “every ID is a UUID” rule.
- Lists use `{items: [...], next_cursor: string|null}`. Cursor encodes the last UUID;
  list order is stable by ID, not chronological. Clients may sort displayed messages by timestamp.
- Async responses use `{job_id, state}` with HTTP 202. All async writes require
  `Idempotency-Key`. Keys are scoped to operator and tenant; reuse with a changed payload is 409.
- Errors are `{error: {code, message, details}}`. Validation details omit input values.
- WebSocket first message: `{token, after_seq, topics, client_ids}`. Empty topics means all;
  topics may be complete event names or family names such as `ticket`. Tokens are never URL parameters.
  The server sends only event envelopes; optional incoming `ping` is ignored. Reconnect on expiry
  with a refreshed token and the last received sequence. Replay is durable and untrimmed.
- Path parameters are named `identifier` in generated backend OpenAPI. These must be
  reconciled to `{id}` in the approved contract before frontend generation; URL behavior is equivalent.
- Identity endpoint spelling is `/tickets/{id}/chat/verify-identity` pending approval.
- Automatic debrief preparation occurs on `verified`; answering starts only after a
  successful `client_explanation`. This preserves the ordered ticket state machine while
  honoring the blueprint's “starts automatically on verified” statement.
- Console creation returns a single-use five-minute AEGIS grant. Redeem it using the
  added POST `/console-sessions/connect` with `{token}` and the same OIDC identity.
  Redemption returns a scoped Guacamole session token, tunnel URL, data source and connection ID.
  Guacamole credentials and the encrypted assertion never reach the browser.
- Fake console requests return an explicit 503, since the fake lab has no terminal host.
- Read-only viewers cannot retrieve raw evidence/replay; disconnected sanitized exports
  are the intended recruiter delivery. A viewer still has tenant-scoped read API access.
- Additional proposals: GET `/jobs/{id}`, POST `/lab/baseline/confirmation` and
  POST `/console-sessions/connect`. These must appear in the approved contract or be removed
  before the exact route-match gate can pass.
- Voice/email are stored channel labels; actual telephony, email delivery and external
  notifications are outside the attached backend endpoint index and not integrated.

## Example layout expected by the contract checker

`contracts/examples/responses/*.json`:

```json
{"method":"GET","path":"/api/v1/me","status":200,"body":{"id":"...","roles":["operator"],"client_ids":["..."],"preferences":{}}}
```

Replace illustrative IDs with valid UUIDs. Every endpoint must have at least one example.
`contracts/examples/events/*.json` contains complete event envelopes. Scenario packs
are validated against the approved scenario schema. The checker uses document-local
JSON Schema references and Draft 2020-12; OpenAPI 3.0-specific nullable semantics need
an explicit conversion if the approved document uses them.

Actual HTTP responses and persisted events from the integration test suite are validated
when `VALIDATE_CONTRACTS=1`. Coverage must be expanded to every branch and every new event
as the approved contract evolves; example validation alone is not a sufficient acceptance gate.

## Recheck additions

Client responses now include `health_summary` with total node count and health-state counts.
Node detail includes `specs`, `ips`, `open_tickets`, and `recent_alerts`; unknown specs are
empty. These fields implement the blueprint's read intent but still require shared-schema
approval. A submission-only live action now has job state `needs_reconciliation` and an
explicit `completion_unconfirmed` failure instead of an inaccurate `job.completed`.
