---
number: 2218
governed_by: task_close:019f7e38-2b97-7610-8d9c-d30e1b505f3d
status: closed
tags: cloudflare, invokable-intelligence, live-e2e, runtime
creation_payload_ref: mcp_payload:invokable-intelligence-cloudflare-runtime-v2@v1
creation_payload_sha256: d3f108c6b00b787312830d907ef906bf3fcec14fa37a39f39b7359805023f6c2
idempotency_key: invokable-intelligence-cloudflare-runtime-v2
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":"D:\\code\\narada","site_root":"D:\\code\\narada","correlation_key":"invokable-intelligence-cloudflare-runtime-v2"}
amended_by: operator
amended_at: 2026-07-20T17:16:35.774Z
deferred_by: operator
deferred_at: 2026-07-20T17:22:17.617Z
defer_reason: Lifecycle dependency gate is stale: required tasks are closed but legacy dependency outcome rows were not admitted.
unblock_condition: Explicit operator evidence that prerequisites 2216 and 2217 are closed and the implementation work may begin.
continuation_packet:
  kind: task_unblock
  unblocked_by: operator
  unblocked_at: 2026-07-20T17:22:37.711Z
  evidence: Verified in the canonical compatibility lifecycle readback on 2026-07-20: task 2216 is closed, task 2217 is closed, and legacy prerequisite tasks 2208, 2209, 2210, and 2213 are also closed. Task 2218 spec now declares dependencies [2216, 2217]; begin the sole owned Cloudflare implementation and retain the legacy dependency-outcome audit residual.
  rationale: The awaiting-dependencies state was stale because closed prerequisite statuses lacked legacy outcome rows; explicit operator evidence authorizes this task to re-enter opened work while preserving that residual.
  previous_unblock_condition: Explicit operator evidence that prerequisites 2216 and 2217 are closed and the implementation work may begin.
unblocked_by: operator
unblocked_at: 2026-07-20T17:22:37.711Z
unblock_evidence: Verified in the canonical compatibility lifecycle readback on 2026-07-20: task 2216 is closed, task 2217 is closed, and legacy prerequisite tasks 2208, 2209, 2210, and 2213 are also closed. Task 2218 spec now declares dependencies [2216, 2217]; begin the sole owned Cloudflare implementation and retain the legacy dependency-outcome audit residual.
unblock_rationale: The awaiting-dependencies state was stale because closed prerequisite statuses lacked legacy outcome rows; explicit operator evidence authorizes this task to re-enter opened work while preserving that residual.
closed_at: 2026-07-20T21:21:56.695Z
closed_by: 019f7e38-2b97-7610-8d9c-d30e1b505f3d
closure_mode: peer_reviewed
---

# Integrate canonical intelligence resolution into the Cloudflare carrier

## Goal

Make each Cloudflare invocation acquire D1/request-scoped inputs, resolve and revalidate an explicit offering/route, and persist conformant result/outcome/evidence.

## Context

Depends on canonical migration and materialization adapters. This task is the sole owner of authenticated Cloudflare live E2E; it keeps operator-session authentication separate from intelligence selection and provider execution.

## Required Work

Use D1-backed canonical catalog/materializations and verified request-scoped context as resolver inputs.
Represent the Worker carrier, runtime, Workers AI binding or remote adapter, account/grants, service, endpoint, and boundaries in the selected topology.
Remove CLOUDFLARE_CARRIER_AI_MODEL and hardcoded default-model authority while retaining secret/auth transport bindings.
Persist conformant v2 snapshots, attempts, results/outcomes, observations/evidence, telemetry, and unknown-admission states.
Own Worker tests and one authenticated live E2E covering success, resolver refusal, provider failure, acknowledgment uncertainty, retry, and evidence readback.

## Non-Goals

Do not treat Wrangler login as operator-session or invocation authorization.
Do not create a Cloudflare-specific ontology/resolver fork.
Do not own local runtime behavior or E2E.
Do not retain model-selection environment fallback.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by operator at 2026-07-20T17:11:20.033Z: dependencies
- Amended by operator at 2026-07-20T17:16:35.774Z: dependencies
- Added the dedicated `principal:cloudflare-carrier-service` workload principal, scoped Workers AI grant, budget, consent, site binding, and materialization scope. The human `principal:admin` remains a separate semantic actor.
- Moved the production default to the D1-backed canonical catalog offering `model:kimi-k2.7-code` / `@cf/moonshotai/kimi-k2.7-code`; runtime selection remains catalog/materialization driven and no model environment variable is authoritative.
- Fixed Cloudflare AI transport adaptation to emit OpenAI function-tool envelopes and to normalize nested provider tool calls without changing Narada's internal capability schema.
- Fixed deployment fail-closed behavior for rejected materializations and fixed D1 refresh auditing so an applied projection cannot exist without a matching applied audit event. Applied and rejected audit event identifiers are distinct.
- Published catalog/materialization/deployment revision 4 and initially deployed Worker version `b63c6372-3be9-4d00-b052-3dcf7df42073`.
- Added a service-principal-only live diagnostic lane for resolver refusal, provider failure, provider recovery, and acknowledgment uncertainty. It is now explicitly disabled by default through `CLOUDFLARE_CARRIER_ENABLE_INTELLIGENCE_DIAGNOSTICS=0`; enabled diagnostic deployments mark synthetic outcomes and never claim provider transport submission. Ordinary service requests execute through the real Workers AI binding.
- Repaired retry/replay live coverage by making the recovery diagnostic deterministic and preserving the request-scoped invocation operation key. This prevents provider tool-loop input-digest conflicts and prevents unrelated sessions from replaying a shared operation.
- Deployed the hardened default as Worker version `bca80e2b-97bc-4f08-b615-45cb4fb1bbee` and passed live smoke session `carrier_session_live_smoke_20260720220132`: ordinary provider success through real transport, linked evidence readback, task persistence, and a diagnostic-disabled refusal probe. The earlier diagnostic matrix remains explicitly classified as synthetic post-admission coverage.
- Changed files owned by this task include the Cloudflare catalog generator and generated artifacts, Cloudflare intelligence resolution/management/Worker/carrier paths and tests, the invokable-intelligence materialization core, and the management deployment/service paths.

## Verification


- pnpm --filter @narada2/invokable-intelligence-materialization test: passed 5/5
- node --test scripts/cloudflare-intelligence-deploy.test.mjs src/cloudflare-intelligence-resolution.test.mjs src/cloudflare-intelligence-management-api.test.mjs (packages/cloudflare-carrier): passed 22/22
- pnpm --filter @narada2/cloudflare-carrier test: passed 767/767
- pnpm --filter @narada2/cloudflare-carrier deploy:dry-run: passed; 1784.42 KiB Worker bundle includes canonical D1 registry, AI, and task bindings, diagnostics default `0`, and no model environment binding
- pnpm cloudflare:intelligence:deploy -- --url https://narada-cloudflare-carrier.andrei-kokoev.workers.dev --token-file D:\tmp\narada-cloudflare-carrier-service-token.txt: passed; revision 4 accepted, 27 catalog records, 3 materializations, diagnostics empty
- pnpm --filter @narada2/cloudflare-carrier smoke:live -- --url https://narada-cloudflare-carrier.andrei-kokoev.workers.dev --token-file D:\tmp\narada-cloudflare-carrier-service-token.txt --site site_narada_cloudflare --operation operation_narada_cloudflare_control --site-root cloudflare://narada-cloudflare-carrier --expect-tool-effect-posture configured: passed; completed turn, provider success, evidence readback, task create/update persistence
- node --test src/cloudflare-carrier.test.mjs src/cloudflare-intelligence-resolution.test.mjs scripts/cloudflare-carrier-live-smoke.test.mjs (packages/cloudflare-carrier): passed 113/113, including default-deny diagnostics, synthetic event posture, and canonical outcome assertions
- pnpm --filter @narada2/cloudflare-carrier smoke:live -- --url https://narada-cloudflare-carrier.andrei-kokoev.workers.dev --token-file D:\tmp\narada-cloudflare-carrier-service-token.txt --site site_narada_cloudflare --operation operation_narada_cloudflare_control --site-root cloudflare://narada-cloudflare-carrier --expect-tool-effect-posture configured --format text: passed in `carrier_session_live_smoke_20260720220132`; real provider success and `enabled=false posture=diagnostic-disabled-by-runtime-configuration disabled_probe_checked=checked`
- Earlier diagnostic-enabled smoke session `carrier_session_live_smoke_20260720211118`: passed synthetic resolver/provider/uncertainty/retry/replay state-machine coverage; provider transport was not exercised for those injected branches.
- remote D1 projection and materialization-audit readback: passed; all three revision-4 projections active and all three matching refresh audit events applied
## Acceptance Criteria

- [x] Deployed carrier resolves offering and route from D1/admitted request context without `CLOUDFLARE_CARRIER_AI_MODEL`.
- [x] Authentication, resolver, access, topology, adapter, provider, timeout, and acknowledgment uncertainty have distinct reason codes.
- [x] Equivalent canonical inputs have conformant semantics while preserving structurally different Cloudflare topology.
- [x] Retry/replay cannot duplicate or overwrite prior attempts/results.
- [x] The single owned authenticated Cloudflare live E2E emits linked canonical records and readback evidence.

Known residuals: the operator-session cookie is expired and was not used for this service-bearer verification; the full invokable-intelligence-management test package still has legacy migration fixture failures requiring validated trust-policy/network-path evidence, unrelated to this Cloudflare runtime path; legacy dependency-outcome rows for closed prerequisite tasks remain as previously recorded.
