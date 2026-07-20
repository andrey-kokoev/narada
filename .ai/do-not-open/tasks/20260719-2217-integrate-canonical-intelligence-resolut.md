---
number: 2217
governed_by: dependencies
status: in_review
tags: invokable-intelligence, live-e2e, local, runtime
creation_payload_ref: mcp_payload:invokable-intelligence-local-runtime-v2@v1
creation_payload_sha256: eb674dbf76b91bdbd1a7890270dd55c525b2e711e49ae12a30247c9005ce7e6e
idempotency_key: invokable-intelligence-local-runtime-v2
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":"D:\\code\\narada","site_root":"D:\\code\\narada","correlation_key":"invokable-intelligence-local-runtime-v2"}
criteria_proved_by: operator
criteria_proved_at: 2026-07-20T04:59:09.468Z
criteria_proof_verification:
  state: bound
  verification_run_id: structured_command_execution:e_ccce36abf3b340378353ed1c
amended_by: operator
amended_at: 2026-07-20T06:25:05.357Z
---

# Integrate canonical intelligence resolution into the local runtime

## Goal

Make each local invocation acquire admitted inputs, resolve an eligible offering/route, revalidate its plan, execute, and persist separated result/outcome/evidence records.

## Context

Depends on canonical migration and materialization adapters. This task is the sole owner of local live E2E; management and final cutover consume its evidence instead of duplicating the journey.

## Required Work

Pass target, User, principal, execution topology, purpose, explicit clock, and request intent from launcher/session boundaries.
Acquire admitted materialized inputs and evaluate authority, offering capability composition, route topology, access/entitlement/quota/budget/governance, then preferences/defaults.
Persist immutable intent, v2 plan/snapshot, attempt, result, terminal outcome, observation/evidence, telemetry, and retry/replay lineage.
Remove authoritative local provider/model environment selection while preserving secret transport bindings.
Own focused unit/integration/restart/replay tests and one local live E2E covering success and typed pre-provider refusal.

## Non-Goals

Do not resolve policy in the launcher.
Do not own Cloudflare runtime behavior or E2E.
Do not duplicate management/migration implementation.
Do not treat session-wide model caching as authority.

## Execution Notes

Integrated the local invocation gateway with SQLite-backed canonical acquisition/resolution, immutable plan snapshots, pre-provider access/governance refusal, adapter dispatch, and separate intent/plan/attempt/result/outcome/observation/evidence/telemetry persistence. Removed provider/model environment selection from the local launch path while retaining credential transport only at the planned adapter boundary.

Fresh execution `e_c734f3dd6b3c4ce7933f6615` passed 13/13 and emitted seven schema-labelled task evidence packets:

- `principal-refusal-pre-attempt`: `attempt_id=null`, adapter dispatch count 0, one durable terminal refusal outcome, admitted evidence ID, and idempotent refusal/outcome readback.
- `idempotency-retry-replay`: one duplicate operation reused its original attempt without redispatch; explicit retry and replay produced three immutable attempts with `initial`, `retry-of`, and `replay-of` lineage plus two revalidation IDs.
- `catalog-change-replan`: a catalog revision produced a new immutable plan with `replan-of` lineage and durable predecessor/replacement plan IDs.
- `stale-plan-pre-dispatch-refusal`: dispatch count remained 1 before and after the stale retry refusal.
- `acknowledgment-vs-provider-failure`: admission-unknown and acknowledged provider-failure have different outcome IDs/kinds and explicit acknowledgment states.
- `restart-replay-retry`: reopening the SQLite store returned the original attempt with zero redispatch, then appended one retry attempt linked to the original.
- `local-http-success-and-principal-refusal`: exactly one HTTP provider request served the success journey; the following refusal added no request and no attempt. Readback linked concrete intent, plan, attempt, result, outcome, four admitted evidence IDs, and telemetry for success, plus intent/outcome/evidence IDs for refusal.

Primary implementation surfaces are `packages/invokable-intelligence-runtime/src/index.ts`, `packages/invokable-intelligence-runtime/test/index.test.ts`, canonical contract/resolver/registry persistence APIs, and the launcher/session boundaries that pass Site, principal, topology, purpose, clock, and request intent without selecting provider/model authority.

## Verification

- `pnpm --filter @narada2/invokable-intelligence-runtime test`: passed 13/13 with all seven case packets and concrete record/readback IDs; execution `e_c734f3dd6b3c4ce7933f6615`.
- `pnpm --filter @narada2/invokable-intelligence-runtime typecheck`: passed; execution `e_47967bad70024de3a2fc476f`.
- `pnpm --filter @narada2/invokable-intelligence-runtime build`: passed; execution `e_6bc1edf83ee74538af8f26e9`.
- Full zero-consumer ledger passed with no authoritative provider/model selection consumer; execution `e_e52d0bfa5a844cc490e17e8f`.

## Acceptance Criteria

- [x] Local invocation succeeds from SQLite-backed canonical state without provider/model selection environment variables.
- [x] Plan selects an explicit offering, route, topology, account/grants, authority provenance, and temporal snapshot.
- [x] Unauthorized, infeasible, stale, expired, and unsupported candidates refuse before provider invocation.
- [x] Restart/retry/replay append immutable attempts and preserve plan/replan lineage.
- [x] The single owned local live E2E emits linked intent, plan, attempt, result/outcome, and admitted evidence refs.
