# Decision: Session Attachment Semantics for Sites and Agents

**Date:** 2026-04-22  
**Task:** 397  
**Depends on:** 384 (Operator Console closure), 385 (Mechanical Agent Roster)  
**Verdict:** **Design accepted — implementation deferred to follow-up tasks.**

---

## Summary

Narada now has canonical session attachment semantics that govern how operators and agents interact with Sites. The design learns from `shpool` (persistent named sessions, detach without death, reattach without losing context) but preserves Narada's authority boundaries: **attachment is not authority, session logs are not truth, and detaching a session does not abort a Cycle.**

The core insight is a **three-layer separation**:

1. **`AgentSession` (kernel)** — a durable trace record bound to a `work_item`. It tracks what happened during one evaluation/execution attempt. It is authority-agnostic and lives in the Site's coordinator store.
2. **`SiteAttachment` (operator/agent-facing)** — the transient relationship between an operator or agent process and a Site. It controls who is *currently observing* or *interacting with* a Site, not who is *authorized to mutate* it.
3. **`ContinuationAffinity` (scheduler advisory)** — the soft routing hint stored on `WorkItem` that tells the scheduler "this work is probably better handled by the same recent session/agent." It is advisory, not binding.

These three layers must never collapse into one another.

---

## 1. Vocabulary

### 1.1 `AgentSession` (kernel layer)

Already implemented in `packages/layers/control-plane/src/coordinator/types.ts`.

| Field | Meaning |
|-------|---------|
| `session_id` | Unique identifier for this session trace |
| `context_id` | The context this session was opened for |
| `work_item_id` | The work item this session is bound to (1:1 in v1) |
| `status` | `opened` → `active` → (`idle` \| `completed` \| `abandoned` \| `superseded`) |
| `resume_hint` | Human-readable trace of why the session stopped or what would resume it |
| `started_at` / `ended_at` / `updated_at` | Temporal bounds |

**Authority:** `AgentSession` is a **Trace** (per SEMANTICS.md §2.14). It records what happened. It does not grant permission to act. It does not determine whether a work item is leased, executing, or resolved. Those are owned by the scheduler and foreman.

### 1.2 `SiteAttachment` (operator/agent layer)

A new concept for this decision. A `SiteAttachment` represents the live relationship between an **operator or agent process** and a **Site**.

| Field | Meaning |
|-------|---------|
| `attachment_id` | Unique identifier (e.g., `attach_{uuid}`) |
| `site_id` | The Site being attached to |
| `scope_id` | Optional — if attaching to a specific scope within a multi-scope Site |
| `principal_type` | `"operator"` or `"agent"` |
| `principal_id` | Operator name or agent ID from the roster |
| `mode` | `"observe"` (read-only) or `"interact"` (can issue control requests) |
| `status` | `attached`, `detached`, `stale`, `transferred`, `closed` |
| `attached_at` | When this attachment began |
| `detached_at` | When this attachment ended (null while active) |
| `detach_reason` | Why the attachment ended (see §3) |
| `resume_context_json` | Projected context derived from durable state at detach time |
| `transferred_to_attachment_id` | If `status === "transferred"`, the successor attachment |

**Storage:** `SiteAttachment` is **not stored in the Site's coordinator SQLite**. It belongs to the operator console / agent runtime layer. For local Sites, it may live in the console registry or agent runtime state. For Cloudflare Sites, it may live in the operator's local CLI state or a lightweight DO.

**This is intentional.** Attachment state is ephemeral. If all attachment records are lost, the Site continues running correctly. The operator or agent simply loses their "seat" and must reattach.

### 1.3 `ContinuationAffinity` (scheduler advisory layer)

Already implemented in `packages/layers/control-plane/src/coordinator/types.ts` as fields on `WorkItem`.

| Field | Meaning |
|-------|---------|
| `preferred_session_id` | Session ID preferred for continuity |
| `preferred_agent_id` | Agent ID preferred for continuity (future) |
| `affinity_group_id` | Links related work across contexts |
| `affinity_strength` | 0 = no preference; higher = stronger |
| `affinity_expires_at` | ISO timestamp after which affinity is ignored |
| `affinity_reason` | Human-readable rationale (e.g., `"same_context"`) |

**Behavior (v1 implemented):** The scheduler uses active (non-expired) affinity as a **reordering hint** in `scanForRunnableWork()`. It does not enforce session-targeted lease acquisition. If the preferred session is detached or stale, the scheduler falls back to normal FIFO ordering.

### 1.4 Relationship Diagram

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  SiteAttachment │      │   AgentSession   │      │ContinuationAffinity
│  (ephemeral)    │◄────►│  (durable trace) │◄────►│  (advisory hint)│
│  operator/agent │      │  work_item-bound │      │  work_item field│
└─────────────────┘      └──────────────────┘      └─────────────────┘
         │                        │                         │
         │         references     │         derives from    │
         └────────────────────────┘─────────────────────────┘
                                    │
                              ┌─────▼─────┐
                              │   Site    │
                              │ coordinator│
                              └───────────┘
```

---

## 2. Lifecycle States

### 2.1 `AgentSession` States (kernel — already implemented)

```
opened ──► active ──► idle ──► completed
              │         │
              ▼         ▼
         abandoned   superseded
```

- **`opened`**: Session record created by foreman when work item is opened.
- **`active`**: Execution attempt has started (scheduler leased the work item).
- **`idle`**: Execution paused waiting for operator, policy, or external condition.
- **`completed`**: Work item resolved successfully; session ended.
- **`abandoned`**: Work item failed terminal; session ended with error.
- **`superseded`**: A newer work item superseded this one; session is archival.

### 2.2 `SiteAttachment` States (operator/agent — new)

```
attached ──► detached  ──► closed
      │           │
      ▼           ▼
   stale      transferred ──► attached (new)
```

- **`attached`**: The operator or agent process is currently connected to the Site. It may be observing or interacting. There is a live bidirectional communication channel (HTTP/WebSocket/stdio).
- **`detached`**: The operator or agent voluntarily disconnected. The attachment record persists so the principal can reattach later. The Site is unaffected.
- **`stale`**: The attachment was implicitly broken (network failure, process crash, client timeout). The record remains but is marked stale. Reattaching requires validation that the Site state has not diverged too far.
- **`transferred`**: The attachment was explicitly handed off to another principal (e.g., operator → agent, or agent A → agent B). The old attachment becomes `transferred`; a new one is created. This is **not** a session migration — it is a handoff of *attention*.
- **`closed`**: The attachment is permanently ended. The record may be archived or deleted. No reattachment is possible from this record; a new attachment must be created.

### 2.3 State Invariants

1. **Attachment does not imply lease.** A principal may be `attached` to a Site while no work item is leased to them. The scheduler owns leasing; the attachment layer owns connection state.
2. **Detach does not abort Cycle.** Closing an attachment must never cancel in-flight work, release scheduler leases, or mutate work item status. The Cycle continues independently.
3. **Single active controller default.** At most one `SiteAttachment` with `mode: "interact"` may be `attached` to a given Site at a time. Additional attach requests may be rejected, queued, or downgraded to `mode: "observe"`.
4. **Observer attachments are unlimited.** Any number of `mode: "observe"` attachments may coexist. Observation is read-only and does not affect Site state.

---

## 3. Detach / Transfer Semantics

### 3.1 Voluntary Detach

**Trigger:** Operator or agent explicitly disconnects (closes terminal, exits CLI, sends detach signal).

**Behavior:**
- Attachment status becomes `detached`.
- `resume_context_json` is populated by **projecting** from durable Site state (see §4).
- All active observation streams are closed.
- **No Site state is mutated.** Leases are not released. Work items are not cancelled.

**Reattach:** The principal reconnects, provides `attachment_id` or `(site_id, principal_id)`, and receives the projected resume context. If the Site state has changed, the projection reflects current reality — not a snapshot from detach time.

### 3.2 Forced Stale (Implicit Break)

**Trigger:** Network partition, client crash, heartbeat timeout, or Site lock acquisition by a new Cycle.

**Behavior:**
- Existing `attached` attachment is marked `stale` by the Site or console heartbeat checker.
- The Site continues running. If the detached principal held a scheduler lease, the lease becomes stale independently and is recovered by `recoverStaleLeases()`.
- The principal may later discover their attachment is stale and must reattach.

**Rationale:** This mirrors `shpool`'s behavior where a detached session survives SSH disconnects. The difference is that Narada's "session" is the Site itself, not a terminal process. The Site lives on; the attachment is what broke.

### 3.3 Transfer

**Trigger:** Operator hands off to agent, or agent A hands off to agent B.

**Behavior:**
- Old attachment status becomes `transferred` with `transferred_to_attachment_id` set.
- New attachment is created with `mode: "interact"` for the recipient.
- `resume_context_json` is projected for the new attachment from current durable state.
- **No work item, lease, or decision is migrated.** The new principal simply begins observing and interacting with the same Site.

**Authority rule:** Transfer requires `admin` authority at the console/registry layer. The recipient must already be authorized for the Site's scope.

### 3.4 Budget-Exhausted Detach

**Trigger:** Agent reaches token/time/budget ceiling for this interaction.

**Behavior:**
- Agent voluntarily detaches, marking attachment `detached` with `detach_reason: "budget_exhausted"`.
- `resume_context_json` includes a hint like `"Budget exhausted after 3 evaluation rounds; context conv-123 has unresolved work item wi-456"`.
- The scheduler continues to route work normally. The next agent (or the same agent after budget reset) can reattach and resume.

### 3.5 Crash Recovery

**Trigger:** Site process crashes mid-Cycle and restarts.

**Behavior:**
- All `attached` attachments become `stale` (the process that held them died).
- The new Site process acquires the lock and resumes the Cycle from durable state (cursor, apply-log, work items).
- Operators/agents must reattach. They receive a fresh projection of current state.
- **No session state is restored from attachment records.** The Site's durable state (facts, work items, decisions) is the sole source of truth.

---

## 4. Resume Context as Projection from Durable State

The `resume_context_json` field on `SiteAttachment` is **not** a snapshot. It is a **projection** computed on demand from the Site's durable state at the time of reattach.

### 4.1 What Gets Projected

| Projection Element | Source in Durable State |
|--------------------|------------------------|
| Active work items for scope | `work_items` table (status `opened`, `leased`, `executing`, `failed_retryable`) |
| Recent decisions | `foreman_decisions` ordered by `decided_at` desc |
| Pending outbound commands | `outbound_handoffs` with status `pending`, `draft_ready`, `draft_creating` |
| Resumable sessions | `agent_sessions` with status in (`opened`, `active`, `idle`) |
| Health summary | `site_health` (or `health` record in DO SQLite) |
| Last Cycle trace | `cycle_traces` ordered by `started_at` desc |
| Attention queue | Derived from cross-table query (stuck work, pending drafts, auth failures) |

### 4.2 What Does NOT Get Projected

- **Ephemeral chat history** — not durable; not projected.
- **Attachment state from other principals** — an attachment only sees its own resume context, not a global "all sessions" view (though the operator console may aggregate).
- **Uncommitted evaluation output** — if an evaluation was produced but the foreman had not yet resolved it when the agent detached, it is NOT part of resume context. It will appear after the foreman resolves it and writes the decision.

### 4.3 Projection Invariant

> **Resume context must be re-computable at any time from durable state alone.** If an attachment record is lost, a principal reattaching with only their `principal_id` and `site_id` must receive an equivalent projection.

This is the `shpool` lesson applied without the multiplexer baggage: `shpool` sessions persist because the shell process keeps running. Narada Sites persist because the durable state is the truth. The attachment layer is just a bookmark.

---

## 5. Authority Rules

### 5.1 Attachment ≠ Authority

Being `attached` to a Site does not grant any authority. Authority is determined by:
- The Site's `RuntimePolicy` (charter bindings, allowed actions)
- The operator action request path (`executeOperatorAction` with authority class checks)
- The scheduler lease (only the lease holder may execute a work item)

An `attached` operator who tries to approve a draft without `execute` authority is rejected by the Site's control API, regardless of attachment status.

### 5.2 Single Active Controller Default

By default, only one `mode: "interact"` attachment is allowed per Site. This prevents conflicting control requests from multiple operators or agents.

Exceptions:
- **Multi-operator mode** (future): May allow multiple interact attachments with a conflict-resolution protocol (e.g., last-write-wins or consensus).
- **Observer override**: An interact attachment may be forcibly downgraded to observe if a higher-priority principal needs control.

### 5.3 Detach Does Not Fail Cycle

This is a hard invariant. Closing or losing an attachment must never:
- Release a scheduler lease
- Cancel an in-flight execution attempt
- Roll back a foreman decision
- Mutate a work item status
- Abort a running Cycle

The Cycle is Site-owned. The attachment is client-owned. They are independent lifecycles.

---

## 6. Mapping to Existing Surfaces

### 6.1 Mechanical Agent Roster (Task 385)

The roster at `.ai/agents/roster.json` tracks which agent is working which task. Session attachment extends this:

- `status: "working"` in the roster means the agent has an `attached` or `detached` `SiteAttachment` to a Site relevant to that task.
- When an agent detaches, its roster status may become `idle` or `reviewing` — but the Site attachment becomes `detached`, preserving the context.
- Roster updates are **operator tracking** (advisory). Attachment state is **runtime connection state** (mechanical).

### 6.2 Task Assignments

Task assignment (from `.ai/do-not-open/tasks/`) is a governance concept. Session attachment is a runtime concept.

- A task may be assigned to agent `a2` without `a2` being attached to any Site.
- Agent `a2` may be attached to a Site without having any assigned tasks (e.g., monitoring).
- When `a2` picks up a task, it attaches to the relevant Site(s). When done, it detaches.

### 6.3 `continuation_affinity` (Task 212)

`continuation_affinity` on `WorkItem` tells the scheduler "prefer the same session/agent for this work." It is an advisory signal (SEMANTICS.md §2.12).

- If the preferred session's `SiteAttachment` is `detached` or `stale`, the scheduler still honors affinity if the work item is runnable. The next agent that picks up the work may be different — affinity just reorders, it does not bind.
- If a work item is leased and executed, the `AgentSession` created for it may become the new `preferred_session_id` for superseded work.

### 6.4 Site Health / Trace

Site health is derived from durable state, not attachment state.

- A Site may be `healthy` with zero attachments.
- A Site may be `critical` with multiple observer attachments.
- Attachment status does not appear in health calculations.

Trace records (`cycle_traces`, `agent_sessions`, `execution_attempts`) are written by the Site during Cycles. They are independent of whether anyone is attached.

---

## 7. `shpool` Inspiration and Deliberate Divergence

### 7.1 What Narada Learns From `shpool`

| `shpool` Feature | Narada Adaptation |
|------------------|-------------------|
| Persistent named sessions | `SiteAttachment` with `attachment_id` survives detach/reattach |
| Detach without death | Closing attachment does not kill Site or abort work |
| Reattach without losing context | `resume_context_json` projected from durable state |
| Multiple clients can observe | Unlimited `mode: "observe"` attachments |

### 7.2 What Narada Deliberately Does NOT Do

| `shpool` Feature | Why Narada Avoids It |
|------------------|----------------------|
| Terminal session as the unit of persistence | Narada's unit of persistence is the **Site's durable state**, not a process. There is no "session daemon" keeping a shell alive. |
| Session logs as the primary record | Narada's primary record is the **coordinator SQLite + fact store**. Session/attachment logs are decorative trace, not authority. |
| Attach directly to a running process | Narada attaches to a **Site**, which may have zero or many running Cycles. There is no single process to attach to. |
| Multiplexer features (split panes, scrollback) | Out of scope. The console may provide these as UI sugar, but they are not part of attachment semantics. |

---

## 8. Implementation Sketch

### 8.1 No Schema Changes Required (v0)

This decision does not require changes to `packages/layers/control-plane/src/coordinator/store.ts` or the SQLite schema. The existing `AgentSession` table is sufficient for the kernel layer.

`SiteAttachment` state should live in:
- **Local Sites:** The operator console registry (`operator-console-site-registry.md` §2) or a lightweight JSON file in the console's own state directory.
- **Cloudflare Sites:** A lightweight Durable Object or the operator's local CLI state.

### 8.2 Console / CLI Additions (deferred)

| Surface | Command | Behavior |
|---------|---------|----------|
| Attach | `narada site attach <site-id> [--scope <scope-id>] [--mode interact]` | Create `SiteAttachment`, begin heartbeat, return projected resume context |
| Detach | `narada site detach [<attachment-id>]` | Mark attachment `detached`, populate `resume_context_json` |
| Reattach | `narada site reattach <attachment-id>` | Resume from `detached`, re-project current state |
| Status | `narada site attachments <site-id>` | List active/detached/stale attachments for a Site |
| Transfer | `narada site transfer <attachment-id> --to <principal-id>` | Old → `transferred`, new → `attached` |

### 8.3 Heartbeat and Staleness Detection

- Attached principals must send periodic heartbeats (e.g., every 30 seconds).
- If no heartbeat for `heartbeat_timeout_ms` (default: 120s), the attachment is marked `stale`.
- Stale detection is owned by the console/registry layer, not the Site.

---

## 9. Acceptance Criteria

- [x] Session vocabulary is defined: `AgentSession` (kernel), `SiteAttachment` (operator/agent), `ContinuationAffinity` (scheduler advisory).
- [x] Lifecycle states are defined for `SiteAttachment`: `attached`, `detached`, `stale`, `transferred`, `closed`.
- [x] Authority rules are explicit: attachment ≠ authority, single active controller default, detach does not fail Cycle.
- [x] Resume context is defined as a **projection from durable state**, not a snapshot or log replay.
- [x] Detach/transfer semantics cover: voluntary, forced stale, transfer, budget-exhausted, crash recovery.
- [x] Mapping to existing surfaces is documented: roster, task assignments, `continuation_affinity`, Site health/Trace.
- [x] `shpool` inspiration is acknowledged and divergences are explicit.
- [x] No kernel schema changes are required for v0.

---

## 10. Residuals

- **Console implementation:** Tasks 379–384 (Operator Console / Site Registry chapter) may incorporate `SiteAttachment` state into the registry storage design.
- **Cloudflare attachment DO:** If Cloudflare Sites need server-side attachment tracking, a lightweight DO can be proposed as a follow-up task.
- **Multi-operator mode:** Explicit conflict resolution for multiple `interact` attachments is deferred.
- **Agent runtime integration:** The mechanical agent roster (Task 385) could be extended to track which Sites each agent is attached to.
