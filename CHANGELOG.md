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
