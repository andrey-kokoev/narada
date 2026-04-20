# Operational Trust Chapter — Trust Gap Inventory

> Task 233 artifact. Classifies operational trust gaps for the first live mailbox support operation (`help@global-maxima.com`).
>
> **Scope**: What must be true for an operator to start Narada, leave it running, observe it, interrupt it, recover it, and understand what happened — without hidden state or guesswork.
>
> **Boundary**: This chapter covers ONE operation. Multi-operation scale, advisory routing beyond `continuation_affinity`, autonomous send, and production UI polish are all explicitly out of scope.

---

## Legend

| Classification | Meaning |
|----------------|---------|
| **sufficient** | Exists and meets the trust threshold for daily operation |
| **insufficient** | Exists but has a gap that degrades operator confidence or safety |
| **missing** | Not implemented; operator cannot perform this function |
| **deferred** | Intentionally postponed to a later chapter |

---

## 1. Start / Stop / Restart Behavior

| Item | Status | Notes |
|------|--------|-------|
| Daemon CLI entrypoint (`narada-daemon`) | sufficient | Parses args, loads config, starts service |
| SIGINT / SIGTERM handling | sufficient | Graceful shutdown path exists; calls `service.stop()` |
| PID file with stale detection | sufficient | `PidFile` checks for running process before writing |
| Single-instance enforcement | sufficient | Stale PID check prevents accidental duplicate daemons |
| **Graceful drain of in-flight work** | **insufficient** | `stop()` closes DBs but does not wait for active leases/executions to complete. A work item leased at shutdown may be abandoned and recovered later. |
| Systemd / process-manager integration | missing | No unit file, no restart-on-failure policy, no `Type=notify` |
| Restart-after-crash behavior | insufficient | No automatic restart. Operator must manually restart. |
| Configuration reload without restart | missing | Config is loaded once at startup. Changes require restart. |

---

## 2. Daemon Process Supervision and Safe Shutdown

| Item | Status | Notes |
|------|--------|-------|
| Health file (`.health.json`) | sufficient | Written after each sync cycle with status, metrics, errors |
| Observation API server | sufficient | Read-only GET routes on configurable port/host |
| Wake controller for out-of-band dispatch | sufficient | Priority-based wake replaces lower-priority sleeps |
| **Readiness probe** | **missing** | No endpoint or file indicates "ready to accept work". Health file only reports sync health, not dispatch readiness. |
| **Shutdown timeout / forced termination** | **missing** | No max-shutdown-duration. SIGTERM handler waits indefinitely for `service.stop()`. |
| Worker registry drain on shutdown | insufficient | `drainWorker()` is called during normal dispatch but not in `stop()`. Outbound workers may be mid-flight. |

---

## 3. Health / Readiness Status

| Item | Status | Notes |
|------|--------|-------|
| Sync health (`.health.json`) | sufficient | healthy/stale/error status, last sync timestamp, error rate |
| Control-plane snapshot (`narada status`) | sufficient | Work items, leases, outbound, quiescence, executions |
| Scope dispatch summary | sufficient | Per-scope counts for active/leased/executing/failed/outbound |
| **Dispatch health separate from sync health** | **insufficient** | `.health.json` only knows about sync. It does not report scheduler quiescence, stuck work, or outbound backlog. |
| **Structured health metrics export** | **insufficient** | Metrics are written to file but not in a standard format (Prometheus, OpenMetrics, etc.). |
| Alerting integration | missing | No webhooks, no email alerts, no PagerDuty integration. Operator must poll. |

---

## 4. Stuck Work Detection

| Item | Status | Notes |
|------|--------|-------|
| Stale lease recovery | sufficient | `recoverStaleLeases()` runs before each scan; abandoned leases are released |
| Work item retry with backoff | sufficient | `failed_retryable` → retry up to maxRetries with exponential backoff |
| Quiescence indicator | sufficient | `isQuiescent()` reports if any runnable work remains |
| **Work item stuck in `opened` too long** | **missing** | No detection for work items that have been `opened` for hours/days without being leased. |
| **Work item stuck in `leased` too long** | **insufficient** | Lease expiry catches truly stale leases, but there is no alert for a lease that keeps getting renewed yet the execution never completes (infinite renewal bug). |
| **Work item stuck in `executing` too long** | **missing** | No detection for executions that run for hours. Charter timeout exists but execution may hang. |
| **Outbound command stuck in `pending` too long** | **missing** | No detection for outbound commands that never leave `pending`. |
| **Outbound command stuck in `draft_creating` too long** | **missing** | No detection for draft creation failures that don't transition to `failed_terminal`. |

---

## 5. Stuck Draft / Outbound Command Detection

| Item | Status | Notes |
|------|--------|-------|
| Outbound handoff status tracking | sufficient | Full state machine: pending → draft_creating → draft_ready → sending → submitted → confirmed |
| Draft verification | sufficient | Re-fetches remote draft, verifies hash and header |
| **Alert when draft sits in `draft_ready`** | **missing** | No detection for drafts waiting for operator approval/rejection. |
| **Outbound command age tracking** | **missing** | No `created_at` age thresholds or alerts. Operator must manually inspect. |
| **Failed outbound terminal detection** | **insufficient** | `failed_terminal` is visible in status, but there is no proactive alert or summary. |

---

## 6. Operator Action Audit Visibility

| Item | Status | Notes |
|------|--------|-------|
| Operator actions are recorded | sufficient | 9 audited actions: retry, acknowledge, rebuild projections, trigger sync, derive work, preview work, request redispatch, cancel work, force resolve |
| Action audit table exists | sufficient | `operator_actions` table with `action_type`, `actor`, `scope_id`, `context_id`, `payload_json`, `created_at` |
| **Audit log queryable via API** | **missing** | No API route exposes `operator_actions`. |
| **Audit log queryable via CLI** | **missing** | No `narada audit` or `narada log` command. |
| **Audit log visible in UI** | **missing** | No audit log page. |
| **Audit log export** | **missing** | No way to dump or archive audit records. |

---

## 7. Draft Disposition Surface

| Item | Status | Notes |
|------|--------|-------|
| Draft creation (Graph API) | sufficient | `SendReplyWorker` creates draft, verifies it, stops at `draft_ready` |
| Governance blocks auto-send | sufficient | `require_human_approval: true` prevents `send_reply` from auto-executing |
| **Operator action: reject/cancel draft** | **missing** | No way to transition `draft_ready` → `cancelled` with rationale. |
| **Operator action: mark draft reviewed** | **missing** | No way to record "I saw this draft" without changing status. |
| **Operator action: record handled externally** | **missing** | No way to disposition a draft when the operator resolves the issue outside Narada. |
| **Disposition state in observation queries** | **missing** | `reviewed_at`, `reviewer_notes`, `external_reference` not exposed. |
| Operator action: approve draft (→ `sending`) | deferred | Full approval workflow deferred until autonomous send chapter. |
| Operator action: edit draft | deferred | Draft editing deferred to a later chapter. |
| Approval policy configuration | deferred | Multi-step review workflows deferred. |

> **Note**: A *full* approval workflow (approve → send, edit, multi-step review) is deferred. But a *minimal* disposition surface (reject, mark reviewed, record external handling) is required for trust because drafts are the core output of Live Operation. Without disposition, unresolved `draft_ready` commands accumulate and mislead future evaluations. Addressed by Task 238.

---

## 8. Credential / Secret Handling

| Item | Status | Notes |
|------|--------|-------|
| Secure storage implementations | sufficient | `KeychainStorage` (OS keychain) and `FileSecureStorage` (AES-256-GCM) both exist |
| Secure storage factory | sufficient | `createSecureStorage()` auto-selects best available |
| **CLI does not use secure storage** | **insufficient** | `loadConfig()` never receives a `SecureStorage` instance. Credentials must be in config or env vars. |
| **ops-kit does not scaffold secure storage** | **insufficient** | `init-repo` and `wantMailbox` do not prompt for or store credentials in secure storage. |
| Config supports `{ "$secure": "..." }` references | insufficient | Schema allows secure references but resolution is not wired in the CLI path. |
| Graph token provider (env vars) | sufficient | `buildGraphTokenProvider` resolves `GRAPH_*` env vars |
| `.gitignore` for secrets | insufficient | ops-kit generates `.gitignore` but does not enforce that `config.json` with inline credentials is excluded. |

---

## 9. Recovery Runbooks

| Item | Status | Notes |
|------|--------|-------|
| Recovery CLI command | sufficient | `narada recover` rebuilds control-plane state from stored facts |
| Confirm-replay CLI command | sufficient | `narada confirm-replay` replays confirmations without re-performing effects |
| Rebuild projections CLI command | sufficient | `narada rebuild-projections` rebuilds all derived views |
| **Documented recovery runbook** | **missing** | No `.md` file describing step-by-step recovery for common failures. |
| **Rehearsed failure scenarios** | **missing** | No automated or manual rehearsal of crash → recovery → verify. |
| **Coordinator DB corruption handling** | **missing** | No documented path for `coordinator.db` corruption (delete + recover from facts). |
| **Cursor stale/delta token expiry runbook** | **insufficient** | Mentioned in Task 228 notes but not in a canonical runbook location. |

---

## 10. Inspection of "What Happened and Why"

| Item | Status | Notes |
|------|--------|-------|
| Work item timeline | sufficient | `getWorkItemTimeline()` shows executions, decisions, facts, transitions |
| Execution attempt summary | sufficient | Status, started/completed timestamps, error messages |
| Outbound transition history | sufficient | `outbound_transitions` table tracks every status change |
| **Evaluation proposed actions visible** | **missing** | `proposed_actions_json` not exposed in any observation type or API. (Task 231 covers this.) |
| **Decision rationale visible** | **missing** | `ForemanDecisionRow.payload_json` and `rationale` not exposed. (Task 231 covers this.) |
| **Execution envelope visible** | **missing** | `runtime_envelope_json` and `outcome_json` not exposed. (Task 231 covers this.) |
| Agent trace persistence | insufficient | Traces are stored but only via raw SQLite query; no observation query or UI. |

---

## 11. Backup / Restore Posture

| Item | Status | Notes |
|------|--------|-------|
| Backup CLI command | sufficient | `narada backup` creates tar.gz with selectable components |
| Restore CLI command | sufficient | `narada restore` restores from backup with verification |
| Backup verify CLI command | sufficient | `narada backup-verify` checks integrity without extracting |
| Backup list CLI command | sufficient | `narada backup-ls` shows backup contents |
| **Scheduled / automated backup** | **missing** | No cron integration, no daemon-scheduled backups. |
| **Backup retention policy** | **missing** | No automatic pruning of old backups. |
| **Off-site backup** | **deferred** | Operator responsible for copying backup files. |

---

## 12. Local Telemetry / Test-Runtime Hygiene

| Item | Status | Notes |
|------|--------|-------|
| Test telemetry collection | sufficient | `.ai/metrics/test-runtimes.json` records per-step timing and classification |
| Evidence-based classification | sufficient | `classifyStep()` requires proof of test success before labeling teardown noise |
| Bounded artifact growth | sufficient | Telemetry bounded to last 200 entries |
| **Production runtime telemetry** | **missing** | No structured runtime metrics beyond `.health.json`. No per-operation latency histograms, no charter execution duration tracking in metrics. |
| **Telemetry export** | **missing** | No way to ship metrics to an external system. |

---

## Summary: Critical Path Gaps

The following gaps must be closed for the operator to trust one live mailbox operation enough to leave it running daily.

| # | Gap | Status | Mitigation / Task |
|---|-----|--------|-------------------|
| 1 | **No readiness probe** — cannot distinguish "syncing" from "ready to work" | missing | Task 234: define health/readiness contract |
| 2 | **No stuck work alerts** — work can pile up silently | missing | Task 235: stuck-work and stuck-outbound detection |
| 3 | **Audit log is invisible** — operator cannot see what actions were taken | missing | Task 236: operator audit inspection surface |
| 4 | **No recovery runbook** — operator must guess during incidents | missing | Task 237: daemon lifecycle + runbook hardening |
| 5 | **No draft disposition surface** — drafts accumulate in `draft_ready` with no operator cleanup path | missing | Task 238: minimal draft disposition surface |
| 6 | **Graceful drain missing** — in-flight work may be abandoned on shutdown | insufficient | Task 237: daemon lifecycle hardening |
| 7 | **No systemd integration** — no auto-restart, no standard supervision | missing | Task 237: daemon lifecycle hardening |
| 8 | **Evaluation/decision content opaque** — operator cannot see charter reasoning | missing | Task 231 (Live Operation) covers this; not duplicated here |

**Deferred (not required for first live operation):**

| Capability | Why Deferred |
|------------|--------------|
| Full draft approval workflow (approve → send, edit, multi-step review) | Minimal disposition (reject, mark reviewed, handled externally) is in Task 238. Full workflow deferred until autonomous send chapter. |
| Autonomous send (`require_human_approval: false`) | Safety boundary; deferred until Operational Trust is proven. |
| Scheduled/automated backup | Operator can run `narada backup` manually. Automation is convenience, not trust. |
| Production runtime telemetry export | `.health.json` is sufficient for local observation. |
| Credential hardening (secure storage wiring) | Env vars are acceptable for first operation; hardening is a follow-up. |
| Multi-operation supervision | One operation only for this chapter. |
| Real-time alerting (webhooks, PagerDuty) | Polling-based health checks are sufficient for first operation. |
