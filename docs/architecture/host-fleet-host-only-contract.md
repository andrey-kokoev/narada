# Host Fleet Host-Only Contract

## Objective

Host Fleet is a read-only projection of machines that belong to one Fleet. A
Fleet is a set of hosts; it has no knowledge of the Sites, users, agents,
sessions, runtimes, or launchers inside a host.

## Factorization

The implementation has four orthogonal owners:

1. `@narada-core/host-fleet` owns the strict host-only wire contracts.
2. `@narada-core/host-fleet-runtime` owns machine configuration, the Fleet
   authority and publisher processes, HMAC admission, SQLite state, active
   reachability probes, and OS-service plans.
3. The host gateway (`@narada-core/operator-console-remote-gateway`) carries
   signed heartbeat bytes to the authority host. It does not decide membership.
4. Operator Console reads the authority snapshot and renders it. It does not
   discover members or mutate Fleet state.

No component derives Fleet membership from a User Site or Site registry.

## Authority Topology

One rostered host is the Fleet authority. Its machine-level configuration owns
the complete host roster and runs a loopback-only HTTP authority. Every other
host runs a publisher service with an empty roster and a remote ingress URL.

The data path is:

```text
member host publisher
  -> HTTPS Host Gateway ingress
  -> authority-host Operator Console ingress
  -> loopback Host Fleet authority
  -> SQLite observation state
  -> read-only Fleet snapshot
```

The gateway and console preserve the signed request body and HMAC headers. Only
the loopback authority validates membership, Fleet identity, roster admission,
clock skew, key lifetime, signature, and nonce replay.

## Membership Trust

All Fleet hosts share one machine-level `host_fleet_membership_secret`. The
secret proves membership in a Fleet, not a unique machine identity. Therefore
any holder can sign a heartbeat that asserts any host ID already admitted by
the authority roster. Per-host attestation is deliberately outside this
shared-secret model.

Every signed heartbeat carries `fleet_id`; the authority rejects a heartbeat
for another Fleet even when key material was accidentally reused. The secret
is read from a protected machine file and is never stored in SQLite, returned
by an API, or projected to a surface.

Rotation has two authority slots: `active` and a time-bounded `previous`.
Publishers hold only the active credential. Configuration changes take effect
through validated service reload, not implicit file watching.

## Projected Codomain

Each rostered host projects exactly four domains:

1. **Identity**: stable host ID, display name, and platform from the authority roster.
2. **Reachability**: an independent authority-owned probe result and observation time.
3. **Health**: freshness-adjusted health plus the last status reported by the publisher.
4. **Operator Console location**: availability and an HTTP(S) URL when configured.

Publisher freshness and reachability are separate. A fresh heartbeat does not
prove that the Operator Console endpoint is reachable, and a successful probe
does not make a stale heartbeat fresh. Once a heartbeat exceeds
`stale_after_ms`, effective health becomes `unknown` while the reported status
remains visible as historical evidence.

## Runtime Availability

Authority and publisher processes expose loopback `/health`. Publisher health
records the last publish attempt, success, and bounded failure code, so an
unreachable authority does not make the publisher process invisible. The
authority additionally exposes `/v1/snapshot` and `/v1/observations` on
loopback.

Operator Console returns an explicit `unconfigured`, `degraded`, or `ready`
runtime envelope. It derives the authority endpoint from validated machine
configuration; it does not assume the default port or treat a publisher as a
local authority.

## Mechanical Enforcement

Tests fail when:

- a host or snapshot carries Site, agent, session, or runtime identity fields;
- Fleet source imports a Site, agent, session, NARS, launcher, or lifecycle package;
- a heartbeat omits `fleet_id`, crosses Fleet identity, replays a nonce, or has an invalid signature;
- runtime source imports anything beyond the host contract and SQLite foundation;
- a publisher configuration contains a roster or a previous credential;
- the authority listener is not loopback-only;
- Operator Console derives hosts from Site state or ignores the configured authority endpoint;
- a service reload activates invalid configuration without restoring the prior valid file.

## Explicit Non-Goals

- discovering or controlling anything inside a host;
- per-host cryptographic identity or hardware attestation;
- remote shell or host lifecycle control;
- exposing Fleet mutation through MCP;
- silently discovering peers;
- making Operator Console or Host Gateway the membership authority.

Deployment and rotation procedures live in
[`host-fleet.md`](../operator/host-fleet.md).
