# Plan live Site Registry relation publication capability as a separate guarded follow-up

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1475-1481-separate-site-telemetry-from-site-registry.md

## Goal

Create the follow-up task or deferral for live registry relation publication after dry-run planner exists.

## Context

Live registry mutation requires registry-owner/operator capability and a relation admin token binding. This should not be smuggled into the dry-run planner.

## Required Work

1. Inspect current Cloudflare secret/capability posture for relation admin token without exposing secret values.
2. Decide whether live publication is locally admissible now or must be deferred.
3. If admissible, create a task for guarded live publish implementation using capability refs only.
4. If not admissible, record exact blocker and operator command needed to bind or approve the capability.
5. Keep narada-andrey publication pending until the live registry-owner crossing exists.

## Non-Goals

- Do not run live relation transition.
- Do not create or rotate Cloudflare secrets.
- Do not record raw token material.

## Execution Notes

Live Site Registry relation publication is not locally admissible yet.

Evidence gathered without exposing secret values:

- `narada capability list --format json` returned zero capability grants.
- Local environment presence check reported `NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN`, `NARADA_SITE_REGISTRY_RELATION_WITHDRAW_TOKEN`, and `NARADA_SITE_REGISTRY_ADMIN_TOKEN` as not present. Values were not printed.
- `narada capability credential-preflight --site narada-proper --principal narada.builder --kind site_registry.relation.admin --operation bind_existing_secret --credential-ref config-ref:NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN --local-env NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN --by narada.builder --format json` returned `local_env_status=missing`, `raw_secret_exposed=false`, and `mutation_performed=false`.
- Task 1479, the dry-run planner task, was still claimed by `narada.architect` and not reported closed at inspection time, even though the planner command and tests exist locally.

Decision:

- Deferred live publication rather than creating a guarded live-publish implementation task now.
- Kept narada-andrey publication pending until a registry-owner crossing and relation admin credential/capability binding exist.
- Performed no live relation transition, no Cloudflare D1/KV mutation, and no secret creation or rotation.
- Preserved the separation: `site-telemetry publish` is not the relation lifecycle publication path; the future path is `site-registry relation publish-transition` after live capability admission.

Actionable unblock commands for an operator/Architect, with capability refs only and no raw token values:

```powershell
narada capability bind-credential --site narada-proper --principal narada.architect --kind site_registry.relation.admin --credential-ref config-ref:NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN --local-env NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN --allow site_registry_relation_publish_transition --evidence-ref <operator-approval-ref> --rationale "Registry-owner relation publication for hosted Site Registry" --by narada.architect --format json
```

```powershell
narada capability credential-preflight --site narada-proper --principal narada.architect --kind site_registry.relation.admin --operation bind_existing_secret --credential-ref config-ref:NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN --local-env NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN --by narada.architect --format json
```

After the binding/preflight passes, finish or report task 1479. Only then should a future guarded live-publish task use:

```powershell
narada site-registry relation publish-transition --live --payload-file <file>
```

## Verification

- Read `docs/product/site-registry-relation-publication-surface.v0.md` and confirmed live `publish-transition` requires `--live`, an active registry-owner capability, credential-ref resolution through an approved resolver, local evidence/transition policy, and idempotency.
- Read `packages/layers/cli/src/commands/site-registry.ts` and confirmed the current implementation is a dry-run planner that validates payload shape and rejects raw secret markers without network or secret resolution.
- Read `packages/layers/cli/test/commands/site-registry.test.ts` and confirmed coverage for valid planning, missing evidence, and raw secret rejection.
- Inspected `packages/site-registry-cloudflare/wrangler.jsonc` and `wrangler.example.jsonc`; the relation admin token is documented as a Worker secret and was not read as a value.
- Ran credential/capability checks listed in Execution Notes; all kept secret values unobserved.
- Deferral report recorded as `wrr_e7e85c5b_20260517-1480-plan-live-site-registry-relation-publication-capability-as-a_narada.builder`.

## Acceptance Criteria

- [x] Live publish posture is exact: task created or deferral recorded.
- [x] No live external mutation is performed.
- [x] Credential/capability blocker is bounded and actionable.
