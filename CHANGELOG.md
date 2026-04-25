# Narada Changelog

This changelog tracks semantic chapters in Narada's development: concepts that became canonical, authority boundaries that changed, operator surfaces that became real, and intentionally deferred work.

It is not a package-level release log. Package publishing changes belong in Changesets.

## Construction Operation

Narada's task-graph execution loop was defined, designed, and fixture-proven as a governed Construction Operation — the human-architect-agent development cycle that advances a system while preserving long-horizon coherence.

- **Boundary contract** (Task 410): `.ai/decisions/20260422-410-construction-operation-boundary-contract.md` defines the Aim ("advance a software system through governed task-graph execution"), Site (local filesystem with `.ai/do-not-open/tasks/`, roster, assignments, reviews), Cycle (scan → recommend → claim → execute → review → confirm), Act taxonomy (12 governed actions with authority classes), Trace taxonomy (10 trace types with retention rules), and an authority matrix separating operator, architect, agent, and system roles.
- **Assignment planner design** (Task 411): `.ai/decisions/20260422-411-assignment-planner-design.md` defines a 6-dimension scoring function (affinity 0.30, capability 0.25, load 0.20, history 0.10, review separation 0.10, budget 0.05), greedy conflict resolution, confidence classification (high/medium/low), and 6 explicit abstain conditions. The planner is advisory — it does not auto-claim.
- **PrincipalRuntime integration contract** (Task 412): `.ai/decisions/20260422-412-principal-runtime-integration-contract.md` defines read-only data flow from PrincipalRuntime state and roster into the planner, conservative conflict resolution favoring operator knowledge, and budget-exhaustion handoff semantics.
- **Review separation and write-set conflict design** (Task 413): `.ai/decisions/20260422-413-review-separation-write-set-conflict.md` defines manifest-based write-set tracking (`--files` at claim time), file-overlap conflict detection, review-separation checks (reviewer≠worker), and backward-compatible schema extensions.
- **Fixture proof** (Task 414): `packages/layers/cli/test/fixtures/construction-operation/` contains a synthetic task graph (10 tasks), roster (4 agents), PrincipalRuntime states, and a recommendation engine test harness. 10 tests pass covering basic recommendation, affinity routing, dependency blocking, review separation, write-set conflict, budget exhaustion, and graceful abstention. Top-3 accuracy ≥ 80%, 0 false negatives for separation and conflict detection.

Concrete outcomes:

- 4 decision artifacts in `.ai/decisions/` (410–413).
- 1 fixture with 10 passing tests in `packages/layers/cli/test/fixtures/construction-operation/`.
- No production code changes — this chapter was pure design and fixture proof.

Authority clarifications:

- Assignment recommendation is advisory, not authoritative. Human operator retains final claim/priority/veto authority.
- Review separation and write-set checks are warnings, not blockers.
- PrincipalRuntime state is ephemeral; roster is advisory; task governance is durable.

Deferred:

- Autonomous dispatch and auto-claim — post-415 chapter.
- Cost estimation with live budget telemetry — post-415 chapter.
- Dynamic capability learning from historical assignments — future telemetry task.
- Git-diff based write-set tracking — post-415 chapter.
- Production integration of planner into `narada task recommend` — future implementation chapter.

---

## Operator Console / Site Registry

Narada gained a cross-Site operator console backed by a Site Registry that discovers, inspects, and routes control requests without becoming hidden authority:

- **Boundary contract** (Task 379): `docs/deployment/operator-console-site-registry-boundary-contract.md` defines explicit authority boundaries — registry is inventory + routing only; no direct Site-state mutation; observation/control separation with endpoint namespace rules.
- **Site Registry** (Task 380): SQLite-backed registry discovers Windows native and WSL Sites by filesystem scan (`%LOCALAPPDATA%\Narada\*`, `/var/lib/narada/*`, `~/narada/*`). Stores metadata (`site_id`, `variant`, `site_root`, `substrate`, `aim_json`, `last_seen_at`). Safe to delete — Sites remain intact.
- **Cross-Site health aggregation** (Task 381): `aggregateHealth()` queries each Site's observation API and produces a unified summary. `deriveAttentionQueue()` computes a derived, read-only attention queue across all Sites. Notification router respects per-channel cooldown (15 minutes default).
- **Audited control request router** (Task 382): `ControlRequestRouter` forwards operator actions to Site-owned control APIs and logs every routing event to an append-only `registry_audit_log`. Unknown Sites rejected. No automatic retry. No caching.
- **CLI surface** (Task 383): `narada sites list/discover/show/remove` for Site management. `narada console status/attention/approve/reject/retry` for cross-Site health and control.

Authority clarifications:
- Console is an operator surface, not an Aim, Site, Vertical, Cycle, or control plane.
- All observation paths are GET-only. All mutation routes through Site-owned APIs with audit.
- Registry audit is separate from Site `operator_action_requests` audit.

Deferred:
- Cloudflare Site console integration (remote discovery requires endpoint URLs and auth tokens).
- Live Windows Site control client binding in CLI console commands (returns `No control client available` until wired).
- GUI / web UI surface (CLI is the v0 operator surface).
- Fleet-wide orchestration (console observes and routes; does not trigger Cycles across Sites).

---

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

## Unattended Operation

Narada's unattended layer moved from design to executable behavior. A Cloudflare Site can now degrade health, recover from stuck cycles, and alert the operator without human babysitting.

- **Health decay wiring** (Task 340): Pure `computeHealthTransition` helper encodes the state machine (`healthy` → `degraded` → `critical` / `auth_failed`). Local daemon and Cloudflare runner both use it. Success resets to `healthy` with `consecutiveFailures = 0`.
- **Stuck-cycle recovery** (Task 341): Cloudflare DO `site_locks` table detects expired locks via TTL comparison. A new cycle atomically steals the stale lock, records a recovery trace (`previousCycleId`, `stuckDurationMs`, `lockTtlMs`), and proceeds. Health transitions to `critical` on recovery.
- **Operator notification emission** (Task 342): `OperatorNotification` envelope with severity, health status, summary, detail, suggested action, and cooldown. `LogNotificationAdapter` is the zero-config default. `DefaultNotificationEmitter` coordinates adapters with per-channel rate limiting. Notifications are emitted on transition to `critical`, transition to `auth_failed`, and stuck-cycle recovery.
- **Recovery fixture** (Task 343): Narrative fixture proves the full loop: repeated failures decay health to `critical` and emit a notification; a successful cycle resets health to `healthy`. Second fixture proves stuck-lock recovery → trace + notification → successful completion.

Concrete outcomes:

- `packages/layers/control-plane/src/health.ts` — canonical `computeHealthTransition` with 17 tests.
- `packages/sites/cloudflare/src/health-transition.ts` — Cloudflare-local mirror with 8 tests.
- `packages/sites/cloudflare/src/notification.ts` — emission surface with 6 tests.
- `packages/sites/cloudflare/test/unit/unattended-recovery.test.ts` — 2 narrative fixtures proving end-to-end unattended loop.
- 96 tests pass across the Cloudflare package (12 test files).

Authority clarifications:

- Health, notifications, and recovery traces are advisory signals. Removing the entire unattended layer leaves all durable boundaries intact.
- Stuck-cycle recovery is mechanical lock steal only. It does not classify work-item failures or mutate Foreman/Scheduler/Outbound state.
- Notification failure is swallowed with `try/catch`. No control decision depends on delivery.

Deferred:

- Local daemon does not emit operator notifications (health transitions exist, notification wiring does not).
- Local daemon does not implement cycle-level stuck-lock recovery (sync-level `FileLock` and scheduler lease recovery already exist).
- Webhook/email/SMS notification adapters — future work.
- Real Narada kernel steps (sync, evaluate, govern, handoff, reconcile) in Cloudflare runner — Cloudflare v1 chapter.

## Cloudflare Kernel Spine Port

Narada's Cloudflare Cycle runner gained a fixture-backed kernel spine. Steps 2–6 are no longer placeholder no-ops; they perform typed, bounded, fixture-safe kernel work over DO SQLite durable state.

- **Cycle Step Contract** (Task 345): `CycleStepHandler` contract with `stepId`, `stepName`, `status`, `recordsWritten`, `residuals`, `startedAt`/`finishedAt`. `runCycle` invokes steps 2–6 through handlers. Failed steps throw, caught by outer catch block, triggering health decay + lock release. `stepResults` included in `CycleResult` and `CycleTraceRecord`.
- **Delta/Facts Persistence** (Task 346): `createSyncStepHandler(deltas)` admits fixture source deltas into durable facts. Deduplicates by `event_id` via `apply_log`. Updates `source_cursors`. Returns admitted/skipped counts.
- **Governance Spine** (Task 347): `createDeriveWorkStepHandler` creates contexts and work items from unadmitted facts. `createEvaluateStepHandler` runs pure `fixtureEvaluate` over open work items and persists evaluation records. `createHandoffStepHandler` creates decisions and outbound commands. IAS boundaries preserved: facts ≠ context/work, evaluation ≠ decision, decision ≠ intent/handoff.
- **Confirmation/Reconciliation** (Task 348): `createReconcileStepHandler(observations)` confirms outbound commands only against externally-provided `FixtureObservation[]`. Self-confirmation is structurally impossible. Unconfirmed outbounds remain `pending`.
- **Kernel Spine Fixture** (Task 349): End-to-end fixture through `runCycle()` with real SQLite-backed coordinator proves the full spine: delta → fact → context/work → evaluation → decision → outbound → observation → confirmation → trace/health.

Concrete outcomes:

- `packages/sites/cloudflare/src/cycle-step.ts` — step contract + 5 step handler factories + pure fixture evaluator.
- `packages/sites/cloudflare/src/coordinator.ts` — DO schema extended with `facts`, `source_cursors`, `apply_log`, `context_records`, `work_items`, `evaluations`, `decisions`, `outbound_commands`, `fixture_observations`.
- `packages/sites/cloudflare/src/types.ts` — `FactRecord`, `FixtureSourceDelta`, `CycleStepResult`, `FixtureObservation`.
- 133 tests pass across the Cloudflare package (17 test files).

Authority clarifications:

- All IAS boundaries are separately persisted and queryable in DO SQLite.
- `fixtureEvaluate` is pure with zero side effects.
- Confirmation requires external observation input.
- Trace/health are advisory; removing them leaves durable boundaries intact.

Deferred:

- Live Microsoft Graph sync — v1.
- Real charter runtime in Cloudflare Sandbox — v1.
- Real email draft/send — v1.
- Live reconciliation against Graph API — v1.
- Cron Trigger wiring for scheduled cycles — v1.
- DO RPC via `fetch()` instead of direct method calls — v1.
- Generic Runtime Locus abstraction — deferred until second substrate proven.

## Cloudflare Effect Execution Boundary

Narada's Cloudflare Site crossed from live-safe read/control adapters into one bounded effect-execution path without collapsing intelligence, authority, execution, and confirmation.

- **Effect Execution Authority Contract** (Task 358): `docs/deployment/cloudflare-effect-execution-authority-contract.md` defines the fifth adapter class (effect-execution), the first allowed effect path (`send_reply` via Graph draft/send), approved-command eligibility, full state transition grammar, execution attempt evidence schema, retry/terminal failure semantics, confirmation separation, forbidden shortcuts, and no-overclaim language.
- **Effect Worker State Machine** (Task 359): `executeApprovedCommands` implements approved-only execution with action-type gating (`send_reply` only), lease-based concurrency, health gate (`auth_failed` blocks), and execution attempt record creation before adapter call. Transitions: `attempting` → `submitted` | `failed_retryable` | `failed_terminal`. Never transitions to `confirmed`.
- **Bounded Graph Draft/Send Adapter** (Task 360): `GraphDraftSendAdapter` performs two-stage draft creation + send with retry loop and terminal/retryable error classification. `GraphDraftClient` interface is mockable. Purely mechanical — no eligibility, approval, or confirmation authority.
- **Execution Audit And Failure Semantics** (Task 361): Integration bridge `createSendReplyEffectAdapter` wires the worker to the Graph adapter, parses payload, serializes full external identity (draftId, sentMessageId, internetMessageId, submittedAt) into `responseJson` for audit. Malformed payload → terminal failure. Duplicate prevention via active lease.
- **Reconciliation After Execution** (Task 362): `createLiveReconcileStepHandler` updated to query `submitted` outbounds and enrich them with `internetMessageId` from execution attempt `responseJson`. Confirmation remains the exclusive concern of reconciliation. Worker and adapter never set `confirmed`.
- **Effect Execution Proof** (Task 363): Focused tests prove the full path: operator approval → `approved_for_send` → execution attempt → external adapter submit → `submitted` → separate reconciliation observation → `confirmed`. Boundary assertions: evaluator does not execute, approval precedes execution, adapter does not decide authority, submitted ≠ confirmed, confirmation requires observation, audit records are inspectable.

Concrete outcomes:

- `packages/sites/cloudflare/src/effect-worker.ts` — approved-only effect worker.
- `packages/sites/cloudflare/src/effects/graph-draft-send-adapter.ts` — bounded Graph draft/send adapter.
- `packages/sites/cloudflare/src/effects/send-reply-adapter.ts` — worker-to-adapter integration bridge.
- `packages/sites/cloudflare/src/coordinator.ts` — extended with `getSubmittedOutboundCommands`, `getLatestExecutionAttempt`, `execution_attempts` schema.
- `packages/sites/cloudflare/src/cycle-step.ts` — `createLiveReconcileStepHandler` enriched with execution-attempt lookup.
- 253 tests pass across the Cloudflare package (28 test files).

Authority clarifications:

- `approved_for_send` is the only execution entry gate.
- Execution success (`submitted`) does not equal confirmation (`confirmed`).
- Reconciliation exclusively owns confirmation.
- Operator approval and execution attempts are both audited and inspectable.
- External Graph API boundary is mocked; no real email is sent.

Deferred:

- Real Microsoft Graph API calls with credential binding and token refresh.
- Effect worker wired into `runCycle()` as a cycle step.
- Per-command retry limit enforcement (max 5 `failed_retryable` before auto-promotion).
- Additional effect types: `move_message`, `mark_read`, `set_categories`.
- Production deployment, egress policy, and operational monitoring.

## Cloudflare Live Adapter Spine

Narada's Cloudflare Site gained four bounded live adapter seams around the fixture-backed kernel spine, plus a boundary contract that governs what may become live and what must remain fixture-backed or blocked.

- **Live Adapter Boundary Contract** (Task 351): `docs/deployment/cloudflare-live-adapter-boundary-contract.md` defines the adapter taxonomy (source-read, charter-runtime, reconciliation-read, operator-control in scope; effect-execution out of scope), authority boundaries adapters cannot cross, and no-overclaim language. Cross-referenced by all implementation tasks.
- **Live Source Adapter** (Task 352): `HttpSourceAdapter` reads from an HTTP endpoint and produces deltas for fact admission. `createLiveSyncStepHandler` wires it into step 2. Adapter failure is caught before state mutation. Cursor advances only to the last processed delta.
- **Sandbox Charter Runtime Attachment** (Task 353): `MockCharterRunner` runs inside `runSandbox` with timeout/memory guards. `createSandboxEvaluateStepHandler` builds a `CharterInvocationEnvelope` from open work items, runs evaluation in the sandbox, and persists evaluation records. No blockers found for Cloudflare Workers.
- **Live Reconciliation Adapter** (Task 354): `GraphLiveObservationAdapter` fetches observations from a mocked Graph client boundary. `createLiveReconcileStepHandler` confirms outbounds only against external observations. Adapter failure returns empty observations — no fabricated confirmation.
- **Operator Mutation Surface** (Task 355): `executeSiteOperatorAction` with audit-first pattern (`pending` → `executed`/`rejected`). Four actions: `approve`, `reject` (outbounds), `retry`, `cancel` (work items). Invalid transitions return 422 without hidden mutation. DO schema extended with `operator_action_requests`.
- **Live-Safe Spine Proof** (Task 356): End-to-end fixture through `runCycle()` using live adapters for sync, evaluate, and reconcile, plus operator mutation audit assertion. Proves IAS boundaries hold under live adapter execution.

Concrete outcomes:

- `packages/sites/cloudflare/src/source-adapter.ts` — `SourceAdapter` interface + `HttpSourceAdapter`.
- `packages/sites/cloudflare/src/sandbox/charter-runtime.ts` — sandbox payload builder + `runCharterInSandbox`.
- `packages/sites/cloudflare/src/reconciliation/live-observation-adapter.ts` — `LiveObservationAdapter` + `GraphLiveObservationAdapter`.
- `packages/sites/cloudflare/src/operator-actions.ts` — audited action executor.
- `packages/sites/cloudflare/src/cycle-step.ts` — `createLiveSyncStepHandler`, `createSandboxEvaluateStepHandler`, `createLiveReconcileStepHandler`.
- 197 tests pass across the Cloudflare package (23 test files).

Authority clarifications:

- Live adapters are mechanical seams, not authority sources.
- All four live adapters route through existing durable boundaries (facts, evaluations, decisions, outbounds, observations, audits).
- Effect execution remains blocked; no adapter may call a mutating external API.

Deferred:

- Real Microsoft Graph sync with delta pagination and token refresh.
- Real OpenAI/Kimi charter runtime with live API calls.
- Real effect execution (Graph draft creation, email send).
- Real Graph reconciliation polling against live API.
- Cron Trigger wiring for scheduled production cycles.
- DO RPC via `fetch()` for production Worker → DO boundary.

## Cloudflare Site v1 Productionization

Narada's Cloudflare Site moved from bounded mocked effect-execution proof to production-shaped mechanics: the effect worker participates in the Cycle as a first-class step, real Graph credential and client binding seams exist without requiring live credentials in tests, retry limits and backoff are enforced, and production substrate boundaries (Worker→DO RPC and Cron-triggered Cycle entry) are fixture-proven.

- **v1 Productionization Boundary Contract** (Task 365): `docs/deployment/cloudflare-v1-productionization-boundary-contract.md` defines production-shaped vs production-ready distinction, no-overclaim constraints, canonical 9-step cycle ordering, credential/client binding seam, retry limit semantics, and production substrate boundaries.
- **Effect Worker in Cycle** (Task 366): `createEffectExecuteStepHandler` is step 6 in the 9-step cycle. Effect execution happens after handoff and before reconciliation. Fixture reconcile is made submitted-only. Unapproved commands are skipped. Adapter failures do not abort unrelated cycle bookkeeping.
- **Real Graph Credential/Client Binding** (Task 367): `GraphTokenProvider` interface with `StaticBearerTokenProvider` and `ClientCredentialsTokenProvider`. `FetchGraphDraftClient` implements real Graph semantics with `fetch()`. `createGraphDraftClient(env)` factory resolves credentials from env bindings and fails closed before mutation. All tests mock `global.fetch`; no live email sent.
- **Retry Limit and Backoff** (Task 368): Per-command max 5 `failed_retryable` attempts before auto-promotion to `failed_terminal` with audited `RETRY_LIMIT_EXHAUSTED` record. Exponential backoff gate skips too-early retries. Retry-After header support is honestly residualized as not implemented.
- **Production RPC and Cron Wiring** (Task 369): DO `fetch()` HTTP routing for `/status`, `/control/actions`, and `/cycle`. Worker `scheduled` handler uses `env.SITE_ID` for site identity. Worker→DO stub `fetch()` and Cron entry are fixture-proven with real `Request` objects.

Concrete outcomes:

- `packages/sites/cloudflare/src/effect-worker.ts` — approved-only effect worker with retry/backoff gates.
- `packages/sites/cloudflare/src/cycle-step.ts` — 9-step cycle with `createEffectExecuteStepHandler` and submitted-only reconcile.
- `packages/sites/cloudflare/src/effects/graph-token-provider.ts` — token provider interface + implementations.
- `packages/sites/cloudflare/src/effects/fetch-graph-draft-client.ts` — real Graph semantics with `fetch()`.
- `packages/sites/cloudflare/src/effects/graph-client-factory.ts` — credential resolution factory with fail-closed validation.
- `packages/sites/cloudflare/src/runner.ts` — `runCycleOnCoordinator` extraction for DO/Cron reuse.
- `packages/sites/cloudflare/src/coordinator.ts` — DO `fetch()` routing, retry counting, execution attempt schema.
- `packages/sites/cloudflare/src/index.ts` — Worker `scheduled` handler.
- 297 tests pass across the Cloudflare package (33 test files).

Authority clarifications:

- `approved_for_send` is the only execution entry gate.
- Execution success (`submitted`) does not equal confirmation (`confirmed`).
- Reconciliation exclusively owns confirmation.
- Operator approval and execution attempts are both audited and inspectable.
- Credential seam fails closed: missing bindings throw `GraphCredentialError` before any mutation.
- Worker→DO RPC and Cron are mechanical substrate boundaries; they do not change authority boundaries.

Deferred:

- Live Microsoft Graph API calls with credential rotation and egress policy validation.
- Retry-After header support at the adapter boundary.
- Production deployment, operational monitoring, and rate-limit tuning.
- Multi-site scheduling (`site_id`/`scope_id` separation beyond `env.SITE_ID`).
- Real charter runtime with live OpenAI/Kimi API calls.
- Real Graph reconciliation polling against live API.
- Additional effect types: `move_message`, `mark_read`, `set_categories`.

## Post-Cloudflare Coherence

Narada's governed-control grammar was strengthened after the Cloudflare prototype: fixture discipline made the grammar substrate-testable, unattended operation semantics made it autonomous, and mailbox daily-use closure proved it in real supervised use.

- **Control Cycle Fixture Discipline** (Task 334): Fixture factories in `packages/sites/cloudflare/test/fixtures/` define canonical shapes for `Site`, `Cycle`, `Act`, and `Trace`. Integration boundary backfill tests exercise actual Worker handlers through real `Request` objects. 70 tests pass across 9 test files. Fixture discipline rule added to AGENTS.md Review Checklist.
- **Unattended Operation Layer** (Task 336): `docs/product/unattended-operation-layer.md` defines stuck-cycle recovery protocol, health status transitions (`healthy` → `degraded` → `critical` / `auth_failed`), pluggable rate-limited notification surface, and restart safety for both local and Cloudflare substrates.
- **Mailbox Daily-Use Closure** (Task 337): Four documents close the support mailbox as a supervised product:
  - `docs/concepts/mailbox-knowledge-model.md` — placement, lifecycle, durability, scoping, charter integration
  - `docs/product/mailbox-draft-send-posture.md` — draft-first principle, three posture levels, batch review rhythm, authority boundary enforcement
  - `docs/product/mailbox-terminal-failures.md` — terminal vs. retryable vs. advisory failure catalog, 7-step operator recovery procedure
  - `docs/product/day-2-mailbox-hardening.md` expanded — morning/midday/afternoon/weekly/monthly/emergency operational rhythm

Concrete outcomes:

- The grammar is now substrate-testable via fixture contracts.
- The grammar defines autonomous health decay, stuck-cycle recovery, and operator notification boundaries.
- The mailbox vertical has documented knowledge model, review queue UX, terminal failure catalog, and draft/send posture.

Deferred:

- **Canonical Vocabulary Hardening** (Task 333) — Task 330 already performed this function; vocabulary is coherent.
- **Runtime Locus Abstraction** (Task 335) — Deferred until a second substrate is proven.
- Fixture runner for local daemon (not just Cloudflare) — future chapter.
- Unattended operation implementation (health decay wiring, stuck-cycle recovery in scheduler, notification channel) — future implementation chapter.
- Mailbox knowledge directory population with live playbooks — operator task.
