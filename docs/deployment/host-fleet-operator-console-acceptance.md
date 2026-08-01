# Host Fleet Operator Console Acceptance

This runbook is the operational proof for
[`host-fleet-operator-console-target.md`](../architecture/host-fleet-operator-console-target.md).
It does not enroll hosts, deploy a Worker, or mutate a runtime by itself. Those
actions remain explicit operator operations with their own authority and
confirmation boundaries.

## Acceptance Scope

The proof uses two physical hosts running the same Site and Agent:

- one Windows host;
- one Linux host, such as the ZimaBoard;
- distinct `HostKey` values, even when both hosts use the same local port;
- one independently identifiable runtime session per host.

The acceptance result is not valid if the console silently falls back to an
Agent-only or Site-only session selection.

## Preflight

On the machine running the acceptance commands, verify the repository and
dependencies first:

```text
pnpm install
pnpm --filter @narada-core/host-fleet typecheck
pnpm --filter @narada-core/operator-console-ui typecheck
pnpm --filter @narada-core/cloudflare-nars-projection typecheck
```

Do not put raw credentials in a checked-in file. The physical harness accepts
`NARADA_HOST_FLEET_LIVE_E2E_JSON` as a process-local input. Each entry must
contain:

```text
{
  "host_id": "desktop-sunroom-2",
  "host_instance_id": "desktop-instance-YYYY-MM",
  "endpoint": "http://127.0.0.1:61730",
  "credential": "<process-local gateway credential>",
  "credential_class": "dedicated_host_gateway",
  "admitted_site": "sonar",
  "local_port": 61730,
  "expected_session_id": "<exact runtime session id>"
}
```

The second entry uses the Linux host's HostKey and the same `local_port` value.
The endpoint may be a separately secured tunnel endpoint; it must not be an
arbitrary browser-supplied URL.

For an existing deployment that has not migrated its gateway, omit
`credential_class` and the local compatibility default is
`bridge_compatibility`. For a dedicated deployment, the host gateway must be
configured with the matching dedicated secret and must reject the bridge
header for host-qualified requests. Credential values remain process-local.

## Physical Host Proof

Run the opt-in physical harness only after the two exact sessions are already
running:

```text
pnpm --filter @narada-core/host-fleet test:live
```

The harness proves:

1. both HostKeys are distinct;
2. both endpoints use the declared local port;
3. both gateways authenticate and report health;
4. session discovery is Site-qualified;
5. each expected session is discoverable under its own HostKey; and
6. no host's session response is attributed to the other host.

Then perform the browser/operator checks through the Host Fleet page:

| Case | Required observation |
| --- | --- |
| Baseline | Both hosts are visible with independent health and exact session IDs. |
| Attach | Selecting one HostKey never attaches to the other host's session. |
| Replay/live | Events retain host, instance, Site, Agent, runtime session, and host-local sequence. |
| Aggregate | Aggregate observation opens one subscription per exact target and shows per-target cursors; no global sequence is shown. |
| Input | A deliberately marked test input reaches only the selected RuntimeTarget; the other host has no corresponding input event. |
| Restart | Restart one runtime, refresh discovery, and verify the old target is stale/closed and the new target is explicitly selected. |
| Offline | Stop one gateway and verify `offline`/`unavailable`; no fallback to the other HostKey is permitted. |
| Revocation | Revoke one host and verify new attachment is refused while permitted evidence remains readable. |
| Re-enrollment | Re-enroll with a new instance ID and verify the old instance is retired rather than silently replaced. |
| Credential boundary | A dedicated host uses the dedicated gateway header; an expired or not-yet-valid policy refuses before network crossing; a legacy record uses the bridge header; no credential value appears in evidence. |

Record the exact HostKeys, runtime session IDs, timestamps, refusal codes, and
the operator surface used. Do not record credentials or event payloads that are
not needed to prove the boundary.

## Local Authority Browser Proof

The repository also has a bounded live lane for the local authority journey.
It starts real loopback gateway servers, a file-backed SQLite Host Registry,
the actual Operator Console HTTP server, and a real headless browser. It proves
the empty state, enrollment review and apply, exact session attachment and
replay, revoke readback, two-host aggregate observation, and reconnect after a
gateway drops its first event stream:

```text
pnpm --filter @narada-core/cli test:host-fleet-live
```

This lane is live and performative against disposable local fixtures; it does
not claim that a production host is enrolled or that a Cloudflare deployment
is reachable.

## Cloudflare Registry Preflight

The deployment-owned registry is validated separately from live deployment:

```text
$env:NARADA_HOST_FLEET_REGISTRY_FILE = "config/host-fleet.registry.json"
pnpm --filter @narada-core/cloudflare-nars-projection host-fleet:preflight
```

The result must have:

- `status: "ready"`;
- `preflight_ready: true`;
- `deployment_ready: false` until live binding and deployment checks pass;
- every required service-binding name;
- every required secret-binding name;
- `/health`, session discovery, and event paths admitted; and
- `sessions` and `events` capabilities present for each active host.

The preflight is not evidence that a Worker can reach a gateway. A production
proof additionally requires the deployment-owned registry to be materialized,
each binding and secret to be configured, the Worker to be deployed, and an
authenticated browser smoke test against the deployed URL.

The read-only browser smoke lane is available after those deployment-owned
inputs exist:

```text
Get-Secret -Name <temporary-access-secret> -AsPlainText | pnpm --filter @narada-core/cloudflare-nars-projection smoke:host-fleet-live -- --live --url <worker-url> --access-client-id <id> --access-client-secret-stdin
```

It refuses local or private origins, requires Cloudflare Access credentials,
checks unauthenticated refusal, inventory, authenticated redacted audit
readback at `/api/narada/fleet/observations`, the non-mutating lifecycle
preflight, gateway health, session discovery, exact target resolution, and the
`/console/hosts` browser projection, then opens one exact event subscription
and verifies replay without submitting operator input. It writes redacted evidence under
`.narada/evidence/cloudflare-host-fleet-live-e2e.json` by default. Planning
is explicit and performs no network request:

```text
pnpm --filter @narada-core/cloudflare-nars-projection plan:host-fleet-live
```

This lane is acceptance evidence only. It does not deploy, enroll, revoke,
retire, launch, stop, or otherwise mutate a host or runtime.

## Evidence and Disposition

Accept the target only when all physical and deployed checks have recorded a
pass. A skipped physical harness, a synthetic Cloudflare test, or a successful
registry preflight is not an acceptance substitute for the missing external
boundary.

For any failure, retain:

- the exact qualified target and HostKey;
- the typed refusal or health state;
- the request correlation ID when a gateway was crossed;
- the observation time and host-local sequence/cursor; and
- the remediation disposition.

Redact gateway credentials, secret references that reveal sensitive topology,
request bodies, response payloads, and arbitrary endpoint details before
sharing evidence outside the User Site.
