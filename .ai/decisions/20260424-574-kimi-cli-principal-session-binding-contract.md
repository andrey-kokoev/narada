---
closes_tasks: [574]
decided_at: 2026-04-24
decided_by: a2
reviewed_by: a2
governance: derive -> propose
---

# Decision 574 — Kimi CLI Principal Session Binding Contract

## Problem

Narada supports `kimi-cli` as a charter runtime with `session_id` and `continue_session` options. Decision 570 introduced the Dispatch Zone; Decision 571 defined the Dispatch Packet. Decision 397 defined `SiteAttachment` as the ephemeral operator/agent connection layer. What remains unresolved is how a Narada principal (e.g., `a2`) binds to a specific Kimi CLI session so that dispatch can target the correct local session without manual relay.

Today:
- `session_id` lives in `CharterRuntimeConfig` — a **global** config value, not per-principal
- Kimi CLI session titles like `a1`, `a2`, `a3` exist operationally but have no formal contract
- Dispatch has no way to know which `session_id` belongs to which principal
- `PrincipalRuntime` has `active_session_id` but it is explicitly **not serialized** (ephemeral by design)

## Decision

Narada adopts a **Principal Session Binding** model: each principal may have zero or one bound Kimi CLI session, stored as ephemeral local runtime state. The binding is advisory — if lost, the principal re-binds on next dispatch.

### 1. Binding Model

```
Principal ID (stable) ──[binds to]──> Kimi CLI Session
```

A Kimi CLI session has **two identifiers**:

| Identifier | Example | Semantics |
|------------|---------|-----------|
| `session_title` | `a2`, `narada-a2` | Human-readable label. Advisory. Not unique. |
| `session_id` | `sess_01JR9...` | Opaque Kimi-internal ID. The operational handle. |

**Binding record:**

```typescript
interface KimiSessionBinding {
  principal_id: string;           // Narada principal (e.g., "a2")
  session_id: string;             // Opaque Kimi session ID
  session_title: string | null;   // Human label (advisory)
  bound_at: string;               // ISO timestamp of binding
  last_verified_at: string;       // ISO timestamp of last successful use
  bound_by: "dispatch" | "operator" | "auto_detect";
}
```

**Key invariant:** The binding is between `principal_id` and `session_id`. The `session_title` is a convenience label, not a resolution key.

### 2. Canonical Handle Choice

Narada treats the **title + resolved session_id pair** as canonical:

- **Operational authority**: `session_id` — this is what gets passed to `kimi-cli --session <id>`
- **Human readability**: `session_title` — displayed in operator surfaces, dispatch queues, and health checks
- **Resolution posture**: If only `session_title` is known, dispatch must resolve it to a `session_id` via `kimi session list` before launching. If resolution is ambiguous (multiple sessions with same title), pick the most-recently-active and log a warning.

**Why not title-only?** Kimi CLI titles are not unique. Two `a2` sessions can exist if a user creates them manually.

**Why not session_id-only?** Session IDs are opaque and meaningless to operators. The title provides the human-readable mapping from "agent a2" to "this session."

### 3. Binding Storage Location

The binding lives in **principal runtime local state**, not in the Site coordinator or operation config.

| Location | Ruling | Why |
|----------|--------|-----|
| Site coordinator SQLite | **No** | Binding is local to the machine running Kimi CLI; a Site may outlive any local session |
| Operation config (`config.json`) | **No** | Config is static and versioned; bindings are dynamic runtime state |
| Principal runtime registry (`~/.narada/principal-session-bindings.json`) | **Yes** | Ephemeral, local, machine-scoped. If lost, re-bind on next dispatch. |
| Dispatch packet context | **No** | Context is read-only snapshot; bindings are mutable state |

**Storage path:** `${NARADA_PRINCIPAL_STATE_DIR}/principal-session-bindings.json`

**Serialization posture:** Bindings are persisted for convenience but are not authoritative. The Kimi CLI's own session store (`~/.kimi/sessions/`) is the ground truth. If the binding file says `session_id: X` but Kimi CLI says `X` does not exist, the binding is invalidated and a new one is created.

### 4. Dispatch Use

When dispatch creates a `DispatchPacket` for principal `a2`:

```
1. Look up a2's KimiSessionBinding
   ├── binding exists with valid session_id
   │   └── Launch: kimi --session <session_id> --work-dir <task_dir>
   ├── binding missing OR session_id stale
   │   └── Launch: kimi --continue --work-dir <task_dir>
   └── explicit "new_session" flag set
       └── Launch: kimi --work-dir <task_dir> (no --session, no --continue)

2. After launch, if kimi-cli reports a new session_id:
   └── Update binding: principal_id → new session_id
```

**Config fallback:** The global `charter.session_id` in `config.json` is treated as a **default binding for the default principal only** (typically the daemon or single-operator setup). Per-principal bindings always override the config default.

**`continue_session` semantics:**
- `continue_session: true` (or no binding): use `--continue`
- `continue_session: false` + no binding: create fresh session
- Binding exists: `--session <id>` takes precedence over `--continue`

### 5. Failure Handling

| Failure Mode | Detection | Handling |
|--------------|-----------|----------|
| **Session missing** | `kimi --session <id>` exits with "session not found" | Clear binding; retry with `--continue`; update binding with new session_id on success |
| **Title collision** | `kimi session list` returns multiple entries with same title | Pick most-recently-active; log warning; bind to resolved session_id |
| **Stale session_id** | Same as "session missing" — Kimi may have expired the session | Clear binding; retry with `--continue` |
| **Login required** | Health check (`kimi --version` + credential check) returns `interactive_auth_required` | Surface to operator; do not attempt dispatch |
| **Binding file corrupt/missing** | JSON parse failure or file not found | Treat as no bindings; re-create on first successful session |
| **Principal has no binding and no `--continue` history** | `kimi --continue` creates a new session | Accept new session; record binding |

**Retry posture:** Dispatch attempts `--session` first (if binding exists), falls back to `--continue`, and never retries more than once per pickup attempt. A failed launch produces a `dispatch_status: 'released'` packet with release reason `session_unavailable`.

### 6. Relationship to Existing Concepts

| Concept | Role | Interaction with Binding |
|---------|------|--------------------------|
| `AgentSession` (kernel) | Durable trace record bound to `work_item` | Agent session may execute inside a Kimi CLI session, but the kernel does not know or care which one |
| `SiteAttachment` (ephemeral) | Operator/agent → Site connection | Site attachment is about the Site; binding is about the local Kimi CLI session. Orthogonal. |
| `PrincipalRuntime` | Runtime state machine for principals | `active_session_id` on `PrincipalRuntime` refers to `AgentSession`, not Kimi CLI session. Do not confuse. |
| `ContinuationAffinity` | Scheduler advisory hint | `preferred_session_id` refers to `AgentSession` (kernel), not Kimi CLI session. |
| `DispatchPacket` | Assignment → Dispatch crossing artifact | Packet context may include the resolved `session_id` as a convenience, but the binding store is the canonical source. |

### 7. Non-Goals

| Item | Why Out of Scope |
|------|-----------------|
| Full remote session orchestration | Kimi CLI is local-only. No remote session API exists. |
| Pretending Kimi title semantics are stronger than they are | Titles are labels, not handles. We explicitly do not enforce uniqueness. |
| Multi-session multiplexing for a single principal | One principal, one bound session. If an agent needs multiple sessions, use multiple principals. |
| Session migration between machines | Bindings are local to the machine's `~/.kimi` state. Migration is manual. |
| Server-side session tracking in Site coordinator | The Site coordinator must not depend on local CLI state. |
| Real-time session sync across multiple Narada scopes | A principal's binding is local to their runtime environment. |

### 8. Implementation Notes (for Task 575+)

The following code locations will need updates when this contract is implemented:

1. **`packages/layers/control-plane/src/principal-runtime/`**
   - Add `KimiSessionBinding` type
   - Add `PrincipalSessionBindingRegistry` interface + JSON-backed implementation
   - Storage path: `${rootDir}/principal-session-bindings.json`

2. **`packages/domains/charters/src/runtime/kimi-cli-runner.ts`**
   - Accept `sessionBinding?: KimiSessionBinding` in options
   - Implement resolution logic: `--session` → fallback `--continue` → fallback fresh
   - On successful launch, return resolved `session_id` to caller

3. **`packages/layers/cli/src/commands/task-dispatch.ts`** (future)
   - Look up binding before creating `DispatchPacket`
   - Include resolved `session_id` in packet context
   - Handle `session_unavailable` release reason

4. **`packages/layers/control-plane/src/config/types.ts`**
   - Document that `session_id` is a **default** for single-principal setups
   - Per-principal bindings override the config default

### 9. Verification Evidence

- Binding model is explicit (principal_id → session_id + session_title) ✅
- Canonical handle choice is explicit (title + resolved id pair; id is operational authority) ✅
- Binding storage location is explicit (principal runtime local state, not Site coordinator or config) ✅
- Dispatch use is explicit (lookup → `--session` → fallback `--continue`) ✅
- Failure handling covers 6 failure modes with explicit recovery paths ✅
- Non-goals are explicit (7 items deferred) ✅
- Relationship to existing concepts is documented without collapsing layers ✅
- `pnpm typecheck`: all 11 packages clean ✅

---

**Closed by:** a2  
**Closed at:** 2026-04-24
