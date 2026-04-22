---
status: closed
closed: 2026-04-22
depends_on: [443]
---

# Task 450 — Task Range Reservation Implementation

## Context

Task 443 defines a range reservation protocol (§3) using `.ai/tasks/.registry.json`. Currently, no registry exists. Agents have been allocating task numbers by inspecting filenames, which led to collisions (e.g., Task 430 active-learning-recall vs concurrent macOS/Linux chapter shaping).

## Goal

Implement the `.ai/tasks/.registry.json` schema and the reservation protocol defined in `docs/governance/task-graph-evolution-boundary.md` §3.

## Required Work

### 1. Create `.ai/tasks/.registry.json`

Seed the registry with the current task graph state. At the time this task was created, follow-up task files already existed through Task 453, so the registry must not be seeded with an older value.

```json
{
  "version": 1,
  "last_allocated": 453,
  "reservations": []
}
```

If additional task files exist by execution time, compute `last_allocated` from the maximum task number found in `.ai/tasks/*.md` filenames and task headings. Do not hard-code `453` if the graph has advanced.

### 2. Implement reservation CLI / script

Create `scripts/task-reserve.ts` that supports:

```bash
# Reserve a range
pnpm exec tsx scripts/task-reserve.ts --range 444-448 --purpose "Task graph lint family" --agent <name>

# List active reservations
pnpm exec tsx scripts/task-reserve.ts --list

# Release a reservation
pnpm exec tsx scripts/task-reserve.ts --release 444-448

# Extend a reservation
pnpm exec tsx scripts/task-reserve.ts --extend 444-448 --hours 24
```

### 3. Reservation logic

- Compute `next_number = max(last_allocated, max(active reserved_range_ends)) + 1`.
- Reject reservations that overlap with existing active reservations.
- Default expiration: 24 hours from reservation time.
- Mark expired reservations as `expired` on read/write operations.
- Max range size: 20 tasks (configurable).

### 4. Integrate with task creation

Update `.ai/task-contracts/agent-task-execution.md` to tell agents to use the reservation script. If the script does not exist yet, agents must compute the next available number by scanning all task headings and must record the reservation manually in `.registry.json`.

### 5. Registry validation

The registry JSON must validate against a simple schema. Invalid registries should be rejected with a clear error.

## Acceptance Criteria

- [x] `.ai/tasks/.registry.json` exists and is valid.
- [x] `scripts/task-reserve.ts` exists and supports `--range`, `--list`, `--release`, `--extend`.
- [x] Overlapping reservations are rejected.
- [x] Expired reservations are automatically marked `expired`.
- [x] `last_allocated` is updated when reservations are released.
- [x] The script works when run against the current task graph.

## Non-Goals

- Do not implement a database-backed reservation system.
- Do not integrate with external calendars or issue trackers.
- Do not auto-create task files (the script only reserves numbers).

## Execution Mode

Proceed directly. This is an additive tooling task.

## Execution Notes

Implementation was completed prior to this review. Verified all acceptance criteria:

- **Registry exists and is valid**: `.ai/tasks/.registry.json` seeded with `last_allocated: 453` (computed from max task number in filenames and headings, not hard-coded).
- **Script supports all operations**: `--range`, `--list`, `--release`, `--extend` all tested and working.
- **Overlapping rejection**: Confirmed — attempting to reserve `455-457` while `454-456` is active correctly fails with an overlap error.
- **Auto-expiration**: Confirmed — injected an expired reservation (expiry 2026-04-20); listing auto-marked it `expired`.
- **last_allocated on release**: Confirmed — releasing `454-456` updated `last_allocated` from `456` back to `453` (computed from actual task files and remaining active reservations).
- **Range size limit**: Confirmed — `454-475` (size 22) was rejected with clear error.
- **Agent contract updated**: `.ai/task-contracts/agent-task-execution.md` §Task Number Allocation references the script and registry protocol.

No fixes required.

## Verification

Verified by inspecting `.ai/tasks/.registry.json` and `scripts/task-reserve.ts`. All operations (`--range`, `--list`, `--release`, `--extend`) tested. Overlapping reservations rejected. Expired reservations auto-marked. `last_allocated` updates on release. Range size limit enforced (max 20). Script works against current task graph.
