# Contracts

The front end and back end are built by different people (and different AIs). These files are the
agreement between them. Change a contract first, in its own pull request, then both sides follow.

| File | What it fixes |
|---|---|
| `openapi.yaml` | Every REST endpoint under `/api/v1`, request and response bodies, error shape, idempotency |
| `events.schema.json` | The WebSocket envelope `{seq, type, occurred_at, client_id, subject, data}` and the payload for each event type |
| `scenario.schema.json` | The scenario pack format: fault lifecycle, persona, client facts, hint ladder, checks, debrief rubric |
| `examples/` | One real payload per endpoint and event type, generated from the simulated lab |

## Rules both sides follow

- **Long work returns a Job.** `POST /nodes/{id}/actions`, `/tickets/{id}/resolve`, `/scenario-runs`,
  `/lab/baseline/restore` answer `202` with a `Job`; completion arrives as a `job.completed` / `job.failed` event.
  These calls carry an `Idempotency-Key` header; the back end must treat a repeat key as the same request.
- **The ticket state machine is enforced server-side.**
  `new → acknowledged → investigating → pending_verification → verified → client_explanation → debrief → closed`.
  A failed check sends the ticket back to `investigating`. The front end only asks; the server decides.
- **The debrief starts itself.** When the client accepts the explanation, the server moves the ticket to
  `debrief` and emits `debrief.started`; the cockpit opens the interview on that event.
- **Events are resumable.** Every event has a strictly increasing `seq`. On reconnect the client sends
  `{"op":"subscribe","topics":["*"],"resume_from_seq":N}` and the server replays everything after N.
  Browsers cannot set WebSocket headers, so the access token arrives as `?access_token=`.
- **Errors** use the `Error` schema: `{ code, message, details? }` with the right HTTP status
  (409 for state conflicts such as `node_busy`, `already_running`, `exam_mode`).

## Additions beyond the blueprint table

The blueprint listed the core endpoints. Building the cockpit needed these as well; they are in `openapi.yaml`:

- SOC: `GET /alerts`, `POST /alerts/{id}/claim`, `PATCH /alerts/{id}` (classify with verdict and rationale)
- Readiness: `GET /skills` (skill tree with evidence links), `GET /controls` (control scorecard)
- Operator: `GET /settings`, `PUT /settings` (scheduler, on-call, quiet hours, notification preferences)
- Scenario runs expose `alert_id`, `alert_verdict` and `identity_checks` so check scripts can read
  what the operator did in the platform (SOC verdicts, identity verification).

## Regenerating

```bash
cd apps/web
npm run gen:api               # openapi.yaml -> src/api/schema.d.ts
npm run contracts:examples    # simulated lab -> contracts/examples/
```
