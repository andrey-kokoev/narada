# Task 248: Correct Operator Audit Surface Edge Cases

## Chapter

Operational Trust

## Context

Architect review of Task `236` found that the audit surface is broadly implemented, but a few edge cases need correction before chapter closure.

## Findings

### 1. `preview_work` Redaction Is Too Narrow

`redactOperatorActionPayload()` handles `contextId` but not `context_id`.

The required safe summary shape is:

- `context_id`
- `scope_id`
- `fact_count`
- `preview_duration_ms`
- `error`

If stored payloads use snake_case, the current redaction may omit `context_id` from the summary.

### 2. UI Date Filtering Is Under-Specified

Task `236` required filtering by date range. The current UI appears to expose a single `since` input, not a full date range.

Either implement a real date range or update Task `236` notes to honestly state that v1 supports `since` filtering only.

### 3. CLI Human Output Test Does Not Verify Output

`packages/layers/cli/test/commands/audit.test.ts` checks success for human output but does not assert rendered content. Add focused coverage if the CLI formatter allows it; otherwise document why JSON is the tested contract.

## Required Work

### 1. Broaden Redaction Parsing

Update `preview_work` redaction to accept both camelCase and snake_case source keys where applicable:

- `contextId` and `context_id`
- `fact_ids`, `facts`, and `fact_count`
- `preview_duration_ms`
- `error`

Ensure raw fact IDs and fact content never appear in `payload_summary`.

### 2. Align Date Filter Claim

Either:

- implement `since` + `until` across query/API/CLI/UI, or
- update Task `236` execution notes and UI wording to state v1 supports `since` filtering only.

Prefer the smaller honest v1 correction unless a full range is already mostly implemented.

### 3. Tighten CLI Test Coverage

Add a focused assertion for human output if feasible. If not feasible, document the limitation in Task `236`.

## Non-Goals

- Do not change the operator action recording mechanism.
- Do not add audit export/retention.
- Do not add streaming audit logs.
- Do not create derivative task-status files.

## Execution Notes

### Redaction broadened (`packages/layers/control-plane/src/observability/queries.ts`)
- `redactOperatorActionPayload()` now reads `context_id` (snake_case) in addition to `contextId` (camelCase).
- `fact_count` is derived from `fact_ids`, `facts`, or `fact_count` — whichever is present.
- Raw fact IDs and raw fact content never appear in `payload_summary`; only the derived `fact_count` is emitted.
- Added focused unit test (`redacts snake_case context_id and raw facts content without leakage`) that stores a payload with `context_id`, a `facts` array containing objects with `fact_id` and `content`, and asserts none of the raw IDs or content strings leak into the summary.

### Date filter claim aligned (`packages/layers/daemon/src/ui/index.html`, `.ai/do-not-open/tasks/20260419-236-operator-audit-inspection-surface.md`)
- Chose the honest v1 correction: Task `236` notes updated to state that v1 supports `since` filtering only.
- UI already exposes a single "Since" datetime-local input; no `until` input was added.
- No changes to query/API/CLI layers were needed.

### CLI test tightened (`packages/layers/cli/test/commands/audit.test.ts`)
- Human-output test now spies `console.log`, captures the rendered table, and asserts it contains `trigger_sync`, `retry_work_item`, `operator`, and `system`.

## Acceptance Criteria

- [x] `preview_work` redaction handles both `contextId` and `context_id`.
- [x] Raw preview facts/fact IDs are not exposed through audit summaries.
- [x] Date filtering claim is either implemented as range filtering or narrowed to `since` filtering.
- [x] CLI audit test coverage is tightened or the limitation is explicitly documented.
- [x] Task `236` is updated with corrective notes if needed.
- [x] No `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files are created.
