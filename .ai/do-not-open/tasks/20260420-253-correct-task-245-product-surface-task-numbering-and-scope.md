# Task 253: Correct Task 245 Product Surface Task Numbering And Scope

## Chapter

Product Surface Coherence

## Context

Task `245` produced Product Surface Coherence planning artifacts:

- `.ai/decisions/20260420-245-product-surface-cavities.md`
- `.ai/do-not-open/tasks/20260420-246-251.md`
- `.ai/do-not-open/tasks/20260420-246-operation-scope-surface-alignment.md`
- `.ai/do-not-open/tasks/20260420-247-init-setup-path-hardening.md`
- `.ai/do-not-open/tasks/20260420-248-daemon-vertical-neutrality.md`
- `.ai/do-not-open/tasks/20260420-249-mechanical-verification-guardrails.md`
- `.ai/do-not-open/tasks/20260420-250-usc-narada-boundary-hardening.md`
- `.ai/do-not-open/tasks/20260420-251-product-surface-coherence-closure.md`

Architect review found two blocking planning issues:

1. Task numbers `246`, `247`, and `248` collide with already-created Operational Trust corrective tasks:
   - `20260420-246-correct-operational-trust-health-readiness-and-stuck-integration.md`
   - `20260420-247-remove-accidental-cli-speed-profiling-tests.md`
   - `20260420-248-correct-operator-audit-surface-edge-cases.md`
2. The Product Surface verification-guardrails task overlaps with the newly created dedicated telemetry/speed task:
   - `20260420-252-rework-agent-verification-speed-and-telemetry.md`

Task numbering collisions must be resolved before assigning Product Surface chapter implementation.

## Required Work

### 1. Renumber Product Surface Chapter Tasks

Renumber the Product Surface Coherence task set so it no longer collides with existing tasks.

Use the next available monotonic range after this corrective task.

Expected shape:

- `254`: Operation/scope surface alignment
- `255`: Init/setup path hardening
- `256`: Daemon vertical neutrality
- `257`: USC/Narada boundary hardening
- `258`: Product Surface Coherence closure

Do not reuse `246`, `247`, `248`, `249`, `250`, or `251` for Product Surface tasks.

### 2. Remove Or Fold The Overlapping Verification Task

Do not keep a separate Product Surface verification task if Task `252` now owns verification speed/telemetry.

Instead:

- make Product Surface tasks depend on `252` where relevant, or
- mention verification policy as an external prerequisite in the DAG.

### 3. Update Artifacts Consistently

Update:

- `.ai/do-not-open/tasks/20260420-245-create-product-surface-coherence-chapter-task-graph.md`
- `.ai/decisions/20260420-245-product-surface-cavities.md`
- the Product Surface DAG file
- all Product Surface task files

Ensure task numbers, filenames, headers, dependencies, and chapter mapping all agree.

### 4. Remove Superseded Duplicate Task Files

Remove or rename the colliding Product Surface task files so the repo no longer contains duplicate task numbers.

Do not create `*-SUPERSEDED`, `*-RESULT`, `*-DONE`, or similar status files.

## Non-Goals

- Do not implement Product Surface tasks.
- Do not edit Operational Trust corrective tasks `246-248`.
- Do not edit Task `252` except to reference it if needed.
- Do not create derivative task-status files.

## Execution Notes

### Renumbering
- Product Surface tasks renumbered:
  - 246 → 254 (Operation/Scope Surface Alignment)
  - 247 → 255 (Init & Setup Path Hardening)
  - 248 → 256 (Daemon Vertical Neutrality)
  - 250 → 257 (USC/Narada Boundary Hardening)
  - 251 → 258 (Product Surface Coherence Closure)
- Task 249 (Mechanical Verification Guardrails) removed — verification work now owned by Task 252.

### Files Created
- `.ai/do-not-open/tasks/20260420-254-258.md` — new DAG including Task 252
- `.ai/do-not-open/tasks/20260420-254-operation-scope-surface-alignment.md`
- `.ai/do-not-open/tasks/20260420-255-init-setup-path-hardening.md`
- `.ai/do-not-open/tasks/20260420-256-daemon-vertical-neutrality.md`
- `.ai/do-not-open/tasks/20260420-257-usc-narada-boundary-hardening.md`
- `.ai/do-not-open/tasks/20260420-258-product-surface-coherence-closure.md`

### Files Removed
- `.ai/do-not-open/tasks/20260420-246-251.md`
- `.ai/do-not-open/tasks/20260420-246-operation-scope-surface-alignment.md`
- `.ai/do-not-open/tasks/20260420-247-init-setup-path-hardening.md`
- `.ai/do-not-open/tasks/20260420-248-daemon-vertical-neutrality.md`
- `.ai/do-not-open/tasks/20260420-249-mechanical-verification-guardrails.md`
- `.ai/do-not-open/tasks/20260420-250-usc-narada-boundary-hardening.md`
- `.ai/do-not-open/tasks/20260420-251-product-surface-coherence-closure.md`

### Files Updated
- `.ai/decisions/20260420-245-product-surface-cavities.md` — chapter mapping table updated
- `.ai/do-not-open/tasks/20260420-245-create-product-surface-coherence-chapter-task-graph.md` — execution notes updated with corrected task list

### Verification
- Operational Trust corrective tasks (246, 247, 248) were NOT touched.
- Task 252 was NOT edited.
- No derivative status files created.

## Acceptance Criteria

- [x] No duplicate task numbers remain in `.ai/do-not-open/tasks/`.
- [x] Product Surface chapter tasks use a unique monotonic range.
- [x] Product Surface verification work no longer duplicates Task `252`.
- [x] Task `245` execution notes are corrected if needed.
- [x] Product Surface DAG and inventory mapping agree with renamed tasks.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.
