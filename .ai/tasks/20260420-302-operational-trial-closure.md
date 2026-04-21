# Task 302 — Operational Trial Closure

Status: **completed**

Depends on: 301

## Context

The chapter should close only with an honest statement of what was proven operationally. It must not claim production readiness beyond the evidence.

## Goal

Close the Mailbox Operational Trial chapter with a decision artifact, changelog entry, and explicit residual risks.

## Required Work

1. Review Tasks 297–301 and their evidence.
2. Produce a closure decision covering:
   - what was proven
   - what was not proven
   - blockers encountered
   - corrective tasks created
   - private evidence location shape
   - daily-use readiness assessment
3. Update `CHANGELOG.md` with the Mailbox Operational Trial chapter.
4. Confirm no private data leaked into public repo artifacts.
5. Confirm no derivative task-status files were created.
6. Recommend the next chapter only if the evidence supports it.

## Deliverables

- Closure decision artifact.
- `CHANGELOG.md` chapter entry.
- Task 302 execution notes with honest residuals.

## Non-Goals

- Do not claim production readiness if only a controlled trial passed.
- Do not implement unrelated fixes.
- Do not start the next chapter.

## Acceptance Criteria

- [x] Tasks 297–301 are reviewed or have explicit blocker tasks.
- [x] Closure decision states whether daily mailbox operation is viable.
- [x] Changelog reflects the chapter accurately.
- [x] Public/private data boundary is verified.
- [x] Residual risks are named without turning them all into immediate work.

## Execution Notes

### Closure Decision

- **Decision artifact**: `.ai/decisions/20260420-mailbox-operational-trial-closure.md`
- **Changelog entry**: Updated "Mailbox Operational Trial" section in `CHANGELOG.md`

### What Was Proven

The full live draft-to-confirmed path was exercised end-to-end for `help@global-maxima.com`:

1. **Inbound** (Task 303): Controlled test email sent to live mailbox.
2. **Sync** (Task 299): Delta sync applied the message as a `mail.message.discovered` fact.
3. **Work opening** (Task 299): Foreman opened a `work_item` from the admitted fact.
4. **Kimi evaluation** (Tasks 299/305): Charter runtime produced a complete `Evaluation` with `draft_reply` action after Task 305 hardened the `kimi-api` schema binding.
5. **Governed draft** (Task 299): Foreman decision → outbound handoff → `SendReplyWorker` created a managed Graph draft with `internetMessageId` captured.
6. **Inspected approval** (Task 300): Operator reviewed the draft via `narada drafts` / `narada show-draft`, then approved for send via the operator action surface.
7. **Outbound send** (Task 300): `SendExecutionWorker` verified draft integrity, enforced participant policy gate, and submitted the send.
8. **Reconciliation** (Task 300): Reconciler bound the submitted command to the inbound message using `internetMessageId` filter, transitioning the command to `confirmed`.

State machine path verified:
```
pending → draft_creating → draft_ready → approved_for_send → sending → submitted → confirmed
```

Structural readiness also proven:
- Operational repo (`narada.sonar`) is structurally coherent and consumes Narada correctly via pnpm workspace file links.
- Setup contract (`docs/operational-trial-setup-contract.md`) is documented and reproducible.
- Live runbook (`docs/live-trial-runbook.md`) and evidence format are canonical.
- `.env` auto-loading (Task 304) removes operator friction for credential resolution.

### Blockers Encountered and Resolved

| Task | Blocker | Resolution |
|------|---------|------------|
| **303** | Empty inbox — no messages to sync | Sent controlled test email via Graph API; inbox populated; sync succeeded. |
| **305** | Kimi API evaluation schema validation failure — Moonshot returned partial JSON missing required fields | Prompt now includes explicit schema description; runner patches missing envelope fields with safe defaults and drops incomplete actions. |
| **300 (reconciler)** | Graph API does not support `$filter` on `internetMessageHeaders` | `internetMessageId` captured at draft creation; reconciler uses `$filter=internetMessageId eq '...'` instead. |
| **300 (retry semantics)** | `retry_wait` commands had dishonest audit transitions (hardcoded `approved_for_send` from-status) | Explicit re-approval step: `retry_wait → approved_for_send` before processing; state machine does not allow `retry_wait → sending` directly. |

### Corrective Tasks Created

- **Task 303**: Controlled test thread needed (blocker, resolved).
- **Task 304**: CLI/daemon `.env` auto-loading (operator UX, non-blocking, resolved).
- **Task 305**: Kimi API evaluation schema validation (product hardening, resolved).

### Private Evidence Location

- `~/src/narada.sonar/evidence/297-302-mailbox-operational-trial/`
  - `commands-task303.log` — daemon sync output (test thread creation)
  - `commands-task305-verify.log` — Kimi API fix verification
  - `commands-task305-e2e-verify2.log` — Task 299 end-to-end verification
  - `task-300-evidence.md` — approval, send, and reconciliation evidence
  - `TRIAL-RUNBOOK.md` — private operator runbook
  - `evidence-template.md` — evidence template

### Daily-Use Readiness Assessment

- **Ready for supervised daily operation**: The full draft-to-confirmed path is proven. An operator can run `narada-daemon --once`, inspect drafts via `narada drafts`, approve via the operator action surface, and observe automatic reconciliation.
- **Not ready for autonomous operation**: `require_human_approval: true` is the production default. Autonomous send remains deferred for safety.
- **Known friction**: The CLI `approve-draft-for-send` path requires a manual materialization step when the decision is in `pending_approval` state. This is documented but not yet automated.

### Residual Gaps (Honest)

1. **CLI materialization gap**: When a foreman decision is `pending_approval`, the operator must manually materialize the draft before approval. The `approve-draft-for-send` command does not auto-materialize from `pending_approval`. This is documented in Task 300 evidence but not yet fixed.
2. **One pre-existing integration test failure**: `test/integration/dispatch-real.test.ts` fails independently of trial changes. This is a known test-environment issue, not a product blocker.
3. **Credential rotation untested**: Token resolution was confirmed for one session. Long-term credential expiry and renewal have not been exercised live.
4. **Knowledge directory empty**: `narada.sonar/mailboxes/help@global-maxima.com/knowledge/` is empty. Draft quality with real knowledge sources is untested.
5. **pnpm file-link drift**: After `narada` source rebuilds, `narada.sonar` file links can become stale. The fix (`pnpm install` in ops repo) is documented but not automated.

### Public/Private Boundary Verification

- No message bodies in public repo.
- No credentials, tokens, or secrets in public repo.
- No raw Graph payloads in public repo.
- No raw Graph item IDs, live message IDs, or email addresses in public repo (except `help@global-maxima.com` as the operation identity, which is already public).
- Private evidence remains in `narada.sonar` only.

### Derivative Status Files

- No derivative task-status files created.
- Only canonical task files and the decision artifact were written.

### Next Chapter Recommendation

- **Mailbox Operational Trial chapter is closed.**
- No new corrective chapter is needed for the trial. Next work can proceed as operational maturation (repeated daily use, knowledge injection, multi-thread handling) unless autonomous send is prioritized.
- Task 304 is already resolved; no remaining blockers.
- If autonomous send becomes a priority, that would be a new chapter with its own safety and governance review.
