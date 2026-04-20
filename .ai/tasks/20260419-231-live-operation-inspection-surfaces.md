# Task 231: Live Operation Inspection Surfaces

## Chapter

Live Operation

## Why

An operator running a live support operation must be able to see *why* the system made a decision. Today, the rich evaluation content (proposed actions, tool requests, escalations, confidence) and decision rationale are stored in SQLite but completely hidden from observation queries, API routes, and the UI. An operator looking at a work item sees only a summary string like "Proposed draft reply" — not the draft content, not the confidence score, not alternative actions considered.

This opacity is unacceptable for a live operation.

## Goal

Expose the evaluation payload, decision rationale, and execution envelope so an operator can inspect what the charter saw, what it proposed, and why the foreman decided what it did.

## Required Work

### 1. Expose Evaluation Content

Add observation types and queries for the full `Evaluation` record:

- `proposed_actions_json` → structured proposed actions view
- `tool_requests_json` → tool requests with args and approval status
- `escalations_json` → escalations raised by the charter
- `classifications_json` → classifications applied to the context
- `confidence_json` → confidence breakdown
- `facts_json` → facts the charter considered relevant
- `recommended_action_class` → the charter's top recommendation

Add API routes:
- `GET /scopes/:id/evaluations/:evaluationId` — full evaluation detail
- `GET /scopes/:id/contexts/:contextId/evaluations` — all evaluations for a context

Update UI:
- Evaluation detail page or section showing proposed actions in a readable format
- Tool requests listed with approval gates visible
- Escalations highlighted

### 2. Expose Decision Rationale

Add observation types and queries for `ForemanDecisionRow`:
- `payload_json` → the decision payload (approved action parameters)
- `rationale` → human-readable or structured rationale
- `source_charter_ids_json` → which charters contributed to this decision
- `created_by` → system or operator

Add API routes:
- `GET /scopes/:id/decisions/:decisionId` — full decision detail
- `GET /scopes/:id/work-items/:workItemId/decisions` — decisions for a work item

Update UI:
- Decision detail section in work-item timeline
- Rationale displayed alongside approved action

### 3. Expose Execution Envelope and Outcome

Add observation types and queries for `ExecutionAttempt`:
- `runtime_envelope_json` → what the charter saw (context, tools, policy, prior evaluations)
- `outcome_json` → the raw charter output envelope

Add API routes:
- `GET /scopes/:id/executions/:executionId/envelope` — runtime envelope
- `GET /scopes/:id/executions/:executionId/outcome` — raw outcome

Update UI:
- Execution detail page with tabs or sections for envelope and outcome
- JSON viewer or structured rendering for envelope content

### 4. CLI Enhancement

Add CLI commands or extend existing ones:
- `narada inspect evaluation <evaluation-id>` — show full evaluation content
- `narada inspect decision <decision-id>` — show decision rationale and payload
- `narada inspect execution <execution-id>` — show envelope and outcome

Alternatively, extend `narada status` to include the latest evaluation/decision summary for each active work item.

## Non-Goals

- Do not add real-time streaming or WebSocket updates.
- Do not add time-series graphs or trend views.
- Do not add operator action audit log page (recorded but deferred).
- Do not modify the evaluation schema — only expose existing fields.
- Do not send email.

## Acceptance Criteria

- [x] An operator can query the full evaluation content (proposed actions, tool requests, escalations, confidence, classifications) via API and CLI.
- [x] An operator can query decision rationale and payload via API and CLI.
- [x] An operator can query execution envelope and outcome via API and CLI.
- [x] The web UI shows evaluation proposed actions, tool requests, and escalations in the context detail page.
- [x] The web UI shows deep-dive execution envelope/outcome and decision payload/rationale via clickable detail views.
- [x] No new SQLite tables are required (existing schema is sufficient).

## Dependencies

- Task 228: Config and Sync Readiness (observation stores must have data)
- Task 229: Support Steward Charter Profile (evaluations must exist to inspect)
- Task 230: Draft Proposal Pipeline Verification (decisions and executions must exist to inspect)

## Implementation Summary

### Types Added
- `EvaluationDetail` — full evaluation with parsed JSON fields (proposed_actions, tool_requests, escalations, classifications, facts, confidence)
- `DecisionDetail` — full decision with parsed payload and source_charter_ids
- `ExecutionDetail` — full execution with parsed runtime_envelope and outcome

### Query Functions Added
- `getEvaluationDetail(store, evaluationId)` — deep-dive evaluation view
- `getDecisionDetail(store, decisionId)` — deep-dive decision view
- `getExecutionDetail(store, executionId)` — deep-dive execution view
- `getEvaluationsByContextDetail(store, contextId, scopeId)` — all evaluations for a context with full detail

### API Routes Added
- `GET /scopes/:id/evaluations/:evaluationId`
- `GET /scopes/:id/decisions/:decisionId`
- `GET /scopes/:id/executions/:executionId`
- `GET /scopes/:id/contexts/:contextId/evaluations`

### CLI Command Added
- `narada show evaluation <evaluation-id>`
- `narada show decision <decision-id>`
- `narada show execution <execution-id>`

### UI Updates
- Context detail page now fetches and displays full evaluations with proposed actions, escalations, and tool requests
- Work item detail page now links execution IDs and decision IDs to deep-dive views
- New detail views: `showEvaluationDetail`, `showDecisionDetail`, `showExecutionDetail`
- JSON content rendered in styled `<pre>` blocks for readability

### Tests Added
- `packages/layers/control-plane/test/unit/observability/queries.test.ts` — 7 tests for detail queries (getEvaluationDetail ×2, getDecisionDetail ×2, getExecutionDetail ×2, getEvaluationsByContextDetail ×1)
- `packages/layers/cli/test/commands/show.test.ts` — 8 tests for the CLI show command (evaluation/decision/execution JSON output, missing entity errors, missing database error, human-readable format)
- All new query functions verified with parsed JSON field assertions

### CLI Interface Note
The actual CLI uses flag-style arguments: `narada show --type evaluation --id <evaluation-id> [--scope <scope-id>]`. The task description originally suggested subcommand-style `narada inspect evaluation <id>`; the implemented flag interface is more consistent with other CLI commands.

### Corrective Work (Task 241)
- Query parameter types narrowed from `CoordinatorStoreView` to `Pick<CoordinatorStoreView, "db">` to eliminate unsafe `{ db } as CoordinatorStoreView` casts in CLI.
- CLI tests added for show command.
