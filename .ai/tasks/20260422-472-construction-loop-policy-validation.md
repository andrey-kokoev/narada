---
status: closed
depends_on: [470, 471]
---

# Task 472 — Construction Loop Policy File + Validation

## Context

Task 470 defined the construction loop policy schema, default values, and validation rules. Task 471 implements the plan command that consumes the policy. This task hardens the policy surface: documentation, validation, and first-run setup.

## Goal

Make the construction loop policy a durable, documented, validated configuration artifact.

## Required Work

### 1. Document policy schema

Create `.ai/construction-loop/README.md`:
- Policy purpose and authority (operator-owned configuration)
- Full schema documentation with field descriptions
- Versioning rules (schema version 1 for v0)
- Example policy files (minimal, default, strict)
- Migration notes for future schema versions

### 2. Harden policy validation

In `packages/layers/cli/src/lib/construction-loop-policy.ts` (created in Task 471):
- Add `validatePolicyDeep(policy)` that checks cross-field constraints:
  - `max_simultaneous_assignments` ≥ `max_tasks_per_cycle`
  - `blocked_task_ranges` do not overlap
  - `blocked_agent_ids` and `preferred_agent_ids` are disjoint
  - `ccc_influence_weight` is 0.0–1.0
  - `stale_agent_timeout_ms` ≥ 60_000
- Add `mergePolicy(base, overrides)` for partial policy updates
- Return structured validation errors with field paths

### 3. Add policy CLI subcommand

Add to `construction-loop` command group:

```bash
narada construction-loop policy show [--format json|human]
narada construction-loop policy init [--strict]
narada construction-loop policy validate
```

- `show`: Display current policy
- `init`: Create default policy file (with `--strict` for tightened defaults)
- `validate`: Validate existing policy and report errors

### 4. Add policy tests

Create `packages/layers/cli/test/commands/construction-loop-policy.test.ts` covering:
- Default policy loads and validates
- Invalid field types are rejected
- Cross-field constraints are enforced
- `mergePolicy` applies overrides correctly
- `init --strict` produces stricter defaults
- `validate` reports all errors, not just first

### 5. Update docs

Update `docs/governance/task-graph-evolution-boundary.md` §11 with policy reference.

## Non-Goals

- Do not implement policy auto-migration from v0 to v1.
- Do not add policy editor UI.
- Do not make policy authoritative over task governance (it is operator config, not authority).
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] `.ai/construction-loop/README.md` documents the full schema.
- [x] Policy validation checks all fields and cross-field constraints.
- [x] `narada construction-loop policy show/init/validate` exist.
- [x] `init --strict` produces a stricter variant of the default policy.
- [x] Validation returns structured errors with field paths.
- [x] Focused tests cover validation, merging, and CLI commands.
- [x] No derivative task-status files are created.

## Suggested Verification

```bash
pnpm --filter @narada2/cli exec vitest run test/commands/construction-loop-policy.test.ts
pnpm --filter @narada2/cli typecheck
npx tsx scripts/task-graph-lint.ts
find .ai/tasks -maxdepth 1 -type f \( -name '*-EXECUTED.md' -o -name '*-DONE.md' -o -name '*-RESULT.md' -o -name '*-FINAL.md' -o -name '*-SUPERSEDED.md' \) -print
```

## Execution Notes

### Implementation Summary

Task 472 hardened the construction-loop policy surface created by Task 471:

- Added `.ai/construction-loop/README.md` with policy purpose, authority, schema fields, versioning, examples, and CLI usage.
- Added deep policy validation through `validatePolicyDeep()` in `packages/layers/cli/src/lib/construction-loop-policy.ts`.
- Added `strictPolicy()` and `mergePolicy()` helpers.
- Added `narada construction-loop policy show/init/validate` command surfaces in `packages/layers/cli/src/commands/construction-loop.ts` and wired them through `main.ts`.
- Added focused tests in `packages/layers/cli/test/commands/construction-loop-policy.test.ts`.
- Updated `docs/governance/task-graph-evolution-boundary.md` with construction-loop policy commands.

### Verification

- `pnpm --filter @narada2/cli exec vitest run test/commands/construction-loop-policy.test.ts` — focused policy tests pass.
- `pnpm --filter @narada2/cli typecheck` — clean.
- `npx tsx scripts/task-graph-lint.ts` — no new task graph errors reported by the executor.
- `find .ai/tasks -maxdepth 1 ...` — no derivative task-status files.
