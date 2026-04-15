# Assignment — Agent C — Tool Binding Runtime

## Role

You are the tooling/runtime engineer for charter tool and knowledge bindings.

Your job is to convert the existing tool-binding architecture into a runtime-ready design that plugs into the new foreman/control-plane model without violating authority boundaries.

## Scope

Primary target:
- `.ai/tasks/20260414-007-assignment-agent-c-tool-binding-runtime.md`

Read first:
- `.ai/tasks/20260414-002-foreman-core-ontology-and-control-algebra.md`
- `.ai/tasks/20260414-003-identity-lattice-and-canonical-keys.md`
- `.ai/tasks/20260414-004-coordinator-durable-state-v2.md`
- `.ai/tasks/20260413-011-charter-tool-bindings.md`
- `.ai/tasks/20260413-007-foreman-and-charters-architecture.md`

## Mission

Produce the implementation-ready runtime contract for charter tool and knowledge bindings.

## Core Invariants

1. Tools are attached by foreman policy, not self-discovered ad hoc by the agent.
2. Tool access is bounded by charter and runtime policy.
3. Tool calls are subordinate to work-item execution, not free-floating.
4. Tool side effects, if any, must be explicit and approval-bounded.
5. Tool availability must not become hidden mutable context.

---

## Task 1 — Binding Attachment Point

### Primary Attachment Point: `execution_attempt`

Bindings are resolved and attached at the moment a `work_item` is leased and an `execution_attempt` begins. The foreman computes the effective binding set for that attempt and embeds it in the **charter invocation envelope**.

### Why execution_attempt?

| Attachment Point | Verdict | Reason |
|------------------|---------|--------|
| `work_item` | Too coarse | A work item may span multiple attempts with different tool policies (e.g., after a policy override or thread re-triage). |
| `execution_attempt` | **Correct** | Bindings are part of the runtime context for a single bounded invocation. They are immutable for the duration of the attempt. |
| `charter invocation envelope` | Correct delivery target | This is where the charter runtime reads its permitted capabilities. But the envelope itself is derived from the execution attempt context. |
| `runtime session` | Wrong | Sessions are correlation-only and may span multiple unrelated conversations. Bindings are conversation-scoped. |

### Resolution Flow

1. **Configuration source**: `CoordinatorConfig.mailbox_bindings[mailbox_id].charter_tools[charter_id]`
2. **Foreman static resolution**: The foreman reads the configured bindings for the charter.
3. **Foreman dynamic resolution**: The foreman may add or remove tools based on thread-level classifications (e.g., product-specific tools).
4. **Execution context freeze**: The resolved tool catalog and knowledge source list are frozen and written into the `execution_attempt` context.
5. **Charter envelope delivery**: The charter runtime receives only the frozen catalog. It cannot discover additional tools during execution.

---

## Task 2 — Binding Identity

### Tool Binding Identity

A tool binding is identified by a composite key within the runtime context:

```
binding_reference = {
  tool_id: string;        -- global tool identifier (from ToolDefinition.id)
  charter_id: string;     -- charter this binding applies to
  mailbox_id: string;     -- mailbox scope
  binding_version: null;  -- v1 does not version bindings independently
}
```

### Identity Rules

1. **`tool_id` is the global canonical identifier**: It references the `tool_definitions` map in `CoordinatorConfig`.
2. **No separate binding ID is required**: A binding is uniquely located by `(mailbox_id, charter_id, tool_id)`.
3. **Runtime instance is anonymous**: The tool runner does not mint instance IDs. Each invocation is identified by the `execution_attempt.execution_id` under which it runs.
4. **Knowledge source binding ID**: Knowledge sources use the same pattern — `(mailbox_id, charter_id, source_id)`.

### Versioning
- Tool **definitions** may evolve in config, but the binding snapshot used for an execution attempt is immutable.
- If a config change happens mid-execution, it does not affect the active attempt.

---

## Task 3 — Runtime Envelope

### What the Charter Runtime Receives

The charter runtime receives a frozen `RuntimeCapabilityEnvelope` as part of its invocation input:

```typescript
interface RuntimeCapabilityEnvelope {
  available_tools: ToolCatalogEntry[];
  available_knowledge_sources: KnowledgeCatalogEntry[];
  allowed_actions: AllowedAction[];
  side_effect_budget: SideEffectBudget;
}

interface ToolCatalogEntry {
  tool_id: string;
  purpose: string;
  read_only: boolean;
  requires_approval: boolean;
  schema_args?: ToolArgSchema[];
}

interface KnowledgeCatalogEntry {
  source_id: string;
  kind: "doc" | "playbook" | "sqlite_history" | "custom";
  description: string;
  content_ref?: string;   // optional pre-fetched content reference
}

interface SideEffectBudget {
  max_tool_calls: number;         // default: 10 per execution attempt
  max_write_tool_calls: number;   // default: 0 if no write tools permitted
  total_timeout_ms: number;       // cumulative budget for all tool calls
}
```

### Permissions

The runtime envelope explicitly states:
- Which tools are available
- Whether each tool is read-only
- Whether each tool requires approval
- Which actions the charter may propose

The charter runtime **must not** allow the charter to request tools or actions outside this envelope.

### Timeout / Budget Limits

- **Per-tool timeout**: `ToolBinding.timeout_ms` (enforced by tool runner)
- **Per-attempt tool call limit**: `SideEffectBudget.max_tool_calls`
- **Per-attempt write tool limit**: `SideEffectBudget.max_write_tool_calls`
- **Cumulative tool budget**: `SideEffectBudget.total_timeout_ms`

If a budget is exceeded, the foreman/tool runner returns a `budget_exceeded` error and the charter must proceed without further tool calls.

---

## Task 4 — Call Logging

### Durable Record: Tool Call Record (Execution-Attempt Attached)

Every tool invocation creates a durable record in a **`tool_call_records`** table. This table is subordinate to `execution_attempts` and is part of the coordinator SQLite database.

```typescript
interface ToolCallRecord {
  call_id: string;              // tc_<uuid>
  execution_id: string;         // references execution_attempts.execution_id
  work_item_id: string;         // denormalized for quick lookup
  conversation_id: string;      // denormalized for quick lookup
  tool_id: string;
  request_args_json: string;
  exit_status: "success" | "timeout" | "permission_denied" | "error" | "budget_exceeded";
  stdout: string;
  stderr: string;
  structured_output_json?: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
}
```

### Why a Separate Table?

| Option | Verdict | Reason |
|--------|---------|--------|
| Trace only | Insufficient | Traces are commentary. Tool calls are bounded runtime events with structured arguments and results. They deserve first-class queryability. |
| Execution-attempt attachment only | Partial | The execution attempt record captures summary metadata, but not per-call detail. |
| **Separate tool_call_records table** | **Correct** | Aligns with durable state requirements, supports audit queries, and does not rely on traces. |
| Debug logging only | Insufficient | Not durable, not queryable, violates observability requirements. |

### Relationship to Traces

- A trace row may **reference** a `tool_call_record.call_id` for correlation.
- The trace stores the charter's reasoning about why the tool was requested.
- The `tool_call_record` stores the actual invocation and result.
- Deleting traces must not delete `tool_call_records`.

---

## Task 5 — Error Semantics

### Unavailable Tool

**Condition**: The charter requests a `tool_id` that is not in `available_tools`.

**Behavior**:
1. Foreman validation rejects the request **before** any tool runner invocation.
2. The tool runner is never called.
3. The charter receives a `ToolResult` with:
   - `exit_status: "error"`
   - `stderr: "Tool '<tool_id>' is not in the available catalog for this execution."`

### Timeout

**Condition**: Tool execution exceeds `ToolBinding.timeout_ms`.

**Behavior**:
1. Tool runner hard-kills the process / cancels the HTTP request.
2. `tool_call_record.exit_status = "timeout"`.
3. `stderr` contains timeout diagnostic.
4. The charter may retry with different args or proceed without the result.

### Permission Denial

**Condition**:
- Tool `requires_approval: true` and no approval exists.
- Tool `read_only: false` and write tools are disabled by policy.
- Tool args violate `schema_args` constraints.

**Behavior**:
1. Foreman validation blocks the request.
2. `tool_call_record.exit_status = "permission_denied"`.
3. The charter receives a structured error explaining the denial.

### Partial Side Effect

**Condition**: A non-read-only tool starts executing, makes some external changes, then crashes or times out.

**Behavior**:
1. This is an **external system concern**. The tool runner cannot roll back the side effect.
2. `tool_call_record.exit_status = "error"` (or `"timeout"`).
3. `stderr` should capture any partial-state indicators returned by the tool.
4. The foreman may surface this as an escalation in the charter output.
5. **No automatic retry** for write tools that partially succeeded. Human intervention is required.

### Stale Knowledge Source Binding

**Condition**: A knowledge source `content_ref` is missing or the underlying file/DB is unreachable.

**Behavior**:
1. The foreman attempts to resolve the content ref at envelope construction time.
2. If resolution fails, the source is **omitted from the envelope** (not included with an error flag).
3. The charter receives the catalog without the stale source.
4. The foreman logs a warning but does not fail the execution attempt.

---

## Task 6 — Safety Boundaries

### Read-Only Tools

- **`read_only: true`** is the default.
- Read-only tools may be invoked without human approval unless `requires_approval: true`.
- The tool runner still logs every invocation.
- Read-only status is a **policy flag**, not a filesystem/network guarantee. The runner does not enforce read-only behavior at the OS level.

### Approval-Gated Tools

- **`requires_approval: true`** causes the foreman to block the tool request until approved.
- Approval may come from:
  - A human operator via UI
  - An auto-approval policy (e.g., read-only tools during business hours)
- If approval is pending, the charter execution is **suspended** (lease heartbeat continues) or **returns a pending status** to be resumed later.
- The `tool_call_record` is written with `exit_status: "pending_approval"` (if the record is created at request time) or the request is held in a `pending_tool_approvals` queue.

### Forbidden Tools

- A tool may be forbidden by:
  - Missing from the mailbox binding entirely
  - `enabled: false` in the binding
  - Dynamic foreman policy (e.g., thread classification removes access)
- Any request for a forbidden tool is rejected at foreman validation with `permission_denied`.

### Runtime-Visible vs Operator-Visible Errors

| Error Type | Runtime-Visible (to Charter) | Operator-Visible (in Logs/Traces) |
|------------|------------------------------|-----------------------------------|
| Invalid tool request | Yes — `permission_denied` with reason | Yes — foreman validation log |
| Timeout | Yes — `timeout` with partial output | Yes — runner kill log |
| Executable not found | Yes — `error` with ENOENT detail | Yes — deployment alert |
| Credential injection failure | No — generic `error` | Yes — secure storage alert |
| Schema validation failure | Yes — `permission_denied` with schema mismatch | Yes — foreman validation log |
| Runner internal crash | Yes — `error` with opaque message | Yes — full stack trace |

**Rule**: Credential and infrastructure errors must never leak secrets or internal paths to the charter runtime.

---

## Binding Runtime Model Summary

```
CoordinatorConfig
    │
    ├── tool_definitions[id]          (global repo/deployment definitions)
    └── mailbox_bindings[mailbox_id]
            │
            ├── charter_tools[charter_id]  (mailbox-scoped bindings)
            └── knowledge_sources[charter_id]

Foreman
    │
    ├── Static resolve: look up bindings for (mailbox_id, charter_id)
    ├── Dynamic resolve: apply thread-level overrides
    └── Freeze into RuntimeCapabilityEnvelope

Execution Attempt
    │
    ├── Receives frozen envelope
    ├── Charter proposes ToolInvocationRequest
    │
    └── Foreman / Tool Runner
            │
            ├── Validate request against envelope
            ├── Check approval gates
            ├── Execute tool
            ├── Write ToolCallRecord
            ├── Write Trace (optional)
            └── Return ToolResult to charter
```

---

## Foreman Validation Rules for Tool Requests

For every `ToolInvocationRequest` proposed by a charter:

1. **Catalog Membership**: `request.tool_id` must exist in `RuntimeCapabilityEnvelope.available_tools`.
2. **Enabled Check**: The corresponding binding must have `enabled !== false`.
3. **Approval Gate**: If `requires_approval === true`, the request must have an explicit approval record.
4. **Read-Write Policy**: If `read_only === false`, the execution attempt must not have exhausted `SideEffectBudget.max_write_tool_calls`.
5. **Schema Validation**: Every provided arg must match `schema_args` by name, type, and required/optional constraints.
6. **Budget Check**: The execution attempt must not have exceeded `SideEffectBudget.max_tool_calls` or `SideEffectBudget.total_timeout_ms`.
7. **Arg Sanitization**: No arg may contain shell metacharacters unless explicitly allowed by the schema. String args are passed as structured data, not concatenated into command lines.

---

## Safety Matrix

| Tool Class | Approval Required | Budget Limit | Retry Allowed | Audit Record |
|------------|-------------------|--------------|---------------|--------------|
| Read-only, no approval | No | Counts toward `max_tool_calls` | Yes | `tool_call_record` + trace |
| Read-only, approval required | Yes | Counts toward `max_tool_calls` | Yes | `tool_call_record` + trace |
| Write-capable | Yes | Counts toward `max_tool_calls` and `max_write_tool_calls` | No (human review required) | `tool_call_record` + trace |
| Forbidden / unavailable | N/A (blocked at validation) | N/A | N/A | Foreman validation log only |

---

## Test Matrix

### Unit Tests

| Test | Scenario | Expected Result |
|------|----------|-----------------|
| U1 | Resolve tools for execution attempt | Correct catalog matches mailbox + charter |
| U2 | Dynamic override removes tool based on classification | Catalog omits removed tool |
| U3 | Charter requests available read-only tool | Request passes validation, runner executes |
| U4 | Charter requests tool not in catalog | Foreman rejects with `permission_denied` |
| U5 | Approval-gated tool without approval | Request held or rejected |
| U6 | Schema validation failure (wrong type) | Foreman rejects before runner invocation |
| U7 | Tool timeout | Runner kills process, `exit_status = "timeout"` |
| U8 | Budget exhaustion | N+1th tool call rejected with `budget_exceeded` |
| U9 | Tool call record written on success | Row exists in `tool_call_records` |
| U10 | Stale knowledge source omitted | Envelope excludes unreachable source, execution continues |

### Integration Tests

| Test | Scenario | Expected Result |
|------|----------|-----------------|
| I1 | Full execution with tool call | Charter receives tool result, produces final output |
| I2 | Tool call mid-execution, runner crashes | Active call record shows error, charter handles gracefully |
| I3 | Write tool partial side effect | No automatic retry, escalation raised |
| I4 | Multi-tool execution within one attempt | All calls logged, budget enforced cumulatively |
| I5 | Concurrent executions for same mailbox | Each gets its own frozen envelope, no cross-contamination |

---

## Deliverables Checklist

- [x] Binding runtime model
- [x] Tool call contract
- [x] Safety matrix
- [x] Foreman validation rules
- [x] Test matrix

## Parallel To

May run in parallel with:
- Agent A — Scheduler and Leases
- Agent B — Charter Invocation v2
- Agent D — Outbound Handoff v2
- Agent E — Replay and Recovery Tests
- Agent F — Daemon-Foreman Dispatch

## Constraints

Do not:
- redesign ontology
- redesign identity model
- implement tool adapters for every provider
- create a general-purpose agent framework
- allow tools to become hidden system authority
