---
status: closed
closed: 2026-04-24
depends_on: [570, 571]
governed_by: task_close:a2
---

# Task 574 - Kimi CLI Principal Session Binding Contract

## Goal

Define how Narada binds principals such as `a1`–`a6` to stable `kimi-cli` sessions so assignment dispatch and work pickup can target the correct local agent session rather than relying on manual relay.

## Why

Narada already supports `kimi-cli` runtime options:

- `session_id`
- `continue_session`
- `work_dir`

But it does not yet model principal-to-session binding as first-class runtime state. Today, human-readable Kimi session titles like `a1`, `a2`, `a3`, `a4`, `a5`, `a6` exist operationally, but Narada does not know whether those titles are:

- authoritative session handles,
- merely human labels,
- or labels that must resolve to opaque session ids.

Without this contract, dispatch cannot safely target the intended agent session.

## Required Work

1. Define the binding model between Narada principal and Kimi session:
   - principal id
   - session handle type
   - session resolution posture
   - recovery / rotation posture
2. Decide what Narada should treat as canonical:
   - opaque session id,
   - titled session name,
   - or title + resolved session id pair.
3. Define where the binding lives:
   - principal runtime,
   - operation/site config,
   - or dispatch-local state.
4. Define how dispatch uses the binding when launching or resuming `kimi-cli`.
5. Define failure handling:
   - session missing
   - title collision
   - stale session id
   - login required
6. State explicit non-goals:
   - no full remote session orchestration
   - no pretending Kimi title semantics are stronger than they are
7. Record verification or bounded blockers.

## Acceptance Criteria

- [x] Principal-to-session binding model is explicit
- [x] Canonical session handle choice is explicit
- [x] Binding storage location is explicit
- [x] Dispatch use and failure handling are explicit
- [x] Non-goals are explicit
- [x] Verification or bounded blocker evidence is recorded

## Execution Notes

Researched existing concepts:
- Decision 570 (Dispatch Zone) and 571 (Dispatch Packet) define assignment → dispatch → execution crossing
- Decision 397 (Session Attachment) defines `AgentSession` (kernel trace), `SiteAttachment` (ephemeral connection), and `ContinuationAffinity` (scheduler advisory)
- `KimiCliCharterRunner` already accepts `sessionId` and `continueSession` via global `CharterRuntimeConfig`
- `PrincipalRuntime` has `active_session_id` but it is explicitly NOT serialized in `JsonPrincipalRuntimeRegistry`
- `session_id` in config is global, not per-principal — a gap for multi-agent setups

Key design choices in the contract:

1. **Binding model**: `principal_id → { session_id, session_title?, bound_at, last_verified_at }`
   - `session_id` is the operational handle (passed to `--session`)
   - `session_title` is an advisory human label (e.g., `a2`)

2. **Canonical handle**: **Title + resolved session_id pair**
   - `session_id` has operational authority
   - `session_title` is human-readable but explicitly not unique
   - Resolution from title to id picks most-recently-active on collision

3. **Storage location**: Principal runtime local state (`${NARADA_PRINCIPAL_STATE_DIR}/principal-session-bindings.json`)
   - NOT in Site coordinator (local-only concept)
   - NOT in config (static vs dynamic mismatch)
   - Ephemeral by design — if lost, re-bind on next dispatch

4. **Dispatch use**: Lookup binding → `--session <id>` → fallback `--continue` → fallback fresh session
   - Config-level `session_id` is a default for single-principal setups only
   - Per-principal bindings always override config default

5. **Failure handling**: 6 failure modes with explicit recovery:
   - Session missing / stale: clear binding, retry with `--continue`
   - Title collision: pick most-recently-active, log warning
   - Login required: surface to operator, do not dispatch
   - Binding file corrupt: treat as empty, re-create

6. **Non-goals**: 7 items explicitly deferred including remote orchestration, multi-session multiplexing, server-side tracking, and cross-machine migration.

## Verification

- Decision artifact at `.ai/decisions/20260424-574-kimi-cli-principal-session-binding-contract.md` ✅
- Binding model explicit with TypeScript interface ✅
- Canonical handle choice explicit with rationale ✅
- Storage location explicit with comparison table ✅
- Dispatch use explicit with flow diagram ✅
- Failure handling explicit with 6-row table ✅
- Non-goals explicit with 7 items ✅
- Relationship to existing concepts documented without layer collapse ✅
- `pnpm typecheck`: all 11 packages clean ✅

## Bounded Blockers

- **Task 575+**: Concrete `KimiSessionBinding` type, registry implementation, and runner integration are deferred to implementation tasks
- **Task 572**: Dispatch packet SQLite schema does not yet include session context field
- **`kimi session list` API**: Resolution from title to session_id requires a Kimi CLI command that lists sessions; this contract assumes such a command exists or will be added
