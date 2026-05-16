---
status: closed
amended_by: narada.architect
amended_at: 2026-05-16T01:39:10.003Z
closed_at: 2026-05-16T03:22:27.340Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Define Site telemetry and agent identity telemetry config posture

## Chapter

Site telemetry and agent identity telemetry

## Goal

Add a first-class Site telemetry doctrine/config slice, including agent identity telemetry objects, telemetry_destinations in Site config schema, and enable_telemetry defaulting to true.

## Context

Narada already has Site posture, health, traces, daemon observations, state projections, and Site immune sensing, but lacks a named Site telemetry abstraction. The Operator clarified that Site telemetry should also include telemetry objects for agent identities, so Narada can observe which durable Agent identity is embodied through which carrier/session, with what heartbeat, work posture, and capability projection, without making telemetry itself identity, assignment, review, or capability authority.

Staccato provides an inhabited precedent for a Cloudflare Worker destination/projection surface: the Staccato Site declares `integrations.cloudflare.published_surface` with webhook URL, health URL, event families, guarded payload policy, KV/D1 bindings, verification evidence, and inbox return URLs; `D:\code\staccato-elt\workers\staccato\src\index.mjs` implements bearer-capability guarded `/webhook`, read APIs, KV latest projections, D1 inbox/receipt/disposition/audit tables, and freshness projection; `D:\code\staccato-elt\scripts\Publish-StaccatoSurface.mjs`, `Publish-StaccatoSyncStatus.mjs`, and `Pull-StaccatoSurfaceInbox.mjs` implement outbound publish and local-admission pullback. Lift this pattern as generic telemetry destination/transport posture, not as Staccato-specific authority or active remote default.

## Required Work

1. Define Site telemetry as bounded, read-only, freshness-tagged observation evidence produced by Site runtime/daemon/adapters for health, posture, projections, traces, operator attention, and stabilization.
2. Include agent identity telemetry and agent carrier session telemetry object families that observe durable Agent identity embodiment, carrier kind/session, runtime locus, heartbeat freshness, current governed work posture, last governed action, projected capabilities, grant refs, and bounded health/status.
3. Preserve authority separation: telemetry must not assign work, grant capability, certify identity, admit inbox/task state, close tasks, review work, mutate Site config, or become raw runtime authority.
4. Update Site config schema/materialization posture to include `enable_telemetry`, defaulting to true/yes for new Site configs unless explicitly disabled by operator policy.
5. Add `telemetry_destinations` as an array in Site config schema. Destination records must be bounded declarations such as local_file, sqlite_table, inbox_envelope, operator_surface, webhook, cloudflare_worker, or disabled, with destination id, kind, enabled flag, scope, redaction/output bounds, retention posture, freshness posture, transport, storage posture, and authority limits.
6. Distinguish telemetry object, destination, and transport. A destination declares where bounded telemetry may land and how it is admitted/projected; a transport declares the mechanism, such as local_append, sqlite_insert, operator_surface_projection, bearer_https_post, or site_pubsub_signal.
7. Lift the Staccato Cloudflare Worker pattern as an optional remote destination contract: disabled by default; bearer capability reference rather than raw token; webhook URL and health URL; accepted event families; latest_projection and optional append/event-log storage posture; optional hosted read API posture; optional return-channel inbox posture that remains inert until local Site admission.
8. Ensure default telemetry behavior is local and bounded: no remote/exporting destination is active by default without explicit operator configuration/capability; secrets, raw transcripts, raw provider outputs, raw model outputs, raw DB dumps, and unredacted client data are excluded.
9. Specify that Cloudflare/HTTP telemetry projection cannot become Site authority: it cannot assign work, grant capabilities, certify identity, mutate Site config, admit task/inbox state by itself, or override local freshness/authority records.
10. Add docs/tests/schema fixtures proving defaults, explicit opt-out, destination validation, agent telemetry object shape, redaction bounds, transport/destination separation, remote disabled-by-default posture, and non-authority posture.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by narada.architect at 2026-05-16T01:39:10.003Z: context, required work, appended criteria
- Added Site telemetry config primitives in `packages/site-config/src/index.ts`: `enable_telemetry` defaults to true, bounded `telemetry_destinations`, destination/transport kinds, local bounded default destination, and a non-mutating telemetry decision function.
- Added agent identity telemetry object shape with durable identity, carrier/session, runtime locus, heartbeat/work posture, last governed action, projected capability refs, grant refs, bounded health, and explicit non-authority/raw-exclusion flags.
- Added telemetry validation for destination id/scope, authority limits, raw-value exclusion, and explicit remote webhook/Cloudflare bearer HTTPS requirements. Remote destinations remain inactive unless explicitly enabled and configured with capability refs and URLs.
- Documented Site telemetry posture in `packages/site-config/README.md`, including read-only/freshness-tagged semantics, local default behavior, destination/transport separation, remote disabled-by-default posture, and non-authority limits.
- Added package tests proving defaults, opt-out, remote disabled-by-default posture, destination/transport separation, raw-value exclusion, and agent telemetry non-authority flags.

## Verification

- `pnpm --filter @narada2/site-config test` passed: 9 tests.
- `pnpm --filter @narada2/site-config typecheck` passed.

## Acceptance Criteria

- [x] Site telemetry is documented or specified as a bounded read-only observation family, distinct from authority records and mutation evidence.
- [x] Agent identity telemetry and carrier session telemetry object shapes are specified with authority limits and freshness/source evidence fields.
- [x] Site config schema or materialization fixtures include `enable_telemetry` defaulting to true/yes for new configs and supporting explicit operator opt-out.
- [x] Site config schema includes a validated `telemetry_destinations` array with bounded destination kinds, disabled/local defaults, redaction bounds, retention posture, and authority limits.
- [x] Tests or fixtures prove defaults, opt-out, destination validation, raw-value exclusion, and that telemetry cannot act as identity/capability/task/inbox authority.
- [x] Cloudflare Worker or HTTP webhook telemetry destination posture is specified by lifting the Staccato published-surface pattern without copying Staccato-specific authority or activating a remote destination by default.
- [x] Transport and destination are structurally distinct in schema/docs, including disabled-by-default bearer HTTPS projection with capability references, accepted event families, freshness posture, redaction bounds, and non-authority limits.
