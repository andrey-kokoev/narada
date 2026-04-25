# Task 232: Live Operation Smoke Test and Acceptance Verification

## Chapter

Live Operation

## Why

The Live Operation chapter is not complete until the acceptance scenario is proven. A fixture-backed smoke test provides repeatable proof that the full pipeline works, and a runbook gives the operator confidence to run it against real data.

## Goal

Prove the acceptance scenario end-to-end and document the operator runbook.

## Acceptance Scenario

### Concrete Smoke Case

| Field | Value |
|-------|-------|
| **Operation ID** | `help@global-maxima.com` |
| **Scope ID** | `help@global-maxima.com` (same as operation ID for mailbox vertical) |
| **Fixture name** | `support-thread-login-issue` |
| **Fixture location** | `test/fixtures/threads/support-thread-login-issue.json` (create if missing) |
| **Thread selector** | `conversation_id: "conv-support-login-001"` |
| **Context ID** | `conv-support-login-001` |

### Fixture Shape

A single-message thread in the inbox from an external customer:

```json
{
  "conversation_id": "conv-support-login-001",
  "message_id": "msg-login-001",
  "subject": "Can't log in to my account",
  "from": { "name": "Alice Customer", "address": "alice@external.com" },
  "to": [{ "name": "Support", "address": "help@global-maxima.com" }],
  "body": {
    "body_kind": "text",
    "text": "Hi, I've been trying to log in for the last hour but I keep getting an 'invalid credentials' error. I reset my password twice already. Can someone help?\n\n— Alice"
  },
  "folder_refs": ["inbox"],
  "flags": { "is_read": false, "is_draft": false, "is_flagged": false, "has_attachments": false }
}
```

### Expected Draft Characteristics

The managed draft produced by the pipeline must:
1. Be addressed to `alice@external.com` (the thread initiator)
2. Have subject `Re: Can't log in to my account`
3. Acknowledge the login issue in the opening sentence
4. Ask for the account email address (Alice may be writing from a different email than her account email)
5. Not promise a specific resolution timeline (support charter must not overcommit)
6. Include a professional sign-off referencing `global-maxima.com` support
7. Be in `body_kind: "text"` (matching the operation's `body_policy`)

### Exact Command Path (Fixture-Based)

```bash
# From repo root
pnpm test:control-plane -- test/integration/live-operation/smoke-test.test.ts
```

The test must:
1. Create a temporary `root_dir` with the fixture pre-seeded as a normalized event
2. Trigger foreman dispatch (direct `onFactsAdmitted`)
3. Run the scheduler to lease and execute the work item
4. Run charter evaluation with the support steward runner
5. Run foreman resolution to create the outbound command
6. Run the send-reply worker with a mock `GraphDraftClient` to create the managed draft
7. Assert each pipeline stage produces the expected durable records
8. Assert the final `outbound_command.status === 'confirmed'` for `draft_reply` (draft created but not sent)

### Exact Command Path (Real Thread — Optional)

```bash
# 1. Ensure daemon is running with help@global-maxima.com scope
# 2. Trigger sync to pull the real thread
narada sync -c ./ops/config.json

# 3. Trigger dispatch to open work
narada derive-work -c ./ops/config.json -s help@global-maxima.com --context-id <real-conversation-id>

# 4. Inspect the resulting work item
narada status -c ./ops/config.json

# 5. Inspect the evaluation (after Task 231 is complete)
narada inspect evaluation <evaluation-id>

# 6. Verify draft exists in Graph API (do not send)
#    Check daemon UI /scopes/help@global-maxima.com/mailbox or equivalent
```

### Scenario Statement

#### Full Pipeline (require_human_approval: false)

```text
Given: Operation help@global-maxima.com is configured with posture draft-only
  And: require_human_approval is false (pipeline test path)
  And: The support-thread-login-issue fixture is synced
 When: The full pipeline runs through foreman dispatch, scheduler, charter evaluation, send-reply worker
 Then: work_item.status === 'resolved'
  And: work_item.resolution_outcome === 'action_created'
  And: outbound_command.status === 'confirmed' (draft created but not sent)
  And: outbound_version.body_text acknowledges the login issue, asks for account email, and does not promise a timeline
  And: The operator can inspect evaluation.proposed_actions, decision.rationale, and execution.outcome
```

#### Safe Posture (require_human_approval: true)

```text
Given: Operation help@global-maxima.com is configured with posture draft-only
  And: require_human_approval is true (production-safe path)
  And: The support-thread-login-issue fixture is synced
 When: The pipeline runs through foreman dispatch, scheduler, charter evaluation, and foreman governance
 Then: work_item.status === 'resolved'
  And: work_item.resolution_outcome === 'pending_approval'
  And: No outbound_command is created
  And: foreman_decision.approved_action === 'draft_reply'
```

**Note on `draft_ready` vs `confirmed`:** The send-reply worker transitions `draft_reply` commands through `pending → draft_creating → draft_ready → confirmed`. `draft_ready` is a transient state; the terminal state for a `draft_reply` that successfully creates a draft is `confirmed`. For `send_reply` commands, the terminal state after sending is `submitted`.

## Required Work

### 1. Fixture-Based Smoke Test

Created: `packages/layers/control-plane/test/integration/live-operation/smoke-test.test.ts`

The test exercises the full pipeline without requiring live Graph API access:

- Uses the `support-thread-login-issue` fixture (also stored at `packages/layers/control-plane/test/fixtures/threads/support-thread-login-issue.json`)
- Seeds the fixture message on disk and creates a `mail.message.discovered` fact
- Runs the pipeline: facts → context formation → work opening → charter evaluation → foreman decision → outbound handoff → send-reply worker (with mock `GraphDraftClient`)
- Verifies each stage produces the expected durable records:
  - `context_records` row with `context_id = "conv-support-login-001"`
  - `work_items` row with `status = "resolved"` and `resolution_outcome = "action_created"`
  - `execution_attempts` row with `status = "succeeded"`
  - `evaluations` row with `outcome = "complete"` and `proposed_actions_json` containing a `draft_reply`
  - `foreman_decisions` row with `approved_action = "draft_reply"`
  - `outbound_handoffs` row with `status = "confirmed"` (terminal state for `draft_reply`)
  - `outbound_versions` row with `to = ["alice@external.com"]` and subject `Re: Can't log in to my account`
- Verifies the draft body meets Expected Draft Characteristics
- Includes a second test case proving the safe posture (`require_human_approval: true`) produces `pending_approval` with no outbound command

Run:
```bash
pnpm test:control-plane -- test/integration/live-operation/smoke-test.test.ts
```

### 2. Real Thread Smoke Test (Optional)

If Graph API credentials are available and safe to use:
- Pick an existing low-stakes thread in `help@global-maxima.com`
- Run the full pipeline against it
- Verify the managed draft is created and inspectable
- Delete the draft afterward (do not send)

Document the exact commands and expected output.

### 3. Operator Runbook

Written: `docs/runbook.md`

Covers:

**Daily operation:**
1. Check sync health: `narada status` or daemon UI `/overview`
2. Review active work items: daemon UI or `narada status --verbose`
3. Inspect charter proposals: `narada show evaluation <id>` or API `/evaluations/<id>`
4. Inspect foreman decisions: `narada show decision <id>` or API `/decisions/<id>`
5. Inspect execution envelopes: `narada show execution <id>` or API `/executions/<id>`

**When something goes wrong:**
1. Work item stuck in `opened`: check scheduler health, trigger `request_redispatch`
2. Work item stuck in `leased`: check for stale leases, scheduler auto-recovers
3. Charter produces `no_action` or `escalation`: inspect execution envelope for context issues
4. Draft not created: inspect foreman decision and outbound handoff status
5. Draft created but wrong content: inspect decision payload and runtime envelope
6. Sync failing: check `cursor.json`, delta token validity, Graph API credentials

**First-time setup:**
1. `ops-kit want-mailbox help@global-maxima.com --posture draft-only`
2. Add Graph credentials (env vars or secure storage)
3. Run `narada sync --dry-run` to verify connectivity
4. Run `narada sync` to pull initial messages
5. Start daemon for continuous operation
6. Verify first work item opens within one poll cycle

### 4. Document Deferred Capabilities

Explicitly list what is NOT covered in this chapter and why:
- Autonomous send (`require_human_approval: true` is the correct first posture)
- Multi-vertical operations (only mailbox vertical is proven)
- Production UI polish (real-time updates, graphs)
- Generalized knowledge-base RAG
- Secondary charter arbitration
- Non-mail outbound actions (tickets, CRM)
- Cross-context customer grouping

## Non-Goals

- Do not send email.
- Do not modify production data.
- Do not build a general test framework beyond the one smoke test.
- Do not implement deferred capabilities.

## Acceptance Criteria

- [x] Fixture-based smoke test passes and verifies the full pipeline.
- [x] Smoke test proves the full pipeline final state is `confirmed` for `draft_reply` (draft created but not sent).
- [x] Smoke test proves the safe posture final state is `pending_approval` with no outbound command.
- [x] Operator runbook exists and covers daily operation, troubleshooting, and first-time setup.
- [x] Deferred capabilities are explicitly documented.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

## Dependencies

- Task 228: Config and Sync Readiness
- Task 229: Support Steward Charter Profile
- Task 230: Draft Proposal Pipeline Verification
- Task 231: Inspection Surfaces
