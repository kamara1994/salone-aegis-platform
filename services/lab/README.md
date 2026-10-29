# Interactive lab backend

This module adds `/api/lab/v1/tenants/{client_id}` without editing the approved
`contracts/` or frontend. Its schemas are available at `GET /schemas` under that
prefix and in `models.py`. This is an additive backend API: the existing frontend
has not been wired to it. The existing `/api/v1` contract gate still reports legacy
route mismatches; passing this module's tests does not waive that gate.

## Commands and persistence

Authenticate with the existing bearer-token principal. Every mutation requires
`Idempotency-Key` and integer `If-Match` equal to the topology revision returned by
`GET /topology`. PATCH and DELETE also require the object's version. A stale request
returns 409; reusing an idempotency key with different content returns 409. A retry
with the original payload, revision, and key returns the original job.

POST `/objects/{kind}` with `{"data": {...}}` creates an object. PATCH
`/objects/{kind}/{uuid}` accepts `{"version": 1, "data": {...}}`. DELETE uses
`?version=1`. Supported kinds: sites, racks, device-models, devices, interfaces,
cable-types, cables, vlans, subnets, routes, vms, layouts. Device inspection uses
GET on the same object URL. Create/delete cables to connect/disconnect ports;
PATCH interfaces to configure port state, VLANs, IPs, speed and duplex. Route
objects configure routing. Device rules are ordered first-match ACL/firewall rules
(default allow); NAT is source NAT to a configured address.

Other commands:

- POST `/devices/{uuid}/power/{on|off|reboot}` with an object version.
- POST `/layouts/{uuid}/restore` with an object version activates a saved layout.
- POST `/baseline/{save|restore}` captures/restores tenant topology and active layout.
- POST `/packets` accepts source_id, destination (IP or source-configured DNS name),
  protocol, optional port, sequence and TTL. The result contains decisions/hops.
- POST `/sessions` accepts device_id and protocol; response includes a 60-second
  grant. POST `/sessions/{uuid}/{connect|command|terminate}` accepts version and,
  as appropriate, token or an allowlisted diagnostic command identifier.
- GET `/scenarios`; POST `/scenario-runs` accepts name, target_id and typed value;
  POST `/scenario-runs/{uuid}/{check|solve|cleanup}` accepts run version.
  Fault-level equivalents are `/faults` and `/faults/{uuid}/{check|solve|cleanup}`.

All successful commands return HTTP 202 with a job `id`, completed state, result,
and new topology revision. Model operations complete synchronously inside one SQL
transaction: records, job, evidence and event commit together. They are not queued
hardware operations. Existing workers publish their durable outbox events. Subscribe
to `job` or `*` on the existing `/api/v1/events` WebSocket using its authenticated
first-message protocol and after_seq replay cursor. No grants appear in events,
evidence, or persisted job results. Job results are also readable through the
existing authenticated `/api/v1/jobs/{id}` endpoint.

Baseline/fault/scenario commands require admin; other mutations require operator
or admin. Tenant-owned foreign keys are checked server-side. Writes are serialized
by the existing SQL transaction lock and fenced by topology/object versions.
Rejected connection commands cannot persist partial cable/port changes. Throttling
counts rejected attempts too (120 lab commands per actor/tenant/minute).

## Simulation semantics

Fake mode requires no external infrastructure. It models VLAN-aware Ethernet
forwarding, physical ARP reachability, deterministic DHCP pool allocation,
source-configured DNS records, connected/longest-prefix routes, source NAT,
ordered ACL/firewall rules, cable latency/loss, shutdowns, and failed power/health.
Loss samples depend on packet fields, sequence, and cable UUID; repeat the same
packet against the same topology for the same result. The simulator describes one
packet's forward path, not a TCP connection, full IOS emulator, DNS recursion,
stateful conntrack, or a real VM image. Switches flood eligible ports; learned MAC
aging and spanning-tree convergence are not modeled. DHCP pools are tenant/VLAN
services, not emulated DHCP server processes.

Structured fault packs cover wrong cable/port, unplugged cable, shutdown, VLAN,
speed, route, firewall, and failed VM/device. Each stores the pre-injection object,
checks the faulted field against that baseline, and restores exact configuration
on solve/cleanup. Versions/timestamps advance on restore intentionally, preventing
stale writes from becoming valid again. Active faults reserve their targets and
baseline references until cleanup. Existing filesystem script packs remain on the
original orchestrator lifecycle; new structured packs do not execute shell scripts.

## Console safety and live deployment

Fake sessions provide structured diagnostics, not an arbitrary shell or graphical
VM. Live sessions are disabled by default. `AEGIS_CONSOLE_BROKER_ENABLED=true`
selects `services.adapters.lab_console.BrokerConsoleTransport`. Provision a trusted
HTTPS Guacamole/noVNC broker implementing `/v1/sessions/operations`; the broker
must independently authenticate browser WebSocket connections, enforce actor and
tenant scope, record/restrict terminal input, and honor session operation
idempotency. A broker implementation and actual VM/device infrastructure are
external deployment prerequisites; this repository does not launch real consoles
without them.

The Vault `console-broker` document contains server-only url, public_url, token,
and targets keyed by `tenant_uuid:device_uuid`. Each binding has target_ref,
platform (linux/windows/ios/opnsense), protocols, tags including lab, and explicit
platform_host=false. SSH/RDP/VNC/serial/Guacamole/noVNC are capability selections,
not browser-supplied hosts or credentials. Broker responses are filtered to a
confirmed status and fixed-origin session URL. Structured command calls are
allowlisted and audited. An external broker must provide auditing for interactive
keystrokes that bypass those structured calls. No live transport has been tested
against real infrastructure here.

## Verification

Run `python -m pytest -q` and `python -m ruff check services infra scripts tests`.
Run the unchanged shared contract gate with `python -m scripts.contract_gate`.
Render PostgreSQL migrations with `DATABASE_URL=postgresql://localhost/aegis
python -m alembic -c infra/alembic.ini upgrade head --sql`.

For disposable PostgreSQL migration/trigger and backend integration checks:

```sh
docker compose -f infra/compose.lab-test.yaml up --build --abort-on-container-exit --exit-code-from checks
docker compose -f infra/compose.lab-test.yaml down --volumes
```

The test database has no published ports and uses disposable storage. Its trust
authentication is confined to this test harness; do not use it as production config.
