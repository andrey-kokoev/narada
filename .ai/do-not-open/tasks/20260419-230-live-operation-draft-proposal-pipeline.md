# Task 230: Live Operation Draft Proposal Pipeline Verification

## Chapter

Live Operation

## Why

The structural pipeline `fact → context → work item → charter evaluation → foreman decision → intent → outbound command → managed draft` is implemented but has not been proven end-to-end for a real support thread. This task forces the full path and identifies any handoff gaps before declaring the live operation ready.

## Goal

Verify that a support thread synced from `help@global-maxima.com` flows through every pipeline stage and produces a managed draft reply that an operator can inspect.

## Required Work

### 1. Ensure Fact → Context → Work Item

With messages synced and facts persisted (from Task 228), trigger work derivation:
- Use the daemon's foreman dispatch path, OR
- Use the `derive-work` CLI command, OR
- Use the `request_redispatch` operator action

Verify:
- A `context_record` is created/updated for the thread
- A `context_revision` is created with the correct ordinal
- A `work_item` is opened with status `opened`
- The work item references the correct `context_id` and `scope_id`

### 2. Ensure Work Item → Charter Evaluation

Let the scheduler pick up the work item and execute the charter:
- Verify the lease is acquired and the work item transitions to `executing`
- Verify `ExecutionAttempt` is created with status `started` → `active` → `succeeded`
- Verify an `Evaluation` is persisted with:
  - `charter_id: "support_steward"`
  - `outcome: "complete"` (or appropriate outcome)
  - `proposed_actions` containing a `draft_reply` action

If the charter produces unexpected output (e.g., `no_action`, `escalation`, `clarification_needed`), document the input context and charter response for iteration.

### 3. Ensure Evaluation → Foreman Decision → Outbound Command

The foreman resolves the work item based on the evaluation:
- Verify `DefaultForemanFacade.resolveWorkItem()` is called
- Verify a `foreman_decision` is created with the approved action
- Verify governance is applied (`require_human_approval` should block auto-send; `draft_reply` should pass)
- Verify `IntentHandoff.admitIntentFromDecision()` creates an `intent` row
- Verify `OutboundHandoff.createCommandFromDecision()` creates an `outbound_command` + `outbound_version`
- Verify the outbound command status is `pending`

### 4. Ensure Outbound Command → Managed Draft

The send-reply worker processes the outbound command:
- Verify the worker transitions the command through `draft_creating` → `draft_ready`
- Verify a `ManagedDraft` is created via Graph API
- Verify the draft content matches the charter's proposed reply
- Verify the command stops at `draft_ready` (since `require_human_approval: true` and we are not approving sends in this chapter)

### 5. Document Pipeline State Checkpoints

For each stage, document the exact observation query or CLI command an operator can use to verify the stage completed. Example:
- Stage 1: `SELECT * FROM work_items WHERE context_id = '...'`
- Stage 2: `SELECT * FROM execution_attempts WHERE work_item_id = '...'`
- Stage 3: `SELECT * FROM foreman_decisions WHERE work_item_id = '...'`
- Stage 4: `SELECT * FROM outbound_handoffs WHERE context_id = '...'`

## Non-Goals

- Do not approve or send the draft. The draft must remain in `draft_ready` state.
- Do not modify governance rules or policy.
- Do not implement new outbound action types.
- Do not test with live customer data unless explicitly authorized.

## Execution Notes

### Integration Test Created

**New file:** `packages/layers/control-plane/test/integration/live-operation/draft-proposal-pipeline.test.ts`

This test exercises the full pipeline end-to-end with an in-memory SQLite database and a fixture support thread (`conv-support-login-001`). It uses a custom `CharterRunner` that produces a valid `draft_reply` payload with proper `body_text`, `to`, `subject`, etc.

### Stage 1: Fact → Context → Work Item ✅

Verified by the test:
- `foreman.onFactsAdmitted(facts, "help-global-maxima")` creates a `context_record` with `primary_charter: "support_steward"`
- `context_revisions` row created with `ordinal: 1`
- `work_item` opened with `status: "opened"`, correct `context_id` and `scope_id`

### Stage 2: Work Item → Charter Evaluation ✅

Verified by the test:
- `scheduler.scanForRunnableWork()` finds the opened work item
- `scheduler.acquireLease()` succeeds; work item transitions to `"leased"`
- `scheduler.startExecution()` creates `ExecutionAttempt` with `status: "active"`
- `buildInvocationEnvelope()` produces envelope with `charter_id: "support_steward"` and knowledge sources from `<rootDir>/knowledge/`
- Custom charter runner returns `outcome: "complete"` with `draft_reply` proposed action
- `scheduler.completeExecution()` succeeds
- `persistEvaluation()` creates `Evaluation` row with `charter_id: "support_steward"` and `outcome: "complete"`

### Stage 3: Evaluation → Foreman Decision → Outbound Command ✅

Verified by the test (with `require_human_approval: false` to allow full pipeline traversal):
- `foreman.resolveWorkItem()` returns `success: true`, `resolution_outcome: "action_created"`
- `foreman_decision` created with `approved_action: "draft_reply"`
- `outbound_command` created with `action_type: "draft_reply"`, `status: "pending"`
- `outbound_version` created with `to: ["alice@external.com"]`, `subject: "Re: Can't log in to my account"`, body containing "Hi Alice"
- Work item transitions to `status: "resolved"`, `resolution_outcome: "action_created"`

### Critical Finding: `require_human_approval: true` Stops Pipeline at `pending_approval`

A second test in the same file verifies behavior with `require_human_approval: true` (the production config setting):
- Governance returns `approval_required: true` for ALL actions including `draft_reply`
- `foreman.resolveWorkItem()` creates a `pending_approval` decision and resolves the work item
- **No outbound command is created**
- Work item ends at `status: "resolved"`, `resolution_outcome: "pending_approval"`

This means the acceptance criteria in Task 232 ("outbound_command.status === 'draft_ready'") is **not achievable** with `require_human_approval: true`. The pipeline stops at `pending_approval`. To reach `draft_ready`, an operator must either:
1. Set `require_human_approval: false` (not recommended for first live operation)
2. Implement an operator action that approves `pending_approval` decisions and continues the pipeline
3. Update Task 232 acceptance to match the actual behavior: `resolution_outcome === 'pending_approval'`

### Stage 4: Outbound Command → Managed Draft

**Not verified in this task.** The send-reply worker requires Graph API access to create a `ManagedDraft`. Without credentials, this stage cannot be tested live. The integration test proves the outbound command is created with correct payload; the worker transition from `pending` → `draft_creating` → `draft_ready` is covered by existing `send-reply-worker.test.ts` unit tests.

### Pipeline State Checkpoints

| Stage | Table | Query |
|-------|-------|-------|
| 1. Facts admitted | `facts` | `SELECT * FROM facts WHERE source_id = 'help-global-maxima' AND admitted_at IS NOT NULL;` |
| 1. Context created | `context_records` | `SELECT * FROM context_records WHERE context_id = 'conv-support-login-001';` |
| 1. Revision created | `context_revisions` | `SELECT * FROM context_revisions WHERE context_id = 'conv-support-login-001' ORDER BY ordinal DESC;` |
| 1. Work opened | `work_items` | `SELECT * FROM work_items WHERE context_id = 'conv-support-login-001' AND status = 'opened';` |
| 2. Lease acquired | `work_item_leases` | `SELECT * FROM work_item_leases WHERE work_item_id = '...' AND released_at IS NULL;` |
| 2. Execution started | `execution_attempts` | `SELECT * FROM execution_attempts WHERE work_item_id = '...' ORDER BY started_at DESC;` |
| 2. Evaluation persisted | `evaluations` | `SELECT * FROM evaluations WHERE execution_id = '...';` |
| 3. Decision created | `foreman_decisions` | `SELECT * FROM foreman_decisions WHERE context_id = 'conv-support-login-001';` |
| 3. Intent created | `intents` | `SELECT * FROM intents WHERE context_id = 'conv-support-login-001';` |
| 3. Outbound created | `outbound_handoffs` | `SELECT * FROM outbound_handoffs WHERE context_id = 'conv-support-login-001';` |
| 3. Version created | `outbound_versions` | `SELECT * FROM outbound_versions WHERE outbound_id = '...' ORDER BY version DESC;` |
| 4. Draft created | `managed_drafts` | `SELECT * FROM managed_drafts WHERE outbound_id = '...';` |

### Test Results

```bash
cd packages/layers/control-plane
npx vitest run test/integration/live-operation/draft-proposal-pipeline.test.ts
```

Output: 2 tests pass ✅

## Definition Of Done

- [x] A synced support thread produces a `work_item` in `opened` status.
- [x] The work item is leased and a charter `ExecutionAttempt` completes successfully.
- [x] The `Evaluation` contains a `draft_reply` proposal.
- [x] A `foreman_decision` is created approving the draft reply.
- [x] An `outbound_command` and `outbound_version` are created.
- [ ] A `ManagedDraft` exists in Graph API (or in local store if using mock adapter). *(Deferred: requires Graph API credentials)*
- [ ] The outbound command is in `draft_ready` status (not sent). *(Blocked by `require_human_approval: true` — pipeline stops at `pending_approval`)*
- [x] Task notes contain the observation checkpoints for each stage.

## Dependencies

- Task 228: Config and Sync Readiness (messages and facts must exist)
- Task 229: Live Operation Support Steward Profile (charter must produce sensible proposals)
