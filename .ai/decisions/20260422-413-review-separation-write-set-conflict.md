# Decision: Review Separation and Write-Set Conflict Design

**Date:** 2026-04-22
**Task:** 413
**Depends on:** 411 (Assignment Planner Design), 410 (Boundary Contract), 408 (Readiness)
**Chapter:** Construction Operation (410–415)
**Verdict:** **Design accepted. Implementation deferred to Task 414 fixture or follow-up implementation task.**

---

## 1. Review-Separation Check

### 1.1 Principle

> **A principal may not review a task on which they were the last active worker.**

This is a **hygiene check**, not an authority gate. The system warns; the operator decides whether to proceed. The check is deterministic and auditable.

### 1.2 Algorithm

```
FUNCTION checkReviewSeparation(task_id, reviewer_agent_id):

  1. LOAD assignment record for task_id
     assignment = loadAssignment(cwd, task_id)

  2. IF assignment is null:
       RETURN { valid: true, warning: null }
       // No assignment record means no worker to conflict with

  3. FIND the most recent active assignment entry
     last_active = assignment.assignments
       .filter(a => a.released_at == null)  // Still claimed
       .last()

     IF no active entry:
       last_active = assignment.assignments
         .filter(a => a.release_reason == 'completed')
         .sortBy(a => a.released_at, desc)
         .first()

  4. IF last_active is null:
       RETURN { valid: true, warning: null }

  5. IF last_active.agent_id == reviewer_agent_id:
       RETURN {
         valid: false,
         warning: "Reviewer was the last worker on this task",
         detail: {
           reviewer: reviewer_agent_id,
           worker: last_active.agent_id,
           claimed_at: last_active.claimed_at,
           released_at: last_active.released_at,
           release_reason: last_active.release_reason
         }
       }

  6. RETURN { valid: true, warning: null }
```

### 1.3 Edge Cases

| Case | Behavior |
|------|----------|
| Task never claimed | Check passes (no worker) |
| Task abandoned (not completed) | Last claimant is still the worker; check fails if same agent reviews |
| Task transferred | The transfer target is the last worker; check compares against reviewer |
| Multiple claims (one abandoned, one completed) | The most recent `completed` claim is the worker; earlier claims are ignored |
| Budget-exhausted release | Treat as `completed` for separation purposes (work was done) |
| Reviewer was worker on a *dependency* task | Check passes — separation applies only to the reviewed task itself |

### 1.4 Audit Trail

Every review-separation check is recorded in the review record (see §5). Even when the check passes, the record includes `separation_check: { checked: true, valid: true }`.

---

## 2. Write-Set Tracking Model

### 2.1 Principle

> **Each task declaration should include a manifest of files it intends to modify. The system compares manifests across active tasks to detect overlap.**

Write-set tracking is **manifest-based**, not git-diff-based. Agents declare intent; the system compares declarations. This avoids requiring git integration and keeps the model simple.

### 2.2 Write-Set Manifest

The write-set manifest is stored in the **assignment record**, not the task file. It is populated when the agent claims the task.

```typescript
interface WriteSetManifest {
  /** Files the agent intends to modify */
  declared_files: string[];

  /** Files the agent intends to create */
  declared_creates: string[];

  /** Files the agent intends to delete */
  declared_deletes: string[];

  /** Timestamp when the manifest was declared */
  declared_at: string;

  /** Whether the manifest was updated after initial claim */
  updated: boolean;

  /** Timestamp of last update */
  updated_at: string | null;
}
```

### 2.3 Manifest Declaration Flow

```
CLAIM PHASE:
  1. Agent claims task via narada task claim
  2. Agent (or operator) optionally provides --files <paths>
     --files may be:
       - a comma-separated list of relative paths
       - a glob pattern (e.g., "packages/layers/cli/src/commands/*.ts")
       - the literal "TBD" (manifest to be declared later)
  3. If --files is omitted, manifest defaults to { declared_files: ["TBD"], ... }

WORK PHASE:
  4. Agent may update the manifest at any time via:
     narada task update-manifest <task-number> --files <paths>
  5. The assignment record is updated with new paths and updated: true

RELEASE PHASE:
  6. On release, the manifest is preserved in the assignment record for audit
```

### 2.4 Manifest Heuristic (When Agent Does Not Declare)

If the agent does not declare a manifest, the system may infer one from:

| Signal | Inferred Path |
|--------|---------------|
| Task title contains "registry" | `packages/*/src/registry*` |
| Task title contains "CLI" | `packages/layers/cli/src/**/*` |
| Task title contains "test" | `**/test/**/*.test.ts` |
| Task references specific file in body | Extracted from `Required Reading` or `Write Set` sections |
| Task is a chapter-planning task | `.ai/do-not-open/tasks/*.md`, `.ai/decisions/*.md` |

These heuristics are **advisory** and produce broad globs. They are sufficient for coarse overlap detection.

### 2.5 Glob Normalization

Before comparison, paths are normalized:

1. Strip leading `./`
2. Resolve `../` segments
3. Convert to forward slashes
4. Expand globs to concrete paths (if the paths exist in the working tree)

If a glob cannot be expanded (e.g., references a not-yet-created file), the raw glob string is used for comparison. Two globs that could match the same path are flagged as overlapping.

---

## 3. Conflict Detection Algorithm

### 3.1 Input

- All **active** assignments (status `claimed`, not yet released)
- Each assignment has a `WriteSetManifest`

### 3.2 Overlap Detection

```
FUNCTION detectWriteSetConflicts(active_assignments):

  conflicts = []

  FOR each pair (a, b) in active_assignments WHERE a.task_id < b.task_id:

    overlap_a = expand_manifest(a.manifest)
    overlap_b = expand_manifest(b.manifest)

    // Direct path overlap
    common_files = intersection(overlap_a.files, overlap_b.files)
    IF common_files is not empty:
      conflicts.push({
        type: "file_overlap",
        task_a: a.task_id,
        task_b: b.task_id,
        agent_a: a.agent_id,
        agent_b: b.agent_id,
        overlapping_files: common_files,
        severity: "warning"
      })

    // Create/delete conflict: one creates what another deletes
    created_by_a = overlap_a.creates
    deleted_by_b = overlap_b.deletes
    IF intersection(created_by_a, deleted_by_b) is not empty:
      conflicts.push({
        type: "create_delete_conflict",
        task_a: a.task_id,
        task_b: b.task_id,
        agent_a: a.agent_id,
        agent_b: b.agent_id,
        conflicting_paths: intersection(created_by_a, deleted_by_b),
        severity: "warning"
      })

  RETURN conflicts
```

### 3.3 Severity Classification

| Severity | Condition | Action |
|----------|-----------|--------|
| `warning` | Any file overlap between active assignments | Surface to operator console; do not block |
| `warning` | Create/delete conflict | Surface to operator console; do not block |
| `info` | Overlap with a task that has `declared_files: ["TBD"]` | Note that overlap is unverified |

### 3.4 Conservative Principle

> **False positives are acceptable; false negatives are not.**

- If two globs *might* match the same file, flag as overlapping.
- If a manifest is `TBD`, assume it *could* overlap with everything (flag as unverified).
- Never suppress a warning because the overlap "seems unlikely."

---

## 4. Warning / Escalation Rules

### 4.1 Review-Separation Warning

**Trigger:** `checkReviewSeparation()` returns `valid: false`.

**Behavior:**

```
IF review-separation check fails:
  LOG structured warning to stderr / console
  IF format == human:
    PRINT: "⚠ Warning: {reviewer} was the last worker on {task}."
    PRINT: "   Review may be compromised. Operator may override."
  IF format == json:
    INCLUDE warning object in response

  DO NOT prevent review creation
  DO NOT prevent task status transition
  RECORD separation_check result in review record

  IF operator proceeds despite warning:
    review_record.separation_check.override = true
    review_record.separation_check.override_reason = operator-provided or "proceeded despite warning"
```

### 4.2 Write-Set Conflict Warning

**Trigger:** `detectWriteSetConflicts()` returns non-empty conflicts.

**Behavior:**

```
FOR each conflict:
  LOG structured warning
  IF format == human:
    PRINT: "⚠ Write-set overlap: {task_a} and {task_b} both touch:"
    FOR file in overlapping_files:
      PRINT: "   - {file}"
  IF format == json:
    INCLUDE conflicts array in response

  DO NOT block claims
  DO NOT block releases
  SUGGEST to operator: "Consider re-sequencing or re-scoping these tasks"
```

### 4.3 Escalation Path

If warnings are repeatedly ignored and downstream issues occur (merge conflicts, test failures, semantic drift), the operator may:

1. Run `narada task lint --strict` to surface all unresolved warnings
2. Add a finding to the review record documenting the ignored warning
3. Update the task's `required_capabilities` or `continuation_affinity` to prevent future mispairing

---

## 5. Review Record Schema Extension

The existing `ReviewRecord` schema (from `task-governance.ts`) is extended with an optional `separation_check` field.

```typescript
interface ReviewRecord {
  review_id: string;
  reviewer_agent_id: string;
  task_id: string;
  findings: ReviewFinding[];
  verdict: 'accepted' | 'accepted_with_notes' | 'rejected';
  reviewed_at: string;

  /** NEW: Separation validation result */
  separation_check?: SeparationCheckResult;
}

interface SeparationCheckResult {
  /** Whether the check was performed */
  checked: boolean;

  /** Whether the reviewer is different from the worker */
  valid: boolean;

  /** If invalid, the worker who was detected */
  worker_agent_id?: string;

  /** If invalid, when the worker claimed the task */
  worker_claimed_at?: string;

  /** If invalid, when the worker released the task */
  worker_released_at?: string | null;

  /** Human-readable warning */
  warning?: string;

  /** If the operator overrode the warning */
  override?: boolean;

  /** Why the operator overrode */
  override_reason?: string;
}
```

### 5.1 Backward Compatibility

- `separation_check` is optional. Existing review records without it are valid.
- Code that reads `ReviewRecord` must treat `separation_check` as potentially undefined.
- The `task-review.ts` command handler populates this field automatically.

### 5.2 Example Review Record

```json
{
  "review_id": "review-20260422-411-assignment-planner-design-1713800000000",
  "reviewer_agent_id": "reviewer-gamma",
  "task_id": "20260422-411-assignment-planner-design",
  "findings": [
    { "severity": "minor", "description": "Rationale format could include budget clause", "category": "doc" }
  ],
  "verdict": "accepted_with_notes",
  "reviewed_at": "2026-04-22T16:00:00Z",
  "separation_check": {
    "checked": true,
    "valid": true
  }
}
```

Example with warning:

```json
{
  "review_id": "review-20260422-411-assignment-planner-design-1713800000001",
  "reviewer_agent_id": "architect-alpha",
  "task_id": "20260422-411-assignment-planner-design",
  "findings": [],
  "verdict": "accepted",
  "reviewed_at": "2026-04-22T16:30:00Z",
  "separation_check": {
    "checked": true,
    "valid": false,
    "worker_agent_id": "architect-alpha",
    "worker_claimed_at": "2026-04-22T10:00:00Z",
    "worker_released_at": "2026-04-22T14:00:00Z",
    "warning": "Reviewer was the last worker on this task",
    "override": true,
    "override_reason": "Architect is the only agent with architecture capability"
  }
}
```

---

## 6. CLI Surface Design

### 6.1 `narada task validate-separation`

```bash
narada task validate-separation <task-number> \
  --reviewer <agent-id>    # Optional: check a specific reviewer
  [--format json|human]
  [--cwd <path>]
```

**Behavior:**
- Runs `checkReviewSeparation()` for the specified task
- If `--reviewer` is omitted, checks against the current roster's reviewers
- Prints warning if reviewer == worker
- Returns exit code 0 if valid, 1 if invalid (but does not block)

### 6.2 `narada task claim` Extension

```bash
narada task claim <task-number> \
  --agent <id> \
  [--files <paths>]        # NEW: declare write-set manifest
  [--reason <text>]
```

**Behavior:**
- Existing claim behavior unchanged
- If `--files` is provided, stores `WriteSetManifest` in the assignment record
- If `--files` is omitted, stores `{ declared_files: ["TBD"] }`

### 6.3 `narada task update-manifest`

```bash
narada task update-manifest <task-number> \
  --files <paths>          # New or updated file list
  [--cwd <path>]
```

**Behavior:**
- Updates the `WriteSetManifest` in the assignment record
- Sets `updated: true` and `updated_at`
- Validates that the task is currently claimed

### 6.4 `narada task check-conflicts`

```bash
narada task check-conflicts \
  [--task <number>]        # Check a specific task against all active
  [--agent <id>]           # Check all tasks for a specific agent
  [--format json|human]
  [--cwd <path>]
```

**Behavior:**
- Runs `detectWriteSetConflicts()` on active assignments
- If `--task` is provided, only shows conflicts involving that task
- If `--agent` is provided, only shows conflicts involving that agent
- Prints warnings for each overlap
- Returns exit code 0 (warnings are advisory, not errors)

### 6.5 `narada task review` Integration

The existing `narada task review` command automatically runs `checkReviewSeparation()` before creating the review record:

```
REVIEW FLOW:
  1. Validate inputs (agent, verdict)
  2. Load task file, verify status == in_review
  3. RUN checkReviewSeparation(task_id, reviewer_agent_id)
  4. IF invalid:
       PRINT warning
       CONTINUE (do not block)
  5. Create review record WITH separation_check field
  6. Save review record
  7. Update task status
```

---

## 7. Integration with Assignment Planner

The assignment planner (Decision 411) already includes `review_separation_score` as a dimension. This design specifies how that score is computed:

```
review_separation_score(task, principal):
  // Check if principal was the last worker on this task
  result = checkReviewSeparation(task.task_id, principal.agent_id)

  IF result.valid:
    RETURN 1.0
  ELSE:
    RETURN 0.0  // Strong signal: this principal should not also review
```

The planner uses this score at **recommendation time** (before claim) to pre-emptively warn that a principal may be disqualified as reviewer later. It does not block the recommendation.

---

## 8. Storage Layout

```
.ai/
  tasks/
    assignments/
      20260422-411-assignment-planner-design.json   # Contains WriteSetManifest
  reviews/
    review-20260422-411-...json                      # Contains SeparationCheckResult
```

The `WriteSetManifest` is stored **inside the assignment record**, not as a separate file. The `AssignmentRecord` schema is extended:

```typescript
interface TaskAssignmentRecord {
  task_id: string;
  assignments: TaskAssignment[];
  write_set_manifest?: WriteSetManifest;  // NEW
}
```

---

## 9. Acceptance Criteria

- [x] Decision artifact exists.
- [x] Review-separation algorithm is deterministic and auditable.
- [x] Write-set tracking model is simple and does not require external tools.
- [x] Warning rules are conservative (false positives are acceptable, false negatives are not).
- [x] Review record schema extension is backward-compatible.
- [x] No implementation code is added.

---

## 10. Residuals

| Item | Deferred To | Why |
|------|-------------|-----|
| Git-diff based write-set tracking | Post-415 chapter | Manifest-based is sufficient for v0; git integration adds complexity |
| Static analysis for overlap detection | Future enhancement | File-list comparison is coarse but conservative |
| Automatic manifest inference from actual changes | Post-415 chapter | Requires telemetry from real task executions |
| Cross-chapter write-set tracking | Future enhancement | Current scope is single-chapter active tasks |
| Block-on-conflict mode | Never | Advisory-only is a permanent design choice |
