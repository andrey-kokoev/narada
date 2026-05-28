---
status: closed
depends_on: [1469, 1470]
amended_by: narada.architect
amended_at: 2026-05-17T20:37:23.627Z
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-17T20:43:18.306Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1779050565307_ectrjv
closed_at: 2026-05-17T20:43:35.675Z
closed_by: narada.builder2
governed_by: task_close:narada.builder2
closure_mode: peer_reviewed
---

# Admit narada-andrey route addressability without standing send consent

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1469-1474-principled-narada-andrey-cross-site-inbox-route.md

## Goal

Create the source-local routing-addressing record for `site:narada-andrey` only as addressability, backed by explicit coordinate evidence.

## Context

Addressability admission follows identity resolver repair and route contract correction. It is a prerequisite for any future route-mediated retry, not downstream of deferred task 1467.

## Required Work

1. Verify target root exists and target config still reports `static_config.site_id=narada-andrey`.
2. Add a route through `narada routing add` with `target-kind site`, `target-ref narada-andrey`, `authority-locus narada-andrey:canonical_inbox`, `address-kind site_root`, `transport filesystem`, and `capability-kind canonical_inbox_cross_site_submission`.
3. Use evidence refs from the direct target inbox delivery decision and target config readback.
4. Run `narada routing resolve --target-kind site --target-ref narada-andrey --format json` and record the selected route.
5. Do not add capability grant in this task.

## Non-Goals

- Do not grant reusable cross-Site submission authority.
- Do not send any inbox envelope.
- Do not infer target consent from route addressability.

## Execution Notes

- Amended by narada.architect at 2026-05-17T20:37:23.627Z: context, dependencies
- Verified target config at `C:\Users\Andrey\Narada\config.json` still carries `static_config.site_id = narada-andrey`, `site_root = C:\Users\Andrey\Narada`, and `authority_locus = user`.
- Added source-local addressability route `route_1c33db5b-d527-4b45-aa6b-f917ddb7c45c` in `.ai/routing-addressing-registry.json`.
- Route fields: `target_kind=site`, `target_ref=narada-andrey`, `authority_locus=narada-andrey:canonical_inbox`, `address_kind=site_root`, `address_ref=C:\Users\Andrey\Narada`, `transport=filesystem`, `capability_kind=canonical_inbox_cross_site_submission`.
- The routing schema has one `evidence_ref` field; the route carries the target config readback evidence. The direct delivery decision remains task evidence: `.ai/decisions/2026-05-17-narada-andrey-direct-target-inbox-delivery.md`.
- Did not create a capability grant; route addressability remains separate from send authority.
- MCP fabric read-only route resolution by `target.ref=narada-andrey` selects the new route. The currently running MCP carrier still reports target Site identity from stale resolver code (`Narada`), so corrected target identity requires carrier refresh/restart even though route selection is now present.

## Verification

- `narada test-run run --task 1471 --cmd 'rg -n "site_id|site_root|authority_locus" C:\Users\Andrey\Narada\config.json' --scope focused --requester narada.architect --rationale 'Verify target root config still identifies narada-andrey.' --cwd D:\code\narada` passed as `run_1779050560830_fv4q7i`.
- `narada test-run run --task 1471 --cmd 'narada routing resolve --target-kind site --target-ref narada-andrey --format json --cwd D:\code\narada' --scope focused --requester narada.architect --rationale 'Verify source-local route resolves for site:narada-andrey.' --cwd D:\code\narada` passed as `run_1779050565307_ectrjv`.
- `narada test-run run --task 1471 --cmd 'narada capability list --format json --cwd D:\code\narada' --scope focused --requester narada.architect --rationale 'Verify no capability grant was created by route addressability admission.' --cwd D:\code\narada` passed as `run_1779050573010_883jg6`.
- `narada_mcp_fabric_context` with `target.ref=narada-andrey` returned read-only route selection for `route_1c33db5b-d527-4b45-aa6b-f917ddb7c45c`; target Site identity in that live carrier remains stale until MCP refresh.

## Acceptance Criteria

- [x] Route record exists and resolves for `site:narada-andrey`.
- [x] Route evidence references coordinate/readback evidence.
- [x] No capability grant is created by this task.
- [x] MCP fabric can resolve the target route read-only after identity repair.
