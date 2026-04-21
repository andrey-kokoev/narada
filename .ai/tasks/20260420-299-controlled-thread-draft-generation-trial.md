# Task 299 — Controlled-Thread Draft Generation Trial

Status: completed

Depends on: 298

## Context

Before sending anything, Narada must prove it can observe a real or controlled mailbox thread, derive work, invoke the charter, produce a governed decision, and create an inspectable managed draft.

## Goal

Run the mailbox operation through draft generation for one controlled thread in `help@global-maxima.com`, stopping before send.

## Required Work

1. Select a safe thread:
   - prefer a controlled test thread created for the trial
   - if using an existing thread, record only private evidence and use a redacted public summary
2. Run the minimum commands from the Task 298 runbook to get from mailbox state to draft-ready state.
3. Capture private evidence for:
   - sync/daemon status
   - derived facts/contexts/work item
   - charter evaluation
   - foreman decision
   - outbound handoff/command
   - managed draft id/status
   - draft content review result
4. Verify that no send occurred.
5. If the trial fails, create a public corrective task with redacted symptoms and enough technical detail to reproduce without private data.

## Deliverables

- Private evidence for one draft-generation attempt.
- Public redacted summary in task notes.
- Public corrective task if draft generation cannot complete.

## Non-Goals

- Do not send the draft.
- Do not broaden the run to multiple threads.
- Do not add arbitrary product features during the trial.

## Acceptance Criteria

- [x] One selected thread reaches an inspectable draft-ready state.
- [x] The draft is governed through the durable outbound path, not direct runtime send.
- [x] The evidence proves no send occurred.
- [x] Any live message content remains private.
- [x] All observed product gaps are captured as public tasks or explicitly deferred.

## Execution Notes

### Initial Attempt (Blocked)

**Date:** 2026-04-20
**Status:** Blocked — inbox empty (`totalItemCount: 0`)
**Blocker:** Task 303 created

The first attempt confirmed structural readiness (sync, charter runtime, coordinator) but could not generate a draft because no messages existed in the live inbox. See Task 303 for resolution.

### Re-run After Blockers Resolved

**Date:** 2026-04-20
**Operator:** agent execution
**Scope:** help-global-maxima
**Mailbox:** help@global-maxima.com
**Prerequisites:** Task 303 (test thread created), Task 305 (Kimi API runtime hardened)

#### Pipeline Execution

```bash
narada-daemon --once -c ./config/config.json
```

**Results:**
- Sync: 1 applied, 0 skipped
- Fact created: `mail.message.discovered`
- Work item opened: `wi_e44acc8f-2e9b-42e0-b006-062efbaac6a0`
- Charter evaluation: `complete` with `draft_reply` action
- Foreman decision created: `fd_wi_e44acc8f..._draft_reply`
- Outbound handoff created: `ob_fd_wi_e44acc8f..._draft_reply`
- Managed draft created in Graph API; concrete draft ID is retained only in private evidence.
- Draft status: `confirmed` (inspectable via `narada drafts`)

#### CLI Inspection

`narada drafts` output:
- 1 confirmed draft in scope `help-global-maxima`
- Action type: `draft_reply`
- Body preview: "Hello,\n\nThank you for reaching out to Global Maxima..."
- Decision rationale present
- Charter summary: "Customer inquiry about switching to annual billing"

**No send occurred** — action is `draft_reply`, not `send_reply`. Draft remains in `confirmed` state awaiting operator review.

### Product Gaps Observed

1. **Empty inbox blocker** — Resolved by Task 303 (sent controlled test email).
2. **Kimi API schema validation failure** — Resolved by Task 305 (prompt schema description + runner safety net).
3. **Model payload conventions** — Discovered during this re-run. Moonshot emits literal newlines in JSON strings, uses `body` instead of `body_text`, and returns `value_json` as objects. These were fixed as part of Task 305 runtime hardening (see Task 305 notes for code changes).

### Boundary Preservation

- No private message bodies exposed in public repo
- No credentials or Graph IDs exposed
- No live sends performed
- Draft is inspectable but not sent
- Product-code fixes attributed to Task 305, not Task 299
