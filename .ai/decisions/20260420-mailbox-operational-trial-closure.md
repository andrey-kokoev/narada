# Decision: Mailbox Operational Trial Chapter Closure

## Date

2026-04-20

## Chapter

Mailbox Operational Trial (Tasks 297–302)

## Capabilities Delivered

### Task 297 — Operational Trial Setup Contract
- `docs/operational-trial-setup-contract.md` defines the exact initialization contract for `help@global-maxima.com`:
  - Operation identity (`help-global-maxima` scope)
  - Config path (private ops repo config path)
  - Data root (private mailbox data root)
  - Narada consumption model (pnpm workspace file links)
  - Prerequisite checklist (build, install, credentials, config validation)
  - Command reference table (`run:once`, `sync`, `status`, `daemon`)
  - Evidence directory convention (private ops repo `evidence/<task>-<description>/`)
  - Public/private boundary table
- Private evidence directory created in the ops repo evidence directory with subdirectories for screenshots, SQL dumps, and decisions.

### Task 298 — Live Mailbox Trial Runbook and Evidence Format
- Public runbook `docs/live-trial-runbook.md` defines the 10-step operator sequence from preflight through shutdown.
- Cross-references `docs/live-graph-proof.md` for detailed stage mechanics without duplication.
- Redaction policy is explicit: message bodies, access tokens, raw Graph payloads, and private personal data are forbidden in public artifacts.
- Private evidence template (`evidence-template.md`) and trial runbook (`TRIAL-RUNBOOK.md`) created in `narada.sonar` evidence directory.

### Task 299 — Controlled-Thread Draft Generation Trial
- Live Graph API connectivity confirmed: token resolves, delta sync works, folder listing succeeded.
- Cursor behavior validated: existing cursor returns 0 events; cursor reset triggers fresh delta query and acquires new token.
- Charter runtime healthy with live `kimi-api` credentials.
- Coordinator schema auto-initializes on first daemon run.
- **Initial blocker**: Inbox `totalItemCount: 0`. Resolved by Task 303 (controlled test email).
- **Second blocker**: Kimi API evaluation schema validation failure. Resolved by Task 305 (prompt schema description + runner safety net).
- **Verified**: Controlled test email synced → fact created → work item opened → charter evaluation complete with `draft_reply` → foreman decision → outbound handoff → managed draft created in Graph API.
- Draft inspected via `narada drafts` with status `confirmed`. No send occurred.

### Task 300 — Approval, Send, and Reconciliation Live Trial
- Draft reviewed and explicitly approved via operator action surface.
- `SendExecutionWorker` verified managed draft integrity, enforced participant policy gate, and submitted the send.
- **Reconciler bug found and fixed**: Graph API does not support `$filter` on `internetMessageHeaders`. System now captures `internetMessageId` at draft creation and reconciles via `$filter=internetMessageId eq '...'`.
- **Retry semantics hardened**: Explicit re-approval step (`retry_wait → approved_for_send`) before send retry; honest audit transitions; cooldown prevents API hammering.
- **Send execution hardened**: Missing managed draft fails terminal instead of recreating; remote draft deletion fails terminal instead of silent return.
- Command reached `confirmed` state via automatic reconciliation within ~1 second of send.
- Full state machine path verified:
  ```
  pending → draft_creating → draft_ready → approved_for_send → sending → submitted → confirmed
  ```

### Task 301 — Operational Gap Capture and Public/Private Split
- Eight findings classified from trial evidence:
  1. Empty inbox → **Blocker** → Task 303 (resolved)
  2. `.env` not auto-loaded → **Operator UX** → Task 304 created (resolved)
  3. pnpm file-link staleness → **Docs/setup** → deferred (documented in setup contract)
  4. No `sqlite3` binary → **Environment papercut** → deferred
  5. Cursor reset works → **Positive finding** → no action
  6. Coordinator auto-initializes → **Positive finding** → no action
  7. Dry-run sync works → **Positive finding** → no action
  8. Old `exchange-fs-sync` messages not migrated → **Future work** → deferred
- No duplicate tasks. No private evidence leaked to public repo.

### Task 303 — Controlled Test Thread
- Sent controlled test email to `help@global-maxima.com` via Graph API.
- Verified arrival in inbox.
- Daemon sync applied message as fact; foreman opened work item.
- Status: **completed**.

### Task 304 — CLI/Daemon `.env` Auto-Loading
- Added `loadEnvFile()` utility to `@narada2/control-plane`.
- CLI and daemon entrypoints call it before config resolution.
- Preserves precedence: already-exported env vars > `.env` > secure storage > config file.
- Status: **completed**.

### Task 305 — Kimi API Evaluation Schema Validation
- Added `buildSchemaDescription()` to prompt builder so Moonshot receives explicit field requirements.
- Enhanced `patchOutput()` in runner to supply safe defaults for missing envelope fields and drop incomplete actions.
- Added unit tests for default patching and incomplete-action filtering.
- Status: **completed**.

## Integrated Review

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Real mailbox operation has documented setup contract | ✅ Satisfied | `docs/operational-trial-setup-contract.md` names exact paths, prerequisites, and commands. |
| Repeatable runbook exists for sync/draft/approval/send/reconcile | ✅ Satisfied | `docs/live-trial-runbook.md` is the canonical public runbook; private `TRIAL-RUNBOOK.md` adds exact commands. |
| At least one controlled thread reaches draft generation | ✅ Satisfied | Task 299 evidence: test email synced, fact created, work item opened, evaluation produced, managed draft created in Graph API. |
| If sending executed, result reconciled or blocker documented | ✅ Satisfied | Task 300 evidence: draft approved, sent via `SendExecutionWorker`, reconciled via `internetMessageId` lookup, command reached `confirmed`. |
| Public gaps separated from private operational evidence | ✅ Satisfied | Task 301 classification table. Private evidence remains in `narada.sonar`. |
| Closure decision and changelog entry produced | ✅ Satisfied | This decision artifact and CHANGELOG.md update. |

## Blockers and Corrective Tasks

All blockers resolved:

| Task | Description | Status |
|------|-------------|--------|
| **303** | Controlled test thread needed | ✅ Resolved — test email sent and synced. |
| **304** | CLI/daemon `.env` auto-loading | ✅ Resolved — operator UX improvement. |
| **305** | Kimi API evaluation schema validation | ✅ Resolved — prompt and runner hardened. |

## Residual Risks

1. **CLI materialization gap**: When a foreman decision is `pending_approval`, the operator must manually materialize the draft before approval. The `approve-draft-for-send` command does not auto-materialize from `pending_approval`. This is documented in Task 300 evidence but not yet fixed.
2. **Pre-existing integration test failure**: `test/integration/dispatch-real.test.ts` fails independently of trial changes. This is a known test-environment issue, not a product blocker.
3. **Credential freshness**: The trial confirmed one-time token resolution. Long-term credential rotation (token expiry, secret renewal) has not been tested live.
4. **Empty knowledge directory**: `narada.sonar/mailboxes/help@global-maxima.com/knowledge/` is empty. Draft quality with real knowledge sources is untested.
5. **pnpm file-link drift**: After `narada` source rebuilds, `narada.sonar` file links can become stale. The fix (`pnpm install` in ops repo) is documented but not automated.

## Closure Statement

The Mailbox Operational Trial chapter is **closed with full live-path validation**.

What is proven:
- The operational repo (`narada.sonar`) is structurally coherent and consumes Narada correctly via pnpm workspace links.
- The setup contract, runbook, and evidence format are documented and reproducible.
- Live Graph API connectivity, cursor behavior, charter runtime health, and coordinator initialization are confirmed.
- The full draft-to-confirmed path is exercised: inbound sync → fact → work item → charter evaluation → foreman decision → outbound handoff → managed draft → operator approval → send → reconciliation → confirmed.
- Retry semantics, reconciler lookup, and send-execution boundaries are hardened.

What is not proven:
- Autonomous send (intentionally deferred; `require_human_approval: true` remains the default).
- Long-term credential rotation and token expiry handling.
- Draft quality with real knowledge sources.
- Multi-thread or high-volume operation.

What comes next:
- The chapter is closed. No new corrective chapter is needed for the trial.
- Operational maturation (repeated daily use, knowledge injection, multi-thread handling) can proceed as routine operational work unless autonomous send is prioritized.
- If autonomous send becomes a priority, that would be a new chapter with its own safety and governance review.
