---
status: closed
depends_on: [1420]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T22:16:39.435Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by docs/product/site-telemetry-cloudflare-coordinate-secret-posture.v0.md and raw-secret pattern check.
closed_at: 2026-05-16T22:16:46.258Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Record Cloudflare coordinate and secret posture decision

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1421-1430-site-telemetry-publication-live-readiness-followon.md

## Goal

Decide and record which Cloudflare values are repo-visible deployment coordinates and which are capability-bearing secrets.

## Context

The current preflight is blocked by placeholder D1/KV bindings and missing auth. The next work must remove handwaving around resource ids and secret refs.

## Required Work

1. Ground the decision in capability-governed secret management, canonical capability consent, and Cloudflare Site materialization docs.
2. Classify Worker name, route/domain, account id, zone id, D1 database id/name, KV namespace id/name, secret names, and token values.
3. Record whether Cloudflare resource ids are non-secret deployment coordinates for this project and under what limits.
4. Define how raw API tokens, signing keys, local admission tokens, and webhook secrets are configured out-of-band.
5. Produce a coordinate/secret posture artifact that config patch and deploy tasks must cite.

## Non-Goals

- Do not record raw secret values.
- Do not create Cloudflare resources.
- Do not modify wrangler config unless only adding comments/docs that do not imply live readiness.

## Execution Notes

Created `docs/product/site-telemetry-cloudflare-coordinate-secret-posture.v0.md`.

The artifact classifies Cloudflare Worker name, route/domain, account id, zone id, D1 database id/name, KV namespace id/name, binding names, Worker secret names, capability refs, Cloudflare API tokens, bearer token values, local admission token values, signing keys, webhook secrets, and smoke payload data.

It records the decision that Cloudflare resource ids may be committed as non-secret deployment coordinates after operator admission for this project, while raw token/key values remain out-of-band in the owning secret store. No Cloudflare resources were created and no wrangler config was modified.

## Verification

- `rg -n "Cloudflare account id|D1 database id|KV namespace id|Cloudflare API token|Worker secret names|Coordinate Visibility Decision|Capability And Consent|Do not use" docs/product/site-telemetry-cloudflare-coordinate-secret-posture.v0.md` passed; artifact contains coordinate/secret classifications, visibility decision, consent gate, and evidence language.
- `rg -n "sk-[A-Za-z0-9]|Bearer [A-Za-z0-9_-]{12,}|[A-Za-z0-9_-]{32,}" docs/product/site-telemetry-cloudflare-coordinate-secret-posture.v0.md` found no raw secret material; only the long deploy approval environment variable name matched the broad token-like pattern.

## Acceptance Criteria

- [x] A coordinate/secret posture artifact exists.
- [x] Deployment coordinates and secrets are explicitly separated.
- [x] The artifact states whether Cloudflare resource ids may be committed and why.
- [x] No raw secrets are recorded.
