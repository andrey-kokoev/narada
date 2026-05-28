---
status: closed
depends_on: [1464, 1465]
amended_by: narada.architect
amended_at: 2026-05-17T20:37:23.627Z
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-17T20:40:07.070Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1779050392246_x6y2ow
closed_at: 2026-05-17T20:41:20.597Z
closed_by: narada.builder2
governed_by: task_close:narada.builder2
closure_mode: peer_reviewed
---

# Correct narada-andrey route contract current posture and capability naming

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1469-1474-principled-narada-andrey-cross-site-inbox-route.md

## Goal

Update the route contract so it no longer says the registry request is undelivered and so it uses the canonical MCP capability kind.

## Context

The registry request is delivered directly to the target inbox, but the proper route remains absent. The route contract uses older shorthand cross_site_inbox.submit while the MCP facade enforces canonical_inbox_cross_site_submission. This contract correction is not downstream of deferred route-mediated retry task 1467; it is part of repairing the path that may later unblock route-mediated retry.

## Required Work

1. Update `docs/product/narada-andrey-mcp-inbox-route.v0.md` to use `canonical_inbox_cross_site_submission` as the canonical capability kind.
2. Mention `cross_site_inbox.submit` only as superseded shorthand if needed for historical context.
3. Correct current posture: original outbox item is directly delivered and confirmed; MCP route/capability is still absent until this chapter repairs it.
4. Keep the delivery/admission distinction explicit.

## Non-Goals

- Do not claim narada-andrey admitted the registry request.
- Do not claim the hosted registry registration is complete.
- Do not create route/capability state in documentation only.

## Continuation

Continuation Task: task 1471

## Execution Notes

- Amended by narada.architect at 2026-05-17T20:37:23.627Z: context, dependencies
- Updated `docs/product/narada-andrey-mcp-inbox-route.v0.md` to use `canonical_inbox_cross_site_submission` as the route capability kind.
- Kept `cross_site_inbox.submit` only as historical/superseded shorthand.
- Corrected current posture: narada-proper directly delivered the original request envelope to narada-andrey, while the reusable MCP route and capability grant remain absent.
- Preserved the delivery/admission distinction: direct target inbox delivery is not target Site admission and is not hosted registry completion.

## Verification

- `rg -n "cross_site_inbox.submit|canonical_inbox_cross_site_submission|Current Posture|undelivered|env_37e5cd13" docs/product/narada-andrey-mcp-inbox-route.v0.md` confirmed the canonical capability kind, historical-only shorthand note, current posture section, and delivered envelope evidence. The only remaining `undelivered` wording is in the target-unavailable failure-mode row.
- `git diff --check -- docs/product/narada-andrey-mcp-inbox-route.v0.md .ai/do-not-open/tasks/20260517-1470-correct-narada-andrey-route-contract-current-posture-and-cap.md` passed.
- Governed verification runs: `run_1779050392246_x6y2ow` and `run_1779050397246_xwanwv`.

## Acceptance Criteria

- [x] Contract uses the canonical capability kind.
- [x] Current posture matches direct delivery evidence.
- [x] No target admission or registry completion overclaim remains.
