# Coordinator Durable State v2 — Corrections

## Mission

Fix four documented inconsistencies in `20260414-004-coordinator-durable-state-v2.md` so that the SQLite schema, TypeScript interfaces, and migration strategy are fully aligned with the completed scheduler (005), tooling (007), and chief integration (011) tasks.

## Scope

Edit only:
- `.ai/do-not-open/tasks/20260414-004-coordinator-durable-state-v2.md`

Read first:
- `.ai/do-not-open/tasks/20260414-005-assignment-agent-a-scheduler-and-leases.md`
- `.ai/do-not-open/tasks/20260414-007-assignment-agent-c-tool-binding-runtime.md`
- `.ai/do-not-open/tasks/20260414-011-chief-integration-control-plane-v2.md`

## Required Changes

### 1. Fix `execution_attempts.status` enum

**Current (wrong) in 004:**
```typescript
'running' | 'succeeded' | 'failed_retryable' | 'failed_terminal' | 'cancelled'
```

**Correct per 005 (execution attempt algebra):**
```typescript
'started' | 'active' | 'succeeded' | 'crashed' | 'abandoned'
```

**Action:**
- Update the SQL comment in the `execution_attempts` table definition.
- Update the `ExecutionAttemptStatus` TypeScript union.
- Update any prose in Section 7 (transaction boundaries) that refers to `execution_attempts.status = 'running'` — change to `'active'`.
- Remove any mention of `failed_retryable` or `failed_terminal` from execution attempt status (those are work-item statuses).

---

### 2. Fix `work_items.status` enum

**Current (incomplete) in 004:**
```sql
-- opened, leased, executing, resolved, superseded, failed_terminal
```

**Correct per 005:**
```sql
-- opened, leased, executing, resolved, failed_retryable, failed_terminal, superseded, cancelled
```

**Action:**
- Update the SQL comment in the `work_items` table definition.
- Update the `WorkItemStatus` TypeScript union to include `'failed_retryable'` and `'cancelled'`.

---

### 3. Fix `tool_call_records.status` enum

**Current (wrong) in 004:**
```typescript
'pending' | 'succeeded' | 'failed'
```

**Correct per 007 (tool error semantics):**
```typescript
'pending' | 'success' | 'timeout' | 'permission_denied' | 'error' | 'budget_exceeded'
```

**Action:**
- Update the SQL comment in the `tool_call_records` table definition.
- Update the `ToolCallStatus` TypeScript union.
- Ensure any prose referencing tool call status uses the new enum values consistently.

---

### 4. Resolve `evaluations` vs `charter_outputs` contradiction

**Current conflict:**
- Section 4 defines a brand-new `evaluations` table with a rich schema.
- Section 8 (Migration Strategy) offers Option A: treat `evaluations` as an alias/view over the existing `charter_outputs` table, which is impossible because the schema defines a separate physical table.

**Correct resolution per 011:**
Commit to the new `evaluations` table as the physical canonical table. Remove Option A.

**Action:**
- In Section 8, **delete Option A** (unified alias/view approach).
- **Promote Option B** as the sole official migration path, but soften the invasive language:
  - State that `evaluations` is the new canonical table.
  - For historical `charter_outputs` rows, either:
    - migrate them into `evaluations` by generating synthetic `execution_id` / `work_item_id` references, **or**
    - leave `charter_outputs` as a read-only legacy table and only populate `evaluations` going forward.
  - Pick one of these two sub-options and state it normatively.
- Remove any prose that says `evaluations` "can alias `charter_outputs`" or vice versa.

---

## Verification Checklist

- [x] `execution_attempts.status` enum matches 005 exactly (`started`, `active`, `succeeded`, `crashed`, `abandoned`)
- [x] `work_items.status` enum includes `failed_retryable` and `cancelled`
- [x] `tool_call_records.status` enum matches 007 exactly (`pending`, `success`, `timeout`, `permission_denied`, `error`, `budget_exceeded`)
- [x] Migration section commits to `evaluations` as the physical canonical table with no contradictory alias option
- [x] All SQL comments, TypeScript unions, and prose are internally consistent after edits
