---
status: closed
closed_at: 2026-05-16T00:50:08.724Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Authority inversion risk: site-registry-locus-authority

## Chapter

Canonical Inbox Promotions

## Goal

Mutation commands do not yet share a common preflight that classifies cwd as authority locus, stale clone, read-only embodiment, or unknown.

## Context

Source inbox envelope: env_29c5f1b3-ee28-493b-87c0-d527abd602ca

Source: system_observation:coherence-scan:authority-inversion-site-registry-locus-authority

Envelope kind: task_candidate

Summary: Mutation commands do not yet share a common preflight that classifies cwd as authority locus, stale clone, read-only embodiment, or unknown.

Evidence:
- visible_artifact=Site registry rows, config files, cwd, and clone path
- hidden_authority=A Site mutation must resolve to the declared authority locus; other clones/shells are read embodiments unless routed.
- current_guard=Site doctor, governed locus federation doctrine, plural embodiment doctrine.
- candidate_tasks=1001,1002

Recurrence severity: medium
Recurrence key: task_candidate:system_observation:coherence-scan:authority-inversion-site-registry-locus-authority
Prior related envelopes: env_ccd5e3fd-e00a-463f-9073-134efe79bb99

## Required Work

0. Source summary: Mutation commands do not yet share a common preflight that classifies cwd as authority locus, stale clone, read-only embodiment, or unknown.
1. Read source inbox envelope env_29c5f1b3-ee28-493b-87c0-d527abd602ca and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Read the promoted inbox context for env_29c5f1b3-ee28-493b-87c0-d527abd602ca from mutation evidence. The authority concern is the Site mutation boundary: task, inbox, publication, secret, and Site lifecycle writes must be classified against the declared authority locus instead of trusting cwd/clone path.
- Reused the existing Site mutation authority preflight classifier rather than adding another locus check. `siteMutationAuthorityPreflightCommand` now delegates to exported `inspectSiteMutationAuthorityPreflight`, so command surfaces can share the same classification without CLI formatting.
- Wired `work-next` doctrine guard to call the shared task-lifecycle preflight and expose `mutation_authority_preflight` with `mutation_family`, `locus_state`, `mutation_safety`, `next_safe_command`, and `reason`. Refuse states become doctrine blockers; inspect-only states surface the next safe command.
- Added tests proving the classifier is callable directly and that `work-next` surfaces the shared task-lifecycle preflight in its doctrine guard.
- Files changed for this task: `packages/layers/cli/src/commands/site-mutation-authority-preflight.ts`, `packages/layers/cli/src/commands/work-next.ts`, `packages/layers/cli/test/commands/site-mutation-authority-preflight.test.ts`, `packages/layers/cli/test/commands/work-next.test.ts`.
- Note: `work-next.ts` and `work-next.test.ts` already contained unrelated review-duty edits in this worktree; they were preserved.

## Verification

- `NARADA_GIT_BINARY=git pnpm vitest run packages/layers/cli/test/commands/site-mutation-authority-preflight.test.ts` passed: 6 tests.
- `NARADA_GIT_BINARY=git pnpm vitest run packages/layers/cli/test/commands/work-next.test.ts` passed: 29 tests.
- `pnpm --filter @narada2/cli build` passed.

## Acceptance Criteria

- [x] Source inbox envelope env_29c5f1b3-ee28-493b-87c0-d527abd602ca is handled through a governed task handoff.
- [x] Implementation does not bypass Narada authority boundaries.
- [x] Verification evidence is recorded before closure.
- [x] Residuals or blockers are reported explicitly.
