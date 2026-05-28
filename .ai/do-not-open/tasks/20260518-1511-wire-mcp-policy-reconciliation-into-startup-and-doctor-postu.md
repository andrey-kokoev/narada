---
status: confirmed
depends_on: [1508]
no_continuation_needed_rationale: Scope complete: startup and MCP fabric posture now expose read-only policy reconciliation, repair uses the explicit reconciler, docs/tests are updated, and no additional continuation task is required for this bounded wiring slice.
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-18T15:51:11.593Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-18T15:51:12.027Z
closed_by: narada.builder
governed_by: chapter_close:narada.architect
closure_mode: agent_finish
---

# Wire MCP policy reconciliation into startup and doctor posture

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260518-1509-1511-mcp-policy-reconciliation.md

## Goal

Make future MCP policy drift visible before or during agent startup without treating drift checks as authority mutation.

## Context

A test guard catches drift in package verification, but operator-facing drift should be surfaced by startup/doctor posture. Startup should not silently launch with stale role policy when the expected projection and local config diverge.

## Required Work

1. Identify the appropriate startup or doctor surface for read-only MCP policy reconciliation status.
2. Add a read-only drift check that reports expected additions/removals and the exact repair command.
3. Ensure startup/doctor output distinguishes advisory drift detection from mutation authority.
4. Document the reconciliation posture and the repair command in the relevant product or concept doc.
5. Add tests proving startup/doctor surfaces report aligned, drifted, and malformed config states.

## Non-Goals

- Do not auto-repair during startup.
- Do not block unrelated read-only doctrine grounding when config drift is present unless launch policy explicitly requires blocking.
- Do not make local config the source of MCP implementation truth.

## Execution Notes

- Wired MCP role-policy reconciliation into `agent_context_startup_sequence` and `narada_mcp_fabric_context` as read-only advisory posture.
- Startup/fabric output now includes `mcp_policy_reconciliation` with status, exact additions/removals, validation errors, source reconciler result, and an explicit repair command: `narada-proper-mcp --site-root <siteRoot> --reconcile-mcp-policy --apply`.
- Kept startup/doctor-style posture non-mutating: `mutation_attempted: false`, `mutation_performed: false`, `auto_repair_performed: false`, and `authority_posture: read_only_drift_detection`.
- Broke an ESM runtime cycle by removing the `surface-registry.ts` import of `server.ts`; the registry now keeps an explicit exposed-tool list that tests compare against the live MCP tool list.
- Documented MCP role-policy reconciliation in `docs/concepts/narada-mcp-facade.md`, including why Site-local `config.json` is reconciled runtime posture rather than whole-config generation authority.
- Added startup posture tests for aligned config, drifted config, and malformed config.

## Verification

- `pnpm --filter @narada2/narada-proper-mcp typecheck` passed.
- `pnpm --filter @narada2/narada-proper-mcp test` passed: 38 tests.
- `pnpm --filter @narada2/narada-proper-mcp build` passed.
- Live read-only startup probe against `D:\code\narada` passed with `mcp_policy_reconciliation.status: aligned`, no additions/removals, no mutation, and repair command `narada-proper-mcp --site-root D:\code\narada --reconcile-mcp-policy --apply`.

## Acceptance Criteria

- [x] Startup or doctor posture reports MCP policy drift with exact additions/removals.
- [x] The reported repair path uses the reconciler, not hand-edit instructions.
- [x] Docs explain why reconciliation is preferred over whole-config generation for Site-local runtime config.
