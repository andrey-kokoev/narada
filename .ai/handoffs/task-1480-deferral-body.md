# Plan live Site Registry relation publication capability as a separate guarded follow-up

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

- Inspected `docs/product/site-registry-relation-publication-surface.v0.md`, task 1478, task 1479, Cloudflare runbook posture, and package configuration.
- Confirmed the dry-run planner code path exists in `packages/layers/cli/src/commands/site-registry.ts`, but task 1479 is still claimed and not reported/closed.
- Confirmed `packages/site-registry-cloudflare/wrangler.jsonc` exists and names live D1/KV coordinates, but this task did not use them for live mutation.
- Checked local process environment presence only, without printing values: `NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN`, `NARADA_SITE_REGISTRY_RELATION_WITHDRAW_TOKEN`, and `NARADA_SITE_REGISTRY_ADMIN_TOKEN` were not present.
- Ran capability list: the capability consent registry currently reports zero grants.
- Ran credential preflight for `config-ref:NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN`; it reported `local_env_status=missing`, `raw_secret_exposed=false`, and `remote_secret_mutation=false`.
- Decided live relation publication is not locally admissible now.
- Deferred this task. Keep narada-andrey publication pending until registry-owner crossing and relation admin credential binding exist.

## Exact Blocker

Live Site Registry relation publication is blocked by all of:

- no active capability grant for `site_registry.relation.admin`;
- no local runtime material for `NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN` in this process;
- task 1479 dry-run planner implementation is not yet reported/closed through task lifecycle.

## Operator Unblock Commands

After the operator has approved the registry-owner relation publication capability and ensured the relation admin token is bound in the owning runtime locus, record the credential reference without exposing the raw token:

```powershell
narada capability bind-credential --site narada-proper --principal narada.architect --kind site_registry.relation.admin --credential-ref config-ref:NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN --local-env NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN --allow site_registry_relation_publish_transition --evidence-ref <operator-approval-ref> --rationale "Registry-owner relation publication for hosted Site Registry" --by narada.architect --format json
```

Then re-run bounded preflight:

```powershell
narada capability credential-preflight --site narada-proper --principal narada.architect --kind site_registry.relation.admin --operation bind_existing_secret --credential-ref config-ref:NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN --local-env NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN --by narada.architect --format json
```

Also finish task 1479 through its governed report/review path before live publish implementation is admitted.

## Verification

- `narada capability list --format json` returned zero grants.
- `narada capability credential-preflight --site narada-proper --principal narada.builder --kind site_registry.relation.admin --operation bind_existing_secret --credential-ref config-ref:NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN --local-env NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN --by narada.builder --format json` returned `local_env_status=missing`, `raw_secret_exposed=false`, and `remote_secret_mutation=false`.
- Environment presence check reported the relation/admin token variables absent without printing values.
- No live relation transition, Cloudflare D1/KV mutation, secret creation, or secret rotation was performed.

## Acceptance Criteria

- [x] Live publish posture is exact: task created or deferral recorded.
- [x] No live external mutation is performed.
- [x] Credential/capability blocker is bounded and actionable.
