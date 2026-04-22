---
status: opened
depends_on: [400, 401, 402, 416]
operator_gate: true
---

# Task 403 — Controlled Live Input & Dry Run Execution

## Assignment

Select one controlled mailbox thread, bind a real Graph API source, and execute one live Cycle that produces a real campaign brief or missing-info follow-up.

## Operator Gate

This task requires live credentials, real mailbox access, and explicit human/operator selection of a controlled input thread. It must not be executed autonomously by a coding agent.

Before this task can proceed, Task 416 must provide the operator runbook and preflight guardrails.

**Runbook:** [`docs/deployment/email-marketing-live-dry-run-runbook.md`](../../docs/deployment/email-marketing-live-dry-run-runbook.md)

The operator must supply or confirm:
- real Graph credentials;
- target mailbox/source;
- one bounded input thread;
- confirmation that no Klaviyo mutation or send/publish is allowed.

## Blockers (Corrected by Task 417)

Task 400 overclaimed real step-handler coverage. Task 403 is **blocked** until the following real Windows Site handlers exist:

| Handler | Status | Why It Blocks / Blocked Task 403 | Owning Task |
|---------|--------|----------------------------------|-------------|
| **Live Graph API sync (step 2)** | ✅ Resolved by Tasks 419 and 423 | Live sync handler reads from configured Graph source, admits facts with idempotency, updates cursor, requires explicit live/fixture mode, and supports `conversation_id` for one controlled thread. | Tasks 419, 423 |
| **Real context formation (step 3)** | ✅ Resolved by Task 420 | Windows Site now uses `CampaignRequestContextFormation` through foreman-owned `onFactsAdmitted()` when `campaign_request_senders` is configured. Fixture derivation remains separate. | Task 420 |
| **Real charter evaluation (step 4)** | ✅ Resolved by Task 421 | Windows Site now builds real `CharterInvocationEnvelope`s, requires explicit runtime mode, persists execution/evaluation rows, and preserves evaluation/decision separation. | Task 421 |
| **Real foreman governance (step 5)** | ✅ Resolved by Task 422 | Windows Site now routes evaluations through real governance/handoff, respects policy, handles `campaign_brief` and `send_reply`, blocks forbidden actions, and invokes no effect worker. | Task 422 |

Task 403 is no longer structurally blocked by Windows Site handlers. It remains **operator-gated** because it requires live credentials, real mailbox access, and explicit selection of one controlled input thread.

## Required Reading

- `.ai/tasks/20260422-399-live-dry-run-boundary-contract.md`
- `.ai/tasks/20260422-400-windows-site-real-step-handler-port.md`
- `.ai/tasks/20260422-401-campaign-brief-runtime-integration.md`
- `.ai/tasks/20260422-402-private-ops-repo-setup.md`
- `docs/deployment/campaign-request-fact-model.md`
- `docs/deployment/email-marketing-live-dry-run-runbook.md`
- `docs/operator-loop.md`

## Context

This is the keystone task of the live dry run chapter. It exercises the full pipeline with real data:

> Real Graph API sync → real fact admission → real context formation → real work item → mock/real evaluation → real decision → real outbound command

The output is either:
- A `campaign_brief` outbound command with structured payload
- A `send_reply` outbound command requesting missing information

## Required Work

1. Select controlled live input.

   - Identify one mailbox thread from an allowed sender
   - Verify the thread contains a clear campaign request
   - Record the `conversation_id` and expected extracted fields
   - Document the selection rationale

2. Bind real Graph API source.

   - Configure `config.json` with real mailbox and delta sync settings
   - Verify credentials resolve correctly (`narada doctor --site`)
   - Confirm source connectivity with a manual sync test

3. Execute one live Cycle.

   - Run `narada cycle --site <site-id>` or trigger via Task Scheduler/systemd
   - Monitor health and trace output
   - Verify Cycle completes without `critical` health
   - If Cycle fails, diagnose and retry

4. Verify durable records.

   After Cycle completion, assert the following exist in the Site coordinator:
   - `context_records` row for the campaign-request context
   - `work_items` row opened for the context
   - `evaluations` row with proposed actions
   - `foreman_decisions` row with `approved_action`
   - `outbound_handoffs` + `outbound_versions` row with payload

5. Handle failure modes.

   - Auth failure → health = `auth_failed`; operator fixes credentials; retry
   - No allowed-sender mail found → Cycle succeeds with no work opened; expected behavior
   - Charter produces forbidden action → foreman governance rejects; decision = `no_op` or `escalated`
   - Missing info → `send_reply` created; operator receives attention item

## Non-Goals

- Do not execute Klaviyo API calls.
- Do not send/publish any campaign.
- Do not process more than one thread for the first dry run.
- Do not auto-approve any draft.
- Do not run an unbounded inbox sweep.

## Acceptance Criteria

- [x] **Blockers resolved:** Tasks 421–422 are closed and real handlers are wired into `DefaultWindowsSiteRunner.runCycle()`.
- [ ] One controlled mailbox thread is selected and documented.
- [ ] Real Graph API source is bound and connectivity verified.
- [ ] One Cycle executes successfully against real mail.
- [ ] At least one of the following is created in durable storage:
   - `campaign_brief` outbound command with structured payload, OR
   - `send_reply` outbound command requesting missing info
- [ ] No Klaviyo API call is made.
- [ ] No campaign is sent or published.
- [ ] Cycle health is `healthy` or `degraded` (not `critical`).
- [ ] Execution trace is recorded in `cycle_traces`.
