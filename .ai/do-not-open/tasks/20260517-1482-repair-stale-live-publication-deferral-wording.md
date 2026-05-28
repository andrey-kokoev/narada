---
status: confirmed
depends_on: [1475, 1476, 1477, 1478, 1479, 1481]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-17T21:23:14.949Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1779052956320_s1cirx
closed_at: 2026-05-17T21:23:31.388Z
closed_by: narada.builder2
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Repair stale live-publication deferral wording

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1482-1484-remaining-coherence-cleanup-after-site-registry-split.md

## Goal

Remove the stale claim in task 1480 that the dry-run planner task is still claimed, while preserving the real live-publication blocker.

## Context

Task 1480 was deferred before task 1479 closed. Its current deferral record still says 1479 was claimed and not reported closed, which is now false. The actual blocker is capability and credential admission for live Site Registry relation publication.

## Required Work

1. Read task 1480 and the closure decision for chapter 1475-1481.
2. Amend task 1480 through the governed task surface or the smallest admitted projection repair so the blocker no longer depends on stale 1479 status.
3. Preserve the correct residual: live publish remains pending on registry-owner relation capability and relation admin credential binding.
4. Verify task 1480 still refuses live mutation and raw secret exposure.
5. Record evidence that no live Cloudflare mutation or secret read occurred.

## Non-Goals

- Do not unblock or execute live relation publication.
- Do not invent capability grants.
- Do not record raw token material.

## Execution Notes

- Inspected task 1480 and confirmed its deferral packet still contained stale wording from before task 1479 closed.
- Attempted the governed `narada task defer 1480` path first. It correctly refused to re-defer an already deferred task and performed no mutation.
- Applied the smallest compatibility-projection repair to task 1480: removed the stale claim that 1479 was still claimed/unreported, stated that 1479 is now closed/confirmed, and preserved the actual live-publication blocker as registry-owner relation capability plus relation admin credential binding.
- No live relation publication, Cloudflare D1/KV mutation, secret creation/rotation, or raw secret read was performed.

## Verification

- `narada task read 1479 --format json --cwd D:\code\narada` reported task 1479 status `confirmed`.
- `narada capability list --format json --cwd D:\code\narada` reported zero grants and no mutation.
- `narada capability credential-preflight --site narada-proper --principal narada.architect --kind site_registry.relation.admin --operation bind_existing_secret --credential-ref config-ref:NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN --local-env NARADA_SITE_REGISTRY_RELATION_ADMIN_TOKEN --by narada.architect --format json --cwd D:\code\narada` reported `local_env_status=missing`, `mutation_performed=false`, `raw_secret_exposed=false`, and `secret_values_stored=false`.
- `rg "still claimed|not reported closed|finish task 1479|finish or report task 1479" .ai/do-not-open/tasks/20260517-1480-plan-live-site-registry-relation-publication-capability-as-a.md` found no stale blocker text.
- `narada test-run run --task 1482 --cmd 'rg -q "registry-owner relation capability plus relation admin credential binding" .ai/do-not-open/tasks/20260517-1480-plan-live-site-registry-relation-publication-capability-as-a.md'` passed as `run_1779052979648_ac4ozc`.
- `narada test-run run --task 1482 --cmd "narada capability credential-preflight ..."` passed as `run_1779052956320_s1cirx`.

## Acceptance Criteria

- [x] Task 1480 no longer states that task 1479 is still claimed or unreported.
- [x] Task 1480 still records the real live-publication capability and credential blocker.
- [x] No live external mutation or raw secret exposure occurs.
