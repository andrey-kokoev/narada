# Narada Changelog

This changelog tracks semantic chapters in Narada's development: concepts that became canonical, authority boundaries that changed, operator surfaces that became real, and intentionally deferred work.

It is not a package-level release log. Package publishing changes belong in Changesets.

## Operational Trust

Narada gained the operator-facing surfaces needed to run a live operation safely, inspect it, audit it, and recover from failure:

- **Health/readiness contract** (Task 234): Two-level probe model — `/health` checks sync freshness + outbound health; `/ready` checks dispatch readiness + outbound health + required worker registration. Readiness is surfaced in `.health.json`, `narada status`, and configurable thresholds.
- **Stuck detection** (Task 235): On-demand SQL queries detect stuck work items (`opened`, `leased`, `executing`, `retry_exhausted`) and stuck outbound commands (`pending`, `draft_creating`, `draft_ready`, `sending`). Counts feed into health reporting and dedicated observation API routes.
- **Audit inspection** (Task 236): `operator_action_requests` is exposed via `GET /operator-actions`, `narada audit`, and an Audit Log UI page. `preview_work` payloads are redacted to summary-only before exposure.
- **Lifecycle runbooks** (Task 237): Graceful shutdown with bounded drain, systemd unit with `Restart=on-failure`, recovery runbook covering crash recovery, DB corruption, stale cursors, stuck work, and stuck outbound. Daily operation and first-time setup runbooks exist.
- **Draft disposition** (Task 238): Operators can `reject_draft`, `mark_reviewed`, or `handled_externally` on `draft_ready` outbound commands. All actions route through a canonical audit-first executor shared by CLI and daemon.

Corrective follow-ups applied:
- Task 246: `buildScopeDispatchSummary` stopped computing `sync_fresh` from `work_items.updated_at`.
- Task 266: `/ready` worker registration tightened from "any worker" to all `OUTBOUND_WORKER_IDS`.
- Task 267: CLI disposition commands moved to the canonical `executeOperatorAction()` executor; `payload_json` double-encoding fixed.

Deferred:
- Autonomous send remains draft-only by default.
- Real-time health streaming and alerting webhooks are not implemented.

## Live Operation

Narada gained its first fixture-backed live-operation path for a support mailbox:

- A support operation can be configured around `support_steward`.
- Charter invocation now supports support-specific prompt materialization and knowledge injection.
- The draft-proposal pipeline is exercised through work opening, charter execution, evaluation, foreman decision, and outbound handoff.
- Operators can inspect evaluations, decisions, and executions through CLI, API, and UI surfaces.
- A smoke fixture captures the safe-mode distinction between draft proposal and governed execution.

Concrete outcomes:

- Added Live Operation task graph and acceptance artifacts (`227-232`).
- Added support-charter prompt selection and mailbox materializer coverage.
- Added deep inspection queries for evaluation, decision, execution, and context evaluations.
- Added `narada show --type <evaluation|decision|execution> --id <id>` with focused CLI coverage.
- Added UI deep links/detail views for evaluation, decision, and execution inspection.
- Added fixture-backed live-operation smoke coverage and a runbook.

Authority clarifications:

- Safe posture can stop at human approval while full pipeline fixtures can prove downstream handoff.
- Inspection remains read-only and does not become authority.
- Unknown explicit `--scope` on inspection hard-fails instead of falling back to the first scope.

Deferred:

- Live Graph draft creation and fact persistence checks remain credential/service dependent.
- Operational Trust work (`234-238`) follows this chapter and covers readiness, stuck detection, audit, lifecycle runbooks, and draft disposition.

## Operator Closure

Narada's operator surface was reorganized into named families:

- **Selection**: a canonical selector grammar for bounding operator input sets.
- **Re-derivation**: explicit replay, preview, recovery, confirmation replay, and projection rebuild surfaces.
- **Promotion**: explicit lifecycle advancement through audited operator actions.
- **Inspection**: read-only operator family for observing durable or derived state.
- **Advisory signals**: non-authoritative hints that can influence routing, timing, review, and attention without changing truth, permission, or lifecycle authority.

The chapter clarified that operators are not ad-hoc commands. They are named families with authority boundaries, selection bounds, and explicit relationships to durable state.

Concrete outcomes:

- `derive-work`, `preview-work`, `recover`, `confirm-replay`, and `rebuild-projections` are treated as explicit operator surfaces.
- `ConfirmationReplay` became the generic confirmation-boundary replay operator, with mail reconciliation and process confirmation as family instances.
- `Selector` became the canonical bounded-selection type for fact and derivation surfaces.
- `retry_failed_work_items` became an audited promotion surface for retry readiness.
- `inspection` became the canonical read-only operator family.
- `continuation_affinity` became the first implemented advisory signal, scoped to v1 ordering-only behavior.

Authority clarifications:

- Selection and inspection are read-only and authority-agnostic.
- Promotion is explicit, audited, and authority-classed.
- Recovery and replay share a derivation core but have distinct operator intent and authority framing.
- Advisory signals cannot override facts, leases, policy, decisions, intents, executions, confirmations, or governance.

Deferred:

- Broader routing-signal runtime beyond `continuation_affinity`.

## Multi-Agent Task Governance

Narada gained explicit agent task governance: roster, assignment, lifecycle automation, review loops, and chapter closure.

- **Roster and assignment** (Task 260): `.ai/agents/roster.json`, atomic claim/release operators, dependency-checked assignment with execution budgets.
- **Lifecycle automation** (Task 261): Canonical status machine (`draft → opened → claimed → in_review → closed → confirmed`), `depends_on` enforcement, continuation protocol for budget exhaustion.
- **Review loop and allocator** (Task 262): Structured findings, `narada task review`, `derive-from-finding` corrective task generation, atomic task number allocation.
- **Chapter closure** (Task 263): `narada chapter close` with dry-run, terminal-status verification, closure artifact generation, and confirmation transition.
- **Continuation affinity** (Task 263): Advisory warm-agent routing via task front-matter (`preferred_agent_id`, `affinity_strength`). Claim operator may sort by affinity; affinity never blocks runnable work.
- **USC boundary hardening** (Tasks 257/279): Version-pinned USC bridge (`config.uscVersion`), schema cache fallback, `narada init usc-validate <path>`.

Corrective follow-ups applied:
- Task 268: Assignment claim/release hardened against partial mutation and missing continuation packets.
- Task 271: Lifecycle release operator fixed to validate continuation before mutating assignment.
- Task 274: Review allocator integrity tightened; derive-from-finding uses correct dependency linking.
- Task 280: Chapter close stops mutation when non-terminal tasks exist; closure artifact uses explicit `.ai/decisions/` path.

Authority clarifications:

- Static schema defines shapes; operators perform transitions.
- Runtime owns durable state and leases; it does not own task file mutations.
- USC packages are read by tooling/runtime but must not assume runtime state or operator behavior.
- Advisory signals are non-authoritative; removing them must leave all durable boundaries intact.

Deferred:

- Race-safe task number allocator (file-lock or SQLite-backed).
- Broader routing signals beyond continuation affinity (priority, deadline, skill matching).
- Automatic task dependency DAG visualization.
- Commit-boundary tracking for this chapter.

## Operation Realization

Narada gained the canonical bootstrap path and the first mailbox operation product proof.

- **Bootstrap contract** (Task 283): `docs/bootstrap-contract.md` defines the canonical five-step path from intent to runnable operation. `QUICKSTART.md` is restructured as the walkthrough. CLI commands (`init-repo`, `want-mailbox`) emit artifact manifests and next-step guidance aligned with the contract.
- **Real executor attachment and degraded-state contract** (Task 284): `probeHealth()` is first-class on `CharterRunner`. Five health classes (`healthy`, `degraded_draft_only`, `partially_degraded`, `broken`, `unconfigured`) define explicit production behavior. Execution gating in the daemon skips dispatch when health does not permit execution. `getRecoveryGuidance()` provides structured operator advice for every degraded state.
- **First operation product proof** (Task 285): `docs/first-operation-proof.md` defines the support mailbox as the canonical proof case, documents fixture-backed vs live-backed responsibilities, and provides inspection checkpoints for every pipeline stage.
- **Operator live-loop ergonomics** (Task 286): `docs/operator-loop.md` defines the five-step operator rhythm. `narada ops` composes health, recent activity, attention queue, and drafts pending review into one read-only CLI dashboard.

Concrete outcomes:

- Fixture-backed smoke test (`smoke-test.test.ts`) is packaged as the canonical offline proof.
- Live-backed verification commands (`preflight`, `explain`, `show`, `status`, `ops`) are documented as the runtime proof path.
- Explicit separation table states what is proven offline and what requires live exercise.
- Public repo vs private ops repo boundaries are documented.
- Degraded-state handling is visible in CLI (`doctor`, `ops`), API (`/health`, `/ready`), and health file (`.health.json`).
- Operator loop is discoverable from `docs/operator-loop.md`, `docs/runbook.md`, and the `narada ops` command.

Authority clarifications:

- Fixture-backed proof demonstrates mechanical correctness; live-backed proof demonstrates real data/API compatibility.
- Neither substitutes for the other.
- Default posture remains `draft-only` with human approval required.
- Foreman governance enforces draft-first independently of runtime health.

Deferred:

- Live Graph API draft creation proof (requires credentials) — addressed by Mailbox Saturation.
- Autonomous send remains deferred for safety.
- Multi-vertical operations (timer, webhook, filesystem) need separate acceptance.
- Fleet/multi-operation dashboard remains a future milestone.
- Commit-boundary tracking for this chapter is deferred.

## Mailbox Saturation

Narada gained the canonical live-mailbox proof contract and the operator runbook for exercising real Graph API end-to-end.

- **Live Graph proof saturation** (Task 291): `docs/live-graph-proof.md` defines the canonical six-stage proof for the full draft-to-confirmed path: inbound thread selected → evaluation produced → outbound draft created → draft approved for send → send submitted → reconciliation confirms sent result. Each stage specifies durable evidence, canonical inspection commands, and pass criteria. The public/private evidence split is explicit: the public repo contains the contract and method; the private ops repo contains live transcripts and evidence.

Concrete outcomes:

- Six-stage proof contract with exact state machine progression (`pending → draft_creating → draft_ready → approved_for_send → sending → submitted → confirmed`).
- Canonical inspection commands for every stage (`narada ops`, `narada show`, `narada approve-draft-for-send`, `sqlite3` direct queries).
- Operator runbook for executing the proof from pre-flight through confirmation logging.
- Cross-references from `first-operation-proof.md`, `operator-loop.md`, and `runbook.md`.

Authority clarifications:

- Live proof does not replace fixture-backed proof. They are complementary: fixtures prove mechanical correctness; live proof proves real API/data compatibility.
- Default posture remains `draft-only` with `require_human_approval: true`.
- No private mailbox content or credentials may enter the public repository.

Concrete outcomes:

- `narada drafts` command provides focused mailbox-specific draft overview grouped by status with counts and available actions (Task 296).
- Draft review and promotion ergonomics coherent via `narada show-draft` and `narada drafts` with decision lineage, evaluation lineage, review status, and available actions (Task 292).
- Day-2 mailbox failure modes enumerated and classified (auth expiry, Graph drift, attachment edge cases, recovery drills) (Task 293).
- Compact canonical scenario basis defined for five conversational shapes: login/access, billing, refund, escalation, clarification (Task 294).
- Knowledge placement model explicit across public repo, private ops repo, and charter consumption points (Task 295).

Deferred:

- Autonomous send by default — safety-first posture keeps `draft-only` with `require_human_approval: true` as the production default.
- Real-time UI updates for draft state — CLI is the primary operator surface; daemon observation API provides polling-based UI.
- Fleet/multi-operation dashboards — `narada ops` and `narada drafts` are scoped to one config at a time.

## Mailbox Operational Trial

Narada's operational repo (`narada.sonar`) was exercised against the live Graph API for `help@global-maxima.com`, proving the full draft-to-confirmed path end-to-end.

- **Setup contract** (Task 297): `docs/operational-trial-setup-contract.md` names exact paths, config shape, data root, prerequisite checklist, command reference, and public/private boundary table. Private evidence directory convention established in `narada.sonar`.
- **Live runbook and evidence format** (Task 298): `docs/live-trial-runbook.md` provides the canonical 10-step operator sequence. Redaction policy is explicit. Private `TRIAL-RUNBOOK.md` and `evidence-template.md` live in the ops repo.
- **Controlled-thread draft generation** (Task 299): Live Graph API connectivity confirmed. Controlled test email synced, fact created, work item opened, charter evaluation produced `draft_reply` action, foreman decision created, outbound handoff created, managed draft created in Graph API. Initially blocked by empty inbox (Task 303) and Kimi API schema validation (Task 305); both resolved.
- **Approval, send, and reconciliation** (Task 300): Draft reviewed and explicitly approved via operator action surface. `SendExecutionWorker` verified draft integrity, enforced participant policy gate, and submitted the send. Reconciler bound submitted command to inbound message using `internetMessageId` filter, transitioning to `confirmed` within ~1 second. Reconciler bug (`internetMessageHeaders` filtering unsupported) fixed. Retry semantics hardened with explicit re-approval (`retry_wait → approved_for_send`) and honest audit transitions.
- **Gap capture and public/private split** (Task 301): Eight findings classified. Public corrective tasks: 303 (test thread), 304 (`.env` auto-loading), 305 (Kimi API schema validation). Five findings deferred or classified as positive observations.
- **Supporting work**: Task 303 created controlled test thread; Task 304 added `.env` auto-loading to CLI and daemon; Task 305 hardened `kimi-api` prompt schema description and runner safety net.

Concrete outcomes:

- Operational repo structure is coherent and reproducible.
- Live Graph API sync pipeline is functional against real credentials.
- Charter runtime is healthy with live `kimi-api` after schema binding fixes.
- Full state machine path verified:
  ```
  pending → draft_creating → draft_ready → approved_for_send → sending → submitted → confirmed
  ```
- Reconciler uses `internetMessageId` capture at draft creation instead of broken `internetMessageHeaders` filter.
- Send execution enforces review invariant: missing or deleted managed drafts fail terminal instead of being recreated.
- Retry cooldown and explicit re-approval prevent API hammering and produce honest audit trails.
- `.env` auto-loading removes operator friction while preserving secret precedence.

Authority clarifications:

- Structural readiness (config, sync, runtime health) is proven separately from end-to-end operational correctness, and both are now satisfied.
- Fixture-backed proof and live-backed proof are complementary, not substitutable. The live trial does not replace fixture-backed smoke tests.
- Public/private boundary held: no message bodies, credentials, Graph IDs, or raw payloads entered the public repo.
- Default posture remains `draft-only` with `require_human_approval: true`. Autonomous send is intentionally deferred.

Deferred:

- Autonomous send by default — safety-first posture keeps human approval required.
- CLI materialization gap: `approve-draft-for-send` does not auto-materialize from `pending_approval`.
- Long-term credential rotation and token expiry handling untested live.
- Draft quality with real knowledge sources untested (knowledge directory is empty).
- One pre-existing integration test failure (`dispatch-real.test.ts`) is a test-environment issue, not a product blocker.
