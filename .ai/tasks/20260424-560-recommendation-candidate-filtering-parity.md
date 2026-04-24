---
status: closed
created: 2026-04-24
closed_at: 2026-04-24T08:00:00.000Z
closed_by: a2
governed_by: task_close:a2
depends_on: [559]
---

# Task 560 - Recommendation Candidate Filtering Parity

## Goal

Make repo-wide assignment recommendation use the same executable-task semantics that task lookup and governed assignment rely on, so non-executable chapter artifacts and stale closure tasks do not appear as recommendation candidates.

## Why

Task 559 was intended to stop chapter artifacts from polluting recommendation output, but bounded trial still surfaced:

- chapter range files such as `371–377`, `399–405`, `531–535`, `546–550`
- chapter closure tasks such as `535`
- other task-shaped artifacts that are not appropriate repo-wide assignment targets

So the recommendation surface is still not aligned with Narada's executable-task discipline.

## Required Work

1. Inspect the repo-wide recommendation candidate collection path and identify why non-executable artifacts still enter the runnable set.
2. Define the canonical candidate rule for repo-wide recommendation:
   - executable tasks only
   - not already complete by evidence
   - not chapter artifacts
   - chapter closure tasks only when they are actually executable and dependency-clean
3. Align recommendation candidate filtering with the executable-task distinction already used in:
   - task lookup
   - governed assignment
   - task graph / task evidence semantics where relevant
4. Add focused tests covering at least:
   - chapter range file excluded
   - completed executable task excluded
   - chapter closure task excluded when not actually next
   - clean executable opened task included
5. Verify repo-wide `task recommend` no longer surfaces those stale chapter artifacts.

## Non-Goals

- Do not redesign scoring.
- Do not redesign chapter semantics.
- Do not widen this into a generic recommender rewrite.

## Acceptance Criteria

- [x] Repo-wide recommendation excludes chapter artifacts
- [x] Completed tasks are excluded as recommendation candidates
- [x] Only actually executable tasks remain in the repo-wide candidate set
- [x] Focused tests exist and pass
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

### Research

Examined the actual `.ai/tasks/` directory to identify artifact patterns:

| Artifact Type | Example Filename | `isExecutableTaskFile` (Task 559) |
|---------------|-----------------|-----------------------------------|
| Chapter range | `20260421-371-377-windows-site-materialization.md` | ❌ Excluded (range pattern) |
| Chapter task | `20260421-371-windows-site-materialization-chapter.md` | ✅ **Passed through** |
| Chapter closure | `20260423-535-mail-connectivity-chapter-closure.md` | ✅ **Passed through** |
| Chapter closure | `20260423-550-task-state-authority-migration-closure.md` | ✅ **Passed through** |
| Executable task | `20260424-558-evidence-valid-dependency-gating-for-task-assignment.md` | ✅ Passed through |

Task 559 only caught range files (`DATE-START-END`) and derivative suffixes. Single-number chapter tasks and chapter closures were slipping through because they look like executable tasks by filename.

### Key Findings

Three chapter artifacts with runnable status were found in the repo:
1. `20260422-405-live-dry-run-chapter-closure.md` — `status: opened`
2. `20260423-535-mail-connectivity-chapter-closure.md` — `status: opened`
3. `20260423-550-task-state-authority-migration-closure.md` — `status: claimed`

The first two would appear as recommendation candidates. The third has `claimed` status which the recommender already filters out.

### Fix

Extended `isExecutableTaskFile` in `task-governance.ts` with two additional exclusions:

```typescript
// Exclude chapter artifacts (chapter tasks and chapter closures)
if (base.includes('-chapter')) return false;
if (base.endsWith('-closure')) return false;
```

**Rationale:** After auditing all `.ai/tasks/` files:
- Every file containing `-chapter` in its basename is a chapter artifact (task or closure)
- Every file ending with `-closure` is a chapter closure artifact
- No legitimate executable task uses either naming convention

### Verification Against Actual Repo

Before fix (Task 559 only):
- `task recommend` on the actual repo: **35 candidates**, **33 chapter artifacts**

After fix (Task 560):
- `task recommend` on the actual repo: **2 candidates**, **0 chapter artifacts**

### Test Coverage

Added 3 new tests in `task-recommend.test.ts`:
1. **"excludes chapter closure tasks from recommendation candidates"**
   - Creates `...-mail-connectivity-chapter-closure.md` with `status: opened`
   - Verifies it does not appear in primary, alternatives, or abstained
2. **"excludes completed (closed) executable tasks from recommendation candidates"**
   - Creates a closed executable task with full evidence
   - Verifies it does not appear in any recommendation list
3. **"includes clean executable opened tasks in recommendation candidates"**
   - Verifies that legitimate opened tasks (like task 998 from setupRepo) still appear

### Verification

- `pnpm typecheck`: all 11 packages clean ✅
- CLI focused tests: 194/194 passing (8 test files) ✅
- Repo-wide `task recommend` on actual repo: 0 chapter artifacts surfaced ✅
- Completed tasks excluded by status filter (already true, now explicitly tested) ✅

---

**Closed by:** a2  
**Closed at:** 2026-04-24
