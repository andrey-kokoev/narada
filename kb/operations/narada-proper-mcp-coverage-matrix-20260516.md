# Narada Proper MCP Coverage Matrix - 2026-05-16

## Scope

Task: `20260516-1365-map-narada-proper-mcp-package-coverage-against-command-surfa`

Compared:

- `packages/narada-proper-mcp/src/server.ts`
- `packages/layers/cli/src/mcp-server.ts`
- Related package posture from `packages/mcp-shell-windows`, `packages/mcp-test-windows`, and `packages/mcp-surface-carrier-supervisor`

## Tool Inventory

`packages/narada-proper-mcp/src/server.ts` exposes these tools:

- `narada_site_context`
- `agent_context_hydrate_current`
- `narada_mcp_fabric_context`
- `site_task_lifecycle.plan_init`
- `site_task_lifecycle.admit_task`
- `site_task_lifecycle.materialize_task`
- `site_task_lifecycle.read_task`
- `agent_context_memory.plan_hydration`
- `agent_context_memory.record_checkpoint`
- `agent_context_memory.read_checkpoint_summary`
- `narada_inbox_doctor`
- `narada_inbox_work_next`
- `narada_task_work_next`
- `narada_inbox_list`
- `narada_inbox_show`
- `narada_inbox_submit_observation`
- `narada_ee_mcp_doctor`

`packages/layers/cli/src/mcp-server.ts` exposes the same list except `site_task_lifecycle.materialize_task`.

Both files also dispatch `narada_ee_run`, but it is not listed in `NARADA_MCP_TOOLS`; it is a hidden/legacy coupled command path with strict command-id grammar and capability traversal checks.

## Coverage Matrix

| Surface family | Narada proper MCP package | Legacy CLI MCP facade | Coverage posture | Canonical owner before expansion |
|---|---:|---:|---|---|
| Site context | `narada_site_context`, `narada_mcp_fabric_context` | Same | Implemented read-only | Site context / routing-addressing services |
| Inbox read | `narada_inbox_doctor`, `narada_inbox_work_next`, `narada_inbox_list`, `narada_inbox_show` | Same | Partial; read and optional claim through CLI command wrappers | Canonical Inbox service and inbox command surfaces |
| Inbox mutation | `narada_inbox_submit_observation`; `narada_inbox_work_next claim=true` | Same | Partial mutating facade with command-wrapper evidence | Canonical Inbox admission/status service |
| Task lifecycle read | `site_task_lifecycle.read_task`; `narada_task_work_next claim=false` | Same | Partial; local lifecycle row read plus task work-next | Task lifecycle service and work-next service |
| Task lifecycle mutation | `site_task_lifecycle.admit_task`, `site_task_lifecycle.materialize_task`, `narada_task_work_next claim=true` | Legacy lacks materialize; has admit/work-next claim | Partial and legacy-coupled; materialize is proper-package-only | Task lifecycle service, assignment/claim service, task create/report/review/close commands |
| Work-next | `narada_task_work_next`, `narada_inbox_work_next` | Same | Partial; claim flag makes mutation explicit but still command-facade coupled | Work-next service over task/inbox lifecycle |
| Agent context | `agent_context_hydrate_current`; `agent_context_memory.*` | Same | Implemented for planned hydration/checkpoint summary; partial for durable memory lifecycle | Agent context memory package/service |
| Capability / consent | Fabric traversal reads `.ai/capability-consent-registry.json`; no first-class tools | Same | Partial internal check only; no canonical consent CRUD/export/reconstruct tool | Canonical capability consent registry and capability-governed secret management |
| Command execution | Hidden `narada_ee_run`; `narada_ee_mcp_doctor` | Same | Refused/legacy-coupled; WSL Windows path marked superseded by Windows-native posture | Command Execution Intent Zone; Windows shell MCP package for bounded execution descriptors |
| Filesystem reads/writes | No general file tools | Same | Intentionally missing/refused | Bounded file excerpt reader or stronger canonical service per state surface |
| Tests | No Narada proper MCP test execution tool | Same | Missing in proper facade; descriptor contracts exist in `@narada2/mcp-test-windows` | Test gateway package and command execution intent service |
| Shell / Git | No general shell/Git tools; hidden EE run is superseded | Same | Missing/refused in proper facade; descriptor package exists for shell policy | `@narada2/mcp-shell-windows`, repository publication intent zone |
| Operator surface | No bind/focus/action tools | Same | Missing; denied source imports mention operator surfaces as unsafe runtime state | Operator Surface service and operator-surface adapter |
| Site probe/connectivity/identity/lift | Fabric context only; no probe/connect/identity/lift tools | Same | Mostly missing | Site probe/connectivity/identity/lift services before MCP exposure |
| Outbox | No tools | Same | Missing/refused | Canonical Outbox service |
| Publication | No commit/push/publication tools | Same | Missing/refused | Repository Publication Intent Zone |

## Legacy Coupling Posture

Retain for compatibility:

- `narada_site_context`, `agent_context_hydrate_current`, `narada_mcp_fabric_context`.
- Inbox/task read and work-next command wrappers while canonical service-backed MCP tools are developed.
- `agent_context_memory.*` because it already targets a bounded package/service and rejects denied runtime-state imports.

Quarantine:

- `site_task_lifecycle.admit_task` and `site_task_lifecycle.materialize_task` until they are backed by canonical lifecycle services with Git-visible mutation evidence, not local SQLite convenience as authority.
- `narada_inbox_submit_observation` and claim-capable work-next paths until their mutation evidence and authority transfer rules are made explicit per service.
- Hidden `narada_ee_run`; keep unlisted and superseded unless routed through Command Execution Intent Zone and the Windows-native shell MCP package.

Delete after replacement:

- Direct local lifecycle SQL/facade helpers in the MCP server once task lifecycle service APIs own admission/materialization/readback.
- Any WSL-to-Windows EE run compatibility path once Windows-native shell/test MCP surfaces cover the needed governed execution.

## Missing Mutating Surfaces and Required Owners

| Missing mutating surface | Owner or refusal rationale |
|---|---|
| Task report/review/close/confirm/finish | Task lifecycle service and task CLI command family; do not expose until admission, review authority, and evidence export are service-owned. |
| Inbox triage/promote/pending/task/status transitions | Canonical Inbox service; do not infer from `submit_observation`. |
| Outbox compose/approve/send/archive/export | Canonical Outbox service; no MCP exposure until outbound intent and transport confirmation are separate. |
| Command execution | Command Execution Intent Zone; hidden EE run is not canonical execution authority. |
| Git commit/push/publication | Repository Publication Intent Zone; shell/Git package may describe execution but must not become publication authority. |
| Operator surface bind/focus/action | Operator Surface service; avoid volatile handle guessing or desktop-state mutation. |
| Capability consent create/revoke/rotate | Canonical capability consent registry and capability-governed secret management; MCP should expose refs/posture, not secrets. |
| Site lift/connect/probe/identity mutation | Site lifecycle, identity, and lift services; fabric context is read posture only. |

## Finding

The Narada proper MCP package is not full Narada proper command coverage. It is a bounded agent-facing facade with Site/fabric context, partial inbox/task lifecycle, agent context memory, and legacy EE posture. The legacy CLI MCP facade should be treated as compatibility substrate, not as the canonical authority implementation. New MCP tools should be admitted only after the owning service or command family is named and can provide bounded evidence.
