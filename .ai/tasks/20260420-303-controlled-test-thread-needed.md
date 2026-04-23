# Task 303: Controlled Test Thread Needed for Mailbox Operational Trial

status: closed

## Chapter

Mailbox Operational Trial

## Depends On

- Task 299 (blocked)

## Context

Task 299 attempted a controlled-thread draft generation trial for `help@global-maxima.com`. The Narada system is functional — sync, dispatch, and charter runtime all initialize and run without errors. However, the Graph API inbox for this mailbox is empty, so no messages can be synced, no facts can be created, and therefore no draft generation can occur.

## Goal

Create the conditions necessary for Task 299 to complete: at least one message must exist in the monitored inbox so that sync → fact → work item → evaluation → draft can be exercised.

## Required Work

1. Send a test email to `help@global-maxima.com` from an external account, OR
2. Configure the trial scope to temporarily monitor a folder that contains existing messages (e.g., Archive, Sent Items), process one thread, then revert the config, OR
3. Manually inject a synthetic fact into the fact store to simulate an inbound message.

Option 1 (test email) is preferred because it creates a truly controlled thread with known content and no risk of processing real customer data.

## Boundaries

- If using an existing folder (Option 2), redact all message content before creating any public artifacts.
- If using manual fact injection (Option 3), document the exact injection script and validate that the resulting pipeline behavior matches natural sync behavior.
- Do not send the draft during this task. Task 299 remains responsible for draft generation and verification.

## Acceptance Criteria

- [x] At least one fact exists in the fact store for `help-global-maxima`.
- [x] A corresponding work item was opened by the foreman.
- [x] Task 299 can be re-executed and is no longer blocked by empty inbox.

## Execution Notes

### Option Chosen
**Option 1**: Sent a controlled test email to `help@global-maxima.com` using the Graph API `sendMail` endpoint.

### Steps Executed
1. Acquired OAuth2 access token via client credentials flow (`GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`).
2. Verified app roles include `Mail.Send`.
3. Sent test email from `help@global-maxima.com` to itself:
   - Subject: `Narada Operational Trial - Test Thread`
   - Body: Clearly labeled as controlled test message for Task 303.
4. Verified message arrived in Inbox via Graph API `GET /mailFolders/inbox/messages`.
5. Ran `narada-daemon --once` to sync and dispatch.

### Results
- **Sync**: 1 event applied, 0 skipped. Cursor advanced.
- **Fact created**: `fact_49ffd0438b76c39612884d4eda3319d4` (`mail.message.discovered`)
- **Work item opened**: `wi_7e40881b-eb7b-4c20-ab7d-9debdbb07083`
- **Execution**: Crashed due to Kimi API evaluation schema validation failure.
- **Evaluation**: 0 (validation failed before creation)
- **Outbound handoff**: 0
- **Managed draft**: 0

### New Blocker Discovered
The empty-inbox blocker is resolved, but a **new product gap** emerged:
- **Task 305**: Kimi API charter evaluation schema validation failure.
- The `kimi-api` runtime returns output that does not validate against the `Evaluation` schema (missing `confidence`, `classifications`, `facts`, `proposed_actions[*].action_type`, etc.).
- **Task 299 should not be re-run until Task 305 is fixed**, because it will hit the same evaluation validation failure.

### Private Evidence
- Command log: `~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/commands-task303.log`
- Sync output: captured in `commands-task303.log` (daemon direct output)
- Graph API sendMail response: HTTP 202 Accepted (empty body)
- Inbox verification: `GET /mailFolders/inbox/messages` returned 1 message with test subject
