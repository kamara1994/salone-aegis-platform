# Live integration capability and configuration

All integrations are **unverified against live infrastructure in this build**. The fake
registry has deterministic implementations for Proxmox, OPNsense, Active Directory,
Wazuh, AWS, CML, Containerlab and Guacamole. Fake consoles intentionally return unavailable.
The single sample scenario simulates a wrong gateway; fake adapters do not execute arbitrary
scenario scripts. New scenario semantics need a corresponding fake implementation/test.

Set `ADAPTER_MODE=live` only after importing the real management inventory, provisioning
Vault, testing on disposable lab targets and validating cleanup. Seed platform references
are display names, not usable production infrastructure references.

| System | Native code provided | Scoped runner / configuration needed |
|---|---|---|
| Proxmox | Start, stop, reboot API submission | Snapshot/revert, lifecycle and read tools use runner |
| OPNsense | Firmware/health read and reboot | Other actions, scenario changes and read tools use runner |
| Active Directory/Windows | WinRM health, IP configuration, logs, HTTP checks; hash-approved PowerShell lifecycle | Hypervisor actions use runner; WinRM inventory and scripts must be approved |
| Wazuh | Agent query | Additional log reads and actions use runner; Wazuh access token must be refreshed in Vault |
| AWS | EC2 start, stop, reboot submission | Snapshots, restore, reads and lifecycle use runner; least-privilege account and resources required |
| CML | Node start/stop API submission | Reads, reboot and lifecycle use runner; version-specific API must be verified |
| Containerlab | Allowlisted Docker proxy health and start/stop/restart | TLS scoped proxy, snapshots and lifecycle commands required |
| Guacamole | Signed/encrypted JSON authentication, scoped connection exchange; Redis one-use five-minute grants | Existing Guacamole JSON extension, TLS, per-target parameters, session lifetime/recording configuration |

**Completion semantics:** native cloud/hypervisor API calls may return task acceptance,
not confirmed physical completion. The job records the adapter response and now moves to `needs_reconciliation` if completion
is not explicitly confirmed. It does not emit successful completion for a submission-only
response. Until live
completion polling is implemented and verified for the selected platform version, use
approved synchronous runner commands that wait for the actual desired state. Do not
interpret API acceptance as proof of fault recovery; ticket verification always requires
all scenario checks to explicitly pass.

## Vault contract

`VAULT_ADDR` must be HTTPS. `VAULT_TOKEN_FILE` points to a mounted scoped token file.
KV v2 defaults to mount `secret`; override with `VAULT_KV_MOUNT`.
The runtime reads `secret/data/aegis/{system}`. Use distinct tokens/process deployments
for read-only AI tools and mutating adapters in a hardened environment. The development
Compose template does not deploy Vault or mount these secrets automatically.

Common runner fields inside each adapter's Vault record:

```json
{"runner_url":"https://approved-runner.management.example","runner_token":"REPLACE_FROM_SECRET_STORE"}
```

Additional adapter fields:

- Proxmox: `url`, `api_token` (full `user@realm!token=secret` value); node reference `host/vmid`.
- OPNsense: `url`, `api_key`, `api_secret`.
- AWS: `region`, `access_key_id`, `secret_access_key`, optional `session_token`; reference EC2 instance ID.
- Wazuh/CML: `url`, `access_token`; CML reference `lab_id/node_id`.
- Containerlab: `docker_proxy_url`, `proxy_token`, `container_ids` mapping platform references to container IDs.
- Prometheus/OpenSearch: `url`, `token`. Collector credentials are separate from lab mutators.
- MinIO: `url`, `bucket`, `access_key_id`, `secret_access_key`. Bucket must be private and precreated.

Active Directory record:

```json
{
  "username":"LAB\\scoped-service-account",
  "password":"REPLACE_FROM_SECRET_STORE",
  "targets":{
    "ws-fin-02":{
      "endpoint":"https://ws-fin-02.management.example:5986/wsman",
      "interface_alias":"Ethernet",
      "gateway":"10.10.20.1",
      "baseline_file":"C:\\AEGIS\\baseline-gateway.json",
      "application_url":"https://approved-app.internal.example"
    }
  },
  "approved_scripts":{
    "net-gateway-wrong/scripts/inject.ps1":"REPLACE_WITH_REVIEWED_SHA256"
  }
}
```

Approve all four scripts by exact hash; pin a distinct, durable baseline path per target.
The script sample requires an existing single default route. Verify adapter-specific
restore preserves DHCP/static semantics on your image; this has not been tested on Windows.
Do not use these scripts on production hosts. Scenario input validation confines paths
and live hash validation prevents unreviewed changes from executing.

Guacamole record requires `url` (internal HTTPS), `public_url` (HTTPS), `json_secret_key`
(32 hexadecimal characters shared with Guacamole), and `targets`. Each platform reference
maps protocol keys to `{protocol, parameters}`. Hostnames, usernames, passwords and recording
paths belong in this Vault record, not in node records or browser payloads. For `serial`,
configure an approved SSH console-server connection. Redis atomically consumes an AEGIS
grant once; the resulting Guacamole session has its own configured lifecycle.

Implementation references:
[Guacamole JSON authentication](https://guacamole.apache.org/doc/gug/json-auth.html),
[OPNsense core API](https://docs.opnsense.org/development/api/core/core.html),
[OPNsense API overview](https://docs.opnsense.org/development/how-tos/api.html).

## Scoped runner

A runner implementation is included in `services/adapters/runner.py`; it is not enabled
by the default Compose deployment. Deploy it on the management network behind HTTPS/mTLS:

```bash
uvicorn services.adapters.runner:create_runner --factory --host 127.0.0.1 --port 9100
```

Provide `RUNNER_MANIFEST`, `RUNNER_TOKEN_FILE`, and a persistent `RUNNER_DATABASE_URL`.
Manifest commands are administrator-owned absolute argv arrays. No shell interpolation
or request-provided command arguments are allowed. Mutations require an idempotency key;
uncertain prior mutations are never repeated automatically. Commands must return one JSON
object. Successful node actions must return `{completed: true}`. Lifecycle mutations must
return `{applied: true}` or `{completed: true}`. Checks return `{passed: boolean, output: string}`. A concrete manifest shape:

```json
{
  "targets": {
    "approved-platform-ref": {
      "client_id": "00000000-0000-4000-8000-000000000002",
      "tags": ["lab"],
      "platform_host": false,
      "commands": {
        "read.health": {
          "argv": ["/opt/aegis-approved/read-health", "approved-platform-ref"],
          "sha256": {"/opt/aegis-approved/read-health": "REVIEWED_SHA256"}
        }
      }
    }
  }
}
```

This example does not install or invent the host-specific command. Supply real approved
commands for your inventory. Lifecycle command keys include the pack-relative script ID,
for example `scenario.setup:net-gateway-wrong/scripts/inject.ps1`.

## Telemetry ingestion

OpenSearch indexes `aegis-telemetry-*` must contain normalized `client_id`, `event_id`,
`@timestamp`, and `kind`. Flow entries require `edge_id`, `src`, `dst`, `port`, `proto`,
`bytes_per_s`, `verdict`, `observed_at`, and `source`. Denied flows require `source=firewall`;
Zeek alone cannot prove a firewall denial. Alert entries need a known `node_id`, title,
severity and event ID. Mapping live network records to configured tenant-owned links is
an ingestion responsibility; this backend does not infer topology from arbitrary packets.
Prometheus `up` samples need `client_id` and `node_id` labels matching inventory UUIDs.
The telemetry worker batches at two-second intervals; OpenSearch search-after cursors
survive restarts. Initial backlog may take multiple batches to drain.

## AI provider

`LLM_MODE=openai-compatible`, `LLM_BASE_URL` (HTTPS, including provider version prefix),
`LLM_MODEL`, and `LLM_API_KEY_FILE` select the provider. The file must be mounted read-only.
`LLM_DAILY_CALL_LIMIT` defaults to 100 per tenant per UTC date, with at most 800 output
tokens per request. This is a call cap, not an exact dollar budget. No provider was selected,
charged or tested here. Version prompts with evaluation fixtures; test both direct and
lab-output prompt injections before using scores to assess real proficiency. Deterministic
scores must remain labelled as demonstration results.
