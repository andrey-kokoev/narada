# Cloudflare NARS Web Projection Live Smoke

## Purpose

This runbook verifies the deployed Cloudflare-hosted `agent-web-ui` against a live local NARS session without mocks, fallbacks, or local-only shims.

The architecture is defined in [`../concepts/cloudflare-nars-web-projection.md`](../concepts/cloudflare-nars-web-projection.md). This page is the operator-facing proof procedure and evidence contract.

## What This Proves

A passing live smoke proves the full remote projection loop:

1. The deployed Cloudflare Worker health endpoint responds.
2. A projection is registered in deployed Cloudflare state.
3. The local bridge publishes replayed local NARS events to Cloudflare.
4. The deployed static browser shell loads from Cloudflare assets.
5. The browser attaches to the projection and opens the Cloudflare projection WebSocket.
6. The browser submits a real operator input envelope through deployed Cloudflare `/input`.
7. The bridge claims and delivers that input to live local NARS.
8. Live local NARS acknowledges admission over its WebSocket and records the input in its local event log.
9. A later bridge pass replicates the admitted local NARS evidence back to deployed Cloudflare.
10. The hosted browser can observe the replicated input id from deployed Cloudflare.
11. Projection revocation refuses later projection reads.

The semantic success point for operator input is local NARS admission. Cloudflare HTTP `200` on `/input` is only intermediate evidence.

## Steady-State Transport Rule

The remote browser uses HTTP for replay/bootstrap and WebSocket for live event delivery.

`GET /events` is replay and recovery. `WS /events/websocket` is the live projection channel. The smoke should fail if the hosted browser can only see stale replay state and cannot observe the acknowledged input after bridge replication.

SSE is not the required operator path for this proof. Local SSE plausibility is not enough to claim deployed live projection readiness.

## Prerequisites

- A live local NARS session is already running for the target Site and agent.
- The local session has a reachable NARS WebSocket endpoint and local event log.
- The Cloudflare projection Worker is deployed.
- `packages/agent-web-ui/dist` is current before deployment.
- The smoke host can launch a real browser through the script's CDP path.
- The operator intentionally opts into mutation with `--live`.

## Build And Deploy

Run from `D:\code\narada`:

```text
pnpm --filter @narada2/agent-web-ui build
pnpm --filter @narada2/cloudflare-nars-projection deploy:live
```

The deploy command publishes the Worker and static UI assets. The command output includes the deployed Worker URL and version id.

## Dry Plan

Without `--live`, the smoke must not mutate deployed Cloudflare or local NARS. It reports the missing live opt-in and required arguments.

```text
node packages/cloudflare-nars-projection/scripts/cloudflare-nars-web-projection-live-smoke.mjs --cloudflare-api-base-url https://<projection-host> --site-root <site-root> --site-id <site-id> --session <nars-session-id>
```

## Live Smoke

Run the live proof with an explicit projection id so the evidence can be correlated with Cloudflare, bridge, and local NARS logs:

```text
node packages/cloudflare-nars-projection/scripts/cloudflare-nars-web-projection-live-smoke.mjs --live --cloudflare-api-base-url https://<projection-host> --site-root <site-root> --site-id <site-id> --session <nars-session-id> --projection-id <projection-id>
```

Example shape:

```text
node packages/cloudflare-nars-projection/scripts/cloudflare-nars-web-projection-live-smoke.mjs --live --cloudflare-api-base-url https://narada-nars-projection.andrei-kokoev.workers.dev --site-root D:\code\narada.sonar --site-id sonar --session carrier_... --projection-id proj_strict_live_nars_...
```

## Required Evidence

The script writes a structured JSON evidence file under `.narada/crew/nars-projections/` unless `--evidence-path` is supplied. That directory is runtime evidence and is gitignored.

A complete pass must contain:

| Evidence field | Required meaning |
| --- | --- |
| `status = passed` | The smoke completed every required assertion. |
| `registration_status = registered_remotely` | Deployed Cloudflare accepted projection registration. |
| `bridge.status = connected` | Local bridge published replay/backfill to Cloudflare. |
| `hosted_shell.ok = true` | Deployed static web UI loaded from Cloudflare assets. |
| `hosted_browser.status = passed` | Real hosted browser completed the projection interaction. |
| `hosted_browser.stream.found = true` | Browser saw the remote projection stream become connected. |
| `input.status = submitted_from_hosted_browser_ui` | Input came from the hosted browser UI, not a local shortcut. |
| `input.input_response.body.ok = true` | Cloudflare accepted the input envelope for bridge delivery. |
| `delivery.status = delivered` | Bridge claimed and delivered pending input. |
| `nars_admission.status = accepted_by_live_local_nars` | Local NARS accepted the input. |
| `nars_admission.websocket.observed_expected_event = true` | Local NARS WebSocket observed the expected admission event. |
| `local_event_log.found = true` | Local NARS event log recorded the acknowledged input id. |
| `bridge_after_input.status = connected` | Bridge replicated after input admission. |
| `replicated.found = true` | Deployed Cloudflare contains the acknowledged input evidence after bridge replication. |
| `revoke.status = revoked` | Projection revoke completed. |
| `refused_after_revoke.status = refused` | Deployed Cloudflare refused reads after revoke. |

## Failure Interpretation

| Symptom | Likely meaning |
| --- | --- |
| Hosted browser loads but remote events stay stale | Browser is only seeing replay, or the Cloudflare WebSocket fanout path is broken. |
| `/input` returns `ok` but no local NARS event appears | Cloudflare accepted the envelope, but semantic admission failed or bridge delivery is broken. |
| Local NARS accepts input but remote UI never sees it | Bridge replication back to Cloudflare or WebSocket fanout is broken. |
| Revocation does not refuse later reads | Projection lifecycle enforcement is broken. |
| Smoke passes locally but fails after deploy | Local tests are not specifying the deployed Worker transport closely enough. Add or fix deployed-path coverage. |

## Test Coverage Rule

Unit tests and live smoke must specify the same transport shape.

The package tests should cover Durable Object WebSocket broadcast from bridge-published events. SSE tests may remain for compatibility, but they do not prove the operator live path. The live smoke is the authority for deployed Cloudflare behavior.

When adding behavior to the projection path, update both:

- `packages/cloudflare-nars-projection/test/cloudflare-nars-projection.test.ts`
- `packages/cloudflare-nars-projection/scripts/cloudflare-nars-web-projection-live-smoke.mjs`

## Completion Standard

Do not claim this slice is complete from a green local unit test, a successful deploy, or a successful Cloudflare `/input` response alone.

Completion requires current evidence that the deployed hosted browser, deployed Cloudflare Worker, local bridge, live local NARS WebSocket, local NARS event log, replication back to Cloudflare, and revocation path all agree.
