# Scenario packs (Contract 4)

One folder per scenario. `scenario.yaml` describes the ticket, the client, the hints, the checks and the
debrief; `scripts/` holds what the scenario runner executes on the real lab VMs.

```
scenarios/net-gateway-wrong/
  scenario.yaml
  scripts/
    inject.ps1          setup: introduce one reversible fault
    restore.ps1         cleanup: put the baseline back (always safe to run twice)
    solve.ps1           optional reference fix, used by content tests only
    check_gateway.ps1   one file per check id
    check_http.ps1
```

`npm run scenarios` (in `apps/web`) validates every pack against `contracts/scenario.schema.json`,
checks that the folder name matches the id, that the debrief rubric sums to 100 and that every referenced
script exists, then bundles the packs for the cockpit.

## Script contract

The runner picks the transport from the extension and the `target` node:

| Extension | Runs on | Transport |
|---|---|---|
| `.ps1` | Windows nodes | WinRM (PowerShell remoting) |
| `.sh` | Linux, OPNsense (FreeBSD `sh`) | SSH |
| `.ios` | Cisco IOS / IOSv | SSH, sent line by line |

**Setup, cleanup and solve scripts** exit 0 on success. Anything they print is stored with the run.
Cleanup must be idempotent: it runs on abort, on Restore baseline and before every new run of the pack.

**Check scripts** (`.ps1`, `.sh`) print exactly one JSON line and set the exit code:

```json
{"passed": true, "output": "Default gateway 10.10.20.1"}
```

| Exit code | Meaning |
|---|---|
| 0 | passed |
| 1 | failed: `output` is shown to the operator as the reason |
| 2 | the check itself errored (counts as failed, flagged for the content author) |

**`.ios` checks** are command lists. The runner sends every non-comment line, joins the output, and
applies each `! expect: <regex>` (must match) and `! expect-not: <regex>` (must not match).
`! runner: wait <seconds>` pauses between commands, for example to let error counters move.

## Environment the runner provides

| Variable | Used for |
|---|---|
| `AEGIS_RUN_ID`, `AEGIS_TICKET_ID` | Correlating with the platform |
| `AEGIS_RUN_STARTED_AT` | ISO time the fault was injected (look only at events after it) |
| `AEGIS_API`, `AEGIS_RUN_TOKEN` | Read-only access to `GET /scenario-runs/{id}` for checks that depend on platform actions (SOC verdict, identity verification) |
| `AEGIS_OPN_KEY`, `AEGIS_OPN_SECRET` | OPNsense API, from the vault |
| `AEGIS_IDP`, `AEGIS_IDP_TOKEN` | Lab identity provider (MFA devices) |
| `AEGIS_SECRET_*` | Lab-only passwords, from the vault, never in this repo |
| `AEGIS_FW_DENY_HITS` | Count of logged firewall denies for the checked flow in the last 2 minutes (the runner queries the firewall log) |

Nothing in a pack may touch a real organisation, a real person or the internet. Every name, address and
credential is synthetic and lives inside the lab ranges (10.10/16 HQ, 10.20/16 Bo, 10.30/16 AWS, 10.50/16 Kamara, 10.99/16 range).

## Adding a pack

1. Copy the closest existing folder, change `id` to match the new folder name.
2. Write `inject` and `restore` first and run them twice in a row on a lab snapshot.
3. One check per thing a reviewer would look at; the label is what the operator reads.
4. Hints go from a nudge to the answer in three rungs.
5. `debrief.must_cover` lists what a strong candidate mentions; the rubric sums to 100.
6. Add the mock behaviour in `apps/web/src/mock/scenarios.ts` so the pack also works in the simulated lab,
   then run `npm test` (every pack must break at least one check when injected and pass all after cleanup).
