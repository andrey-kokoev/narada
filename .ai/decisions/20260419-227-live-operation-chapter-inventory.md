# Live Operation Chapter — Runtime Inventory

> Task 227 artifact. Distinguishes existing runtime pieces from gaps for the first live mailbox support operation (`help@global-maxima.com`).

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Exists and works for the target scenario |
| ⚠️ | Exists but has a gap that blocks or degrades the target scenario |
| ❌ | Missing for the target scenario |
| ⏸️ | Exists but intentionally deferred for this chapter |

---

## 1. Mailbox Sync / Config Readiness

| Piece | Status | Notes |
|-------|--------|-------|
| Delta sync against Graph API | ✅ | `DefaultSyncRunner` + `GraphDeltaWalker` pull and materialize messages |
| Multi-mailbox config | ✅ | `loadMultiMailboxConfig` validates and loads legacy `mailboxes[]`; `loadConfig` handles modern `scopes[]` |
| Auth resolution (env vars → config) | ✅ | `buildGraphTokenProvider` resolves `GRAPH_*` env vars with config fallback |
| ops-kit `wantMailbox` scaffolding | ✅ | Scaffolds ops-repo structure and upserts scope into config |
| **Fact store in modern CLI sync** | ⚠️ | `syncCommand` (single-scope path) does **not** pass a `factStore` to `DefaultSyncRunner`. Facts are only persisted in the `syncMultiple()` (legacy multi-mailbox) path. The daemon path does wire `SqliteFactStore`. |
| Secure storage in CLI | ❌ | CLI never passes `SecureStorage` to `loadConfig()` |
| Auth scaffolding in ops-kit | ⚠️ | `buildMailboxScope` only writes `user_id`; `tenant_id`/`client_id`/`client_secret` must be added manually or via env vars |
| Single-scope CLI limitation | ⚠️ | `syncCommand` hardcodes `scopes[0]`; additional scopes are ignored |

**Gap for live operation:** The fact store gap in the modern CLI path means `narada sync` alone does not create the durable fact boundary required for work derivation. The daemon path does not have this gap.

---

## 2. Fact / Context Derivation Readiness

| Piece | Status | Notes |
|-------|--------|-------|
| Fact types and mapping | ✅ | `mail.*` fact family defined; `record-to-fact` conversion exists |
| Fact store (SQLite) | ✅ | `SqliteFactStore` persists facts with admission tracking |
| Context formation (mail strategy) | ✅ | `MailboxContextStrategy` groups by `conversation_id`, derives `change_kinds`, assigns revision ordinals |
| Context records / revisions | ✅ | Neutral `context_records` / `context_revisions` tables; mailbox compatibility views exist |
| **Fact store wired in CLI sync** | ⚠️ | See §1 gap. Daemon path is wired. |
| Priority / urgency derivation | ⏸️ | `priority` field exists but is always `0`; no content-based urgency lift. Deferred — not required for first thread. |
| Cross-context grouping | ⏸️ | No "same customer, multiple threads" grouping. Deferred. |

---

## 3. Work Item Opening / Readiness

| Piece | Status | Notes |
|-------|--------|-------|
| Work item lifecycle | ✅ | Full state machine: `opened` → `leased` → `executing` → `resolved` / `failed_*` / `superseded` |
| Scheduler (lease, crash recovery) | ✅ | `SqliteScheduler` enforces at-most-one non-terminal work item per context |
| Foreman work opening | ✅ | `DefaultForemanFacade.onFactsAdmitted()` / `onSyncCompleted()` → `onContextsAdmitted()` creates/supersedes work items |
| Continuation affinity | ✅ | 30-min session sticky default; `affinity_strength` field exists |
| **Work derivation from synced facts in CLI path** | ⚠️ | Blocked by fact-store gap in `syncCommand`. Daemon path works. |
| Cancel / force-resolve operator actions | ⏸️ | Not required for first live operation (will use default `require_human_approval: true`). |

---

## 4. Charter Runtime and Runner Readiness

| Piece | Status | Notes |
|-------|--------|-------|
| Charter invocation envelope | ✅ | v2.0 envelope with execution context, allowed actions, tools, prior evaluations |
| Charter output envelope | ✅ | v2.0 output with outcome, confidence, summary, proposed_actions, tool_requests, escalations |
| CodexCharterRunner | ✅ | OpenAI-compatible chat completions API adapter; parses JSON output; validates |
| MockCharterRunner | ✅ | Deterministic test runner |
| Envelope builder | ✅ | `buildInvocationEnvelope()` materializes context, loads prior evals, binds policy |
| Mailbox context materializer | ✅ | Reads thread messages from filesystem views |
| **Support-specific charter behavior** | ❌ | `support_steward` is a string ID only. The generic system prompt does not include support-specific instructions, tone, or playbook references. This is the single largest semantic gap. |
| Knowledge source injection | ⚠️ | `KnowledgeCatalogEntry` is passed in envelope but `CodexCharterRunner.buildUserPrompt()` does **not** fetch or include knowledge content. |
| Secondary charter arbitration | ⏸️ | Only primary charter is invoked live. Preview-only concept. Deferred. |
| RAG / retrieval step | ⏸️ | No retrieval before charter invocation. Deferred for first operation. |

---

## 5. Support-Oriented Charter / Profile Readiness

| Piece | Status | Notes |
|-------|--------|-------|
| `support_steward` charter ID | ✅ | Exists as a `CharterId` string and default policy value |
| `require_human_approval: true` default | ✅ | `ops-kit init-repo` generates this; appropriate for first live operation |
| `allowed_actions` for support | ✅ | Default includes `draft_reply`, `send_reply`, `mark_read`, `no_action` |
| **Actual support charter prompt/template** | ❌ | No support-specific system prompt exists. The generic prompt only says "Your charter_id is 'support_steward'...". |
| Support-specific tools | ❌ | No helpdesk tools defined (e.g., ticket lookup, CRM query, knowledge search). |
| Playbook / runbook injection | ❌ | Knowledge sources are declared but not injected into prompts. |
| Posture presets | ✅ | `draft-only`, `observe-only`, etc. correctly restrict actions |

---

## 6. Draft-First Outbound Readiness

| Piece | Status | Notes |
|-------|--------|-------|
| Intent handoff | ✅ | `IntentHandoff.admitIntentFromDecision()` creates `intent` row atomically |
| Outbound handoff | ✅ | `OutboundHandoff.createCommandFromDecision()` creates command + version inside SQLite tx |
| Send-reply worker | ✅ | Full state machine: `pending` → `draft_creating` → `draft_ready` → `sending` → `submitted` → `confirmed` |
| Draft creation (Graph API) | ✅ | `GraphDraftClient` creates draft; `ManagedDraft` persisted with hash tracking |
| Draft verification | ✅ | Re-fetches remote draft, verifies `X-Outbound-Id` header and content hashes |
| Participant gating | ✅ | `ParticipantResolver` ensures all recipients are existing thread participants |
| Crash recovery | ✅ | Missing managed drafts recreated; retryable errors go to `retry_wait`; auth errors go to `failed_terminal` |
| **Non-mail outbound actions** | ⏸️ | Only mail vertical is supported. Creating Zendesk tickets etc. is deferred. |
| Attachment handling in drafts | ⏸️ | Not supported. Deferred. |

---

## 7. Operator Inspection / Status Readiness

| Piece | Status | Notes |
|-------|--------|-------|
| Observation queries (30+ types) | ✅ | `WorkItemLifecycleSummary`, `ExecutionAttemptSummary`, `OutboundHandoffSummary`, `TimelineEvent`, etc. |
| Observation server (20+ GET routes) | ✅ | `/scopes/:id/snapshot`, `/work-items`, `/intents`, `/executions`, `/timeline`, `/mailbox`, etc. |
| Operator console UI (12 pages) | ✅ | Vanilla-JS SPA with overview, timeline, work, intents, executions, failures, mailbox views |
| Operator actions (9 audited actions) | ✅ | Retry, acknowledge, rebuild projections, trigger sync, derive work, preview work, etc. |
| Status CLI command | ✅ | Combines filesystem health + control-plane snapshot |
| `select` CLI command | ✅ | Queries fact store offline with filters |
| **Evaluation content inspection** | ❌ | `confidence_json`, `classifications_json`, `proposed_actions_json`, `tool_requests_json`, `escalations_json` are **not exposed** in any observation type, query, API route, or UI. Operators cannot see what the charter proposed. |
| **Decision rationale inspection** | ❌ | `ForemanDecisionRow.payload_json` and `rationale` are invisible. |
| **Execution envelope/outcome inspection** | ❌ | `ExecutionAttempt.runtime_envelope_json` and `outcome_json` are completely hidden. |
| Agent session visibility | ❌ | `AgentSession` table exists but has zero observability queries or UI routes. |
| Real-time updates | ⏸️ | UI is polling-only. Deferred. |
| Operator action audit log page | ⏸️ | Actions are recorded but not reviewable in UI. Deferred. |

---

## 8. Ops-Repo / Private-Data Boundary Readiness

| Piece | Status | Notes |
|-------|--------|-------|
| ops-kit `init-repo` | ✅ | Scaffolds private repo with `config.json`, `mailboxes/`, `knowledge/`, `notes/`, `README.md` |
| `wantMailbox` | ✅ | Upserts mailbox scope into config; scaffolds per-mailbox directory |
| Config I/O (atomic rename) | ✅ | `config-io.ts` reads/writes JSON safely |
| `.gitignore` for secrets | ⚠️ | ops-kit generates `.gitignore` but operator must ensure `config.json` with inline credentials is not committed |
| Secure storage integration | ❌ | No automatic secure-storage wiring in ops-kit or CLI |
| **Per-operation private data isolation** | ✅ | Each operation has its own `root_dir`; messages, cursor, apply-log, coordinator DB are scope-local |

---

## Summary: Critical Path Gaps

The following gaps must be closed for the first live operation. Everything else is either ready or deferred.

| # | Gap | Blocking? | Mitigation / Task |
|---|-----|-----------|-------------------|
| 1 | **Support charter is a string ID, not a behavior** | Yes | Task 229: implement actual `support_steward` charter profile |
| 2 | **Evaluation/decision content is opaque to operators** | Yes | Task 231: expose evaluation payload, decision rationale, execution envelope in observation |
| 3 | **Fact store not wired in CLI sync** | Partial | Task 228: ensure daemon path is used for live operation; optionally wire fact store in CLI |
| 4 | **Knowledge sources declared but not injected** | Partial | Task 229: wire knowledge source retrieval into envelope builder |

**Deferred (not required for first live operation):**
- Autonomous send (`require_human_approval: true` is the correct first posture)
- Multi-vertical demos
- Production UI polish (real-time updates, graphs, audit log page)
- Generalized knowledge-base ingestion beyond per-scope README/playbook
- Broad advisory routing runtime
- Cross-context customer grouping
- Non-mail outbound actions (Zendesk, etc.)
- Attachment handling in drafts
- RAG / retrieval pipeline
- Secondary charter arbitration
