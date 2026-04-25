---
status: closed
closed: 2026-04-24
closed_by: codex
governed_by: task_close:codex
created: 2026-04-23
depends_on: [547, 548]
---

# Task 549 - No-Duplication Enforcement Contract

## Goal

Define the enforcement rules that prevent the same task field from becoming independently authoritative in both SQLite and markdown.

## Required Work

1. Define which fields may appear in both places only as projections.
2. Define which fields must exist in exactly one authority source.
3. Define lint/operator/projection rules that prevent dual-authority drift.
4. State how human-readable markdown remains useful without reintroducing lifecycle authority there.
5. Write the enforcement artifact to `.ai/decisions/`.

## Acceptance Criteria

- [x] Enforcement artifact exists.
- [x] Dual-authority forbidden field set is explicit.
- [x] Projection-only overlap rules are explicit.
- [x] Human-readable markdown posture is explicit.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

### Research

Examined Decision 546 (Task State Authority Boundary Contract) for the field ownership split:
- 8 SQLite-authoritative lifecycle fields
- 10 markdown-authored specification fields
- 3 markdown survival models (Model A recommended: authored spec only)

### Enforcement Artifact

`.ai/decisions/20260424-549-no-duplication-enforcement-contract.md` (~13 KB) containing:

**Dual-authority forbidden field set:**
```
{ status, governed_by, closed_at, closed_by, reopened_at, reopened_by, continuation_packet, assignment_record_id }
```

**Lint rules (6 rules):**
- `LINT-DUAL-001` — forbidden fields in markdown front matter → Error
- `LINT-DUAL-002` — `status` drift between SQLite and markdown → Error
- `LINT-DUAL-003` — `governed_by` drift between SQLite and markdown → Error
- `LINT-DUAL-004` — orphan SQLite row without markdown → Warning
- `LINT-DUAL-005` — markdown file without SQLite row → Warning
- `LINT-DUAL-006` — Model B missing projection marker → Warning

**Operator guards (4 guards):**
- `GUARD-WRITE-001` — lifecycle operators write SQLite only
- `GUARD-WRITE-002` — report scaffolding stays in body, not front matter
- `GUARD-WRITE-003` — chapter-init stays within spec fields
- `GUARD-WRITE-004` — no dual-write in same transaction

**Projection layer rules (4 rules):**
- `PROJ-001` — read-only
- `PROJ-002` — Model B overwrites entire front matter block
- `PROJ-003` — strip generated fields before editing
- `PROJ-004` — cache invalidation by version

**Schema change gates (3 gates):**
- `SCHEMA-001` — explicit authority decision for new fields
- `SCHEMA-002` — update forbidden set for lifecycle fields
- `SCHEMA-003` — lint rules updated before deployment

**Human-readable markdown posture:**
- Body text, title, criteria remain fully editable
- Status and provenance shown via workbench/CLI, not in markdown (Model A)
- Existing closed tasks may retain historical front matter as non-breach artifacts

## Verification

```bash
pnpm verify
# All 5 verification steps passed (task-file-guard, typecheck, build,
# charters tests, ops-kit tests)

pnpm typecheck
# All packages pass
```

Results:
- `pnpm verify` passed all 5 verification steps
- `pnpm typecheck` clean across all packages
- No code changes required for this contract task
- No existing tests broken
- No new lint errors introduced

---

**governed_by: task_close:codex**
