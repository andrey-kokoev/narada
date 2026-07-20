---
number: 2215
governed_by: dependencies
status: in_review
tags: compatibility, consumer-inventory, deprecation, invokable-intelligence
creation_payload_ref: mcp_payload:invokable-intelligence-compatibility-projection-v2@v1
creation_payload_sha256: 88e28f60265cda2f19c2856e3ec85074f99594b535886d9a59c00df49aa9eaee
idempotency_key: invokable-intelligence-compatibility-projection-v2
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":"D:\\code\\narada","site_root":"D:\\code\\narada","correlation_key":"invokable-intelligence-compatibility-projection-v2"}
criteria_proved_by: operator
criteria_proved_at: 2026-07-20T04:55:01.955Z
criteria_proof_verification:
  state: bound
  verification_run_id: structured_command_execution:e_c991da0d62344a6cba9864e0
amended_by: operator
amended_at: 2026-07-20T06:25:03.964Z
---

# Bound and instrument the legacy intelligence compatibility projection

## Goal

Keep unmigrated consumers working through a read-only, observable, explicitly temporary projection while producing an authoritative zero-consumer inventory.

## Context

Consumes bridge task #2212. The compatibility projection is an embodiment over canonical v2 state, never a fallback authority. It is separately closable so runtime migration and eventual removal are measurable.

## Required Work

Define the exact legacy shapes and consumers still served by the projection.
Generate legacy reads solely from canonical v2 records; prohibit writes and environment/default fallback authority.
Emit deprecation/consumer telemetry with call site, configuration key, and migration owner.
Provide a repository-wide consumer inventory and structured zero-consumer check.
Document removal preconditions consumed by final cutover.

## Non-Goals

Do not preserve undocumented fallback behavior.
Do not migrate consumers in this task.
Do not make the projection an authority source.
Do not remove the projection before zero-consumer evidence.

## Execution Notes

Implemented a read-only legacy compatibility embodiment over canonical v2 records, bounded deprecation/consumer telemetry, explicit unknown-key refusal, and a deterministic repository/distribution inventory. Retired the authoritative carrier-provider-contract package path and classified every retained legacy symbol reference with path, line, symbol, scan scope, authority status, reason, migration owner task, and destination. Updated launcher/runtime rejection boundaries so provider/model selection variables are scrubbed and cannot regain authority. The full per-reference ledger is inspectable in structured command execution `e_e52d0bfa5a844cc490e17e8f`: 28 files, 286 references, 286 admitted non-authoritative references, zero authoritative consumers, and no retired package artifact.

PE-lite pruning pass:

- Preservation context: canonical v2 catalog/policy is the only selection authority; compatibility is read-only, observable, secret-safe, temporary, and removable only with deterministic zero-consumer proof.
- Coupled loci: the legacy projection, runtime/launcher rejection boundaries, frozen migration fixture, consumer telemetry, and repository/distribution inventory.
- Primary defect: historical residue, with redundant authority and encoding excess in the retired provider/model environment and package projections.
- Admissible witness: remove the retired authority package and all authoritative legacy selection reads; retain only one derivation boundary plus the classification guard until final cutover.
- Burden accounting: selection authorities changed from several package/env/default paths to one canonical v2 authority; unknown legacy keys changed from possible fallback to explicit refusal; migration knowledge changed from implicit search results to a per-reference owner/destination ledger; observability improved through bounded consumer evidence.
- Displacement audit: interpretation reduced by explicit classifications; operator burden reduced by the deterministic guard; runtime failure handling remains fail-closed; maintenance and migration burden are explicit under tasks 2215/2219; monitoring and debugging improved through structured telemetry and full ledger readback; no burden moved into prompts, hidden policy, or operator memory.
- Outcome: accepted. The remaining compatibility boundary is conditionally load-bearing only until task 2219 consumes zero-consumer evidence and removes it.

Primary implementation surfaces include `packages/invokable-intelligence-management/src/legacy.ts`, its management tests/fixture, `scripts/intelligence-legacy-consumer-inventory.mjs` and its tests, package/runtime/launcher negative boundaries, and removal of `packages/carrier-provider-contract`.

## Verification

- `node --test scripts/intelligence-legacy-consumer-inventory.test.mjs`: passed 5/5; execution `e_939a4bdf283f4a86b8ee2bb4`.
- Full `pnpm run narada:guard-intelligence-zero-consumer`: passed with an inspectable 286-row reference ledger and zero authoritative consumers; execution `e_e52d0bfa5a844cc490e17e8f`.
- Focused provider/runtime/management/gateway/Cloudflare/agent-start suites passed in the submitted report; fresh launcher/fabric/gateway remediation executions include `e_2624af08d2b44cac9ddcccf2`, `e_9835d2b590474394ad966ef6`, and Smart Scheduling smoke `e_8f59fafbc2284367899c85a8`.
- User Site launcher doctrine now describes registry runtime bindings, optional JSON compatibility projections, and distinct Site/workspace/dependency roots; cross-Site coherence is rerun before final review.

## Acceptance Criteria

- [x] Every compatibility value is derivable from canonical v2 state and is marked read-only/deprecated.
- [x] Production compatibility reads emit bounded consumer evidence without leaking secrets.
- [x] Repository inventory names every consumer and its destination migration task.
- [x] Unknown legacy keys fail explicitly rather than falling back.
- [x] A deterministic zero-consumer check is available to final cutover.
