# Task 236: Operator Audit Inspection Surface

## Chapter

Operational Trust

## Why

Every operator action is recorded in the `operator_actions` table, but there is zero visibility into this audit trail. An operator who triggers `request_redispatch`, `acknowledge`, or `cancel_work` leaves no observable trace except the side effects. This opacity makes debugging incidents impossible: you cannot distinguish "the system did this" from "an operator did this."

Operational trust requires that every human intervention be inspectable.

## Goal

Expose the `operator_actions` table through the observation API, CLI, and UI so an operator can review who did what, when, and why.

## Required Work

### 1. Add Observation Types for Operator Actions

Add to `observability/types.ts`:

```typescript
interface OperatorActionSummary {
  action_id: string;
  action_type: string;
  actor: string; // "operator" or "system"
  scope_id: string;
  context_id: string | null;
  work_item_id: string | null;
  payload_summary: string;
  created_at: string;
}
```

### 2. Add Observation Queries

In `observability/queries.ts`:

```typescript
export function getRecentOperatorActions(
  store: CoordinatorStoreView,
  limit = 50,
): OperatorActionSummary[]

export function getOperatorActionsForScope(
  store: CoordinatorStoreView,
  scopeId: string,
  limit = 50,
): OperatorActionSummary[]

export function getOperatorActionsForContext(
  store: CoordinatorStoreView,
  contextId: string,
  limit = 50,
): OperatorActionSummary[]
```

### 3. Add API Routes

In the observation server:

```
GET /operator-actions
GET /scopes/:id/operator-actions
GET /scopes/:id/contexts/:contextId/operator-actions
```

### 4. Add CLI Command

```bash
narada audit [scope-id] [--context-id <id>] [--limit <n>] [--since <timestamp>]
```

Output formats:
- `human`: tabular listing with action type, actor, scope, timestamp
- `json`: full array of `OperatorActionSummary`

### 5. Add UI Page

Add an "Audit Log" page to the operator console UI:
- Filter by action type, scope, date range
- Show action type, actor, scope, context, timestamp
- Link to related work item or context detail

### 6. Ensure Action Payloads Are Safe to Expose

Review all 9 audited actions to ensure `payload_json` does not contain secrets:
- `retry` — safe (work item ID only)
- `acknowledge` — safe
- `rebuild_projections` — safe
- `trigger_sync` — safe
- `derive_work` — safe
- `preview_work` — **requires redaction** (payload may contain message facts with PII; must be summarized or redacted)
- `request_redispatch` — safe
- `cancel_work` — safe
- `force_resolve` — safe

**Redaction rule for `preview_work`**: Before exposing `preview_work` payloads in API or UI, replace `payload_json` with a summary object containing only:
- `context_id`
- `scope_id`
- `fact_count` (number of facts previewed)
- `preview_duration_ms` (if recorded)
- `error` (if preview failed)

The raw `payload_json` with full fact content must NOT be returned by observation queries, API routes, or CLI output.

## Non-Goals

- Do not add real-time audit streaming.
- Do not add audit log export/archival automation.
- Do not add audit log retention policy changes.
- Do not modify the action recording mechanism (it already works).

## Acceptance Criteria

- [ ] `operator_actions` are queryable via observation API.
- [ ] `narada audit` CLI command exists and works.
- [ ] UI has an Audit Log page.
- [ ] Payloads are reviewed for secret leakage.
- [ ] `preview_work` payloads are explicitly redacted to summary-only before API/UI/CLI exposure.
- [ ] No new SQLite tables are required.

## Execution Notes

### 1. Observation Types
Added `OperatorActionSummary` to `packages/layers/control-plane/src/observability/types.ts` with `@source authoritative` annotation.

### 2. Observation Queries
Added three query functions to `packages/layers/control-plane/src/observability/queries.ts`:
- `getRecentOperatorActions(store, limit, since?)`
- `getOperatorActionsForScope(store, scopeId, limit, since?)`
- `getOperatorActionsForContext(store, contextId, limit, since?)`

All functions accept an optional `since` parameter for time-bounded filtering (used by CLI `--since`).

`getOperatorActionsForContext` left-joins `work_items` and `outbound_handoffs` to resolve actions whose `target_id` is a work item or outbound command belonging to the context, making the audit surface generic enough for future action types (e.g., `reject_draft` from Task 238) without owning their lifecycle.

### 3. API Routes
Added to `packages/layers/daemon/src/observation/observation-routes.ts`:
- `GET /operator-actions` — aggregates across all scopes, supports `?since=`
- `GET /scopes/:id/operator-actions` — scoped list, supports `?since=`
- `GET /scopes/:id/contexts/:contextId/operator-actions` — context-scoped list, supports `?since=`

All routes are read-only GET and route through the existing `CoordinatorStoreView`.

### 4. CLI Command
Added `packages/layers/cli/src/commands/audit.ts` and registered `narada audit [scope-id]` in `main.ts`.

Supports `--context-id`, `--limit`, `--since` filters. Outputs tabular human format or JSON array of `OperatorActionSummary`.

### 5. UI Page
Added "Audit Log" to the operator console nav in `packages/layers/daemon/src/ui/index.html`.

The `loadAudit()` page fetches `/scopes/{scope}/operator-actions` and renders a table with: Timestamp, Action, Actor, Context, Work item, Summary. Context and work item IDs are clickable links to detail views.

### 6. Payload Safety & Redaction
Implemented `redactOperatorActionPayload()` in `observability/queries.ts`:
- `preview_work` → JSON summary with only `scope_id`, `context_id`, `fact_count`, `preview_duration_ms`, `error`. Raw `payload_json` is never exposed.
- All other actions → safe generic summary (`target: <target_id>` or `—`).

The raw `payload_json` column is never returned by any observation query, API route, or CLI output.

### Corrective Notes (Task 248)

1. **`preview_work` redaction broadened**: `redactOperatorActionPayload()` now accepts both `contextId` (camelCase) and `context_id` (snake_case), plus `fact_ids`, `facts`, and `fact_count` for `fact_count` derivation. Raw fact IDs and fact content never appear in `payload_summary`.

2. **Date filtering is `since`-only in v1**: The task spec mentioned "date range" filtering, but v1 implements only a single `since` bound (API `?since=`, CLI `--since`, UI datetime-local "Since" input). A full `since` + `until` range was not implemented; the UI label and Task 236 notes are corrected to reflect `since`-only support.

3. **CLI human-output test tightened**: `audit.test.ts` now spies on `console.log` during human-format execution and asserts the rendered table contains expected action types (`trigger_sync`, `retry_work_item`) and actors (`operator`, `system`).

### Verification
- `packages/layers/control-plane` typecheck: **pass**
- `packages/layers/cli` typecheck: **pass**
- Daemon authority guardrails (`test/unit/authority-guardrails.test.ts`): **15/15 pass**
- Control-plane observability authority guard (`test/unit/observability/authority-guard.test.ts`): 24/25 pass; the one failure is pre-existing (`register(` in `rebuild.ts`), not caused by this change.

## Acceptance Criteria

- [x] `operator_actions` are queryable via observation API.
- [x] `narada audit` CLI command exists and works.
- [x] UI has an Audit Log page.
- [x] Payloads are reviewed for secret leakage.
- [x] `preview_work` payloads are explicitly redacted to summary-only before API/UI/CLI exposure.
- [x] No new SQLite tables are required.
