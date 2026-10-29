# Verification — 2026-10-28

- `python -m pytest -q`: **113 passed**; one dependency deprecation warning.
- `python -m ruff check services infra scripts tests`: **passed**.
- `git diff --check`: **passed**.
- PostgreSQL `alembic upgrade head --sql`: **passed**, including append-only evidence
  trigger generation. No new schema migration is needed for the typed record catalogue.
- Shared `scripts.contract_gate`: **failed** on existing `/api/v1` route drift.
  Missing routes: GET controls, GET scenario-runs/{id}, GET/PATCH alerts,
  POST alerts/{id}/claim, GET settings, GET skills. Extra legacy routes: GET jobs/{id},
  POST console-sessions/connect, POST lab/baseline/confirmation. The gate and approved
  contracts were not loosened or edited. This remains a release blocker.
- Docker PostgreSQL integration: **blocked**, `docker: command not found`.
  The isolated harness is supplied in infra/compose.lab-test.yaml; it has not run here.
- Live VM/device/Guacamole/noVNC integration: **not exercised against infrastructure**.
  The fail-closed broker adapter is tested with a stub, including tenant/target/host
  guards, operation allowlists, and filtering of credential-bearing responses.

Existing workflow fixtures now explicitly select net-gateway-wrong instead of the
first alphabetically sorted pack (which targets unseeded AD servers). UUID assertions
remain for UUID domain entities; scenario catalogue IDs are checked against the
approved slug-based packs. No existing workflow assertion was removed to bypass a
failure. Seed preserves required SLA priority, and fake solve uses the trusted cleanup
steps when an approved pack omits its optional solve phase.

Scope: services/, infra/, scripts/, tests/ only. apps/web/, contracts/, docs/,
and filesystem scenario packs were not changed. The additional API needs frontend
integration and shared-contract review before a unified application release.
