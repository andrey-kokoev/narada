# Session-Owned Process Lifecycle

Narada launch/session materialization may spawn runtime servers, MCP runtime proxies, MCP child servers, local operator projections, and helper processes. Those processes are not ambient machine services by default. They must have explicit ownership and cleanup semantics.

## Core Rule

```text
A Site launch session owns the process tree it creates. Session-owned descendants must be terminated, reaped, or explicitly transferred when the launch session ends.
```

This rule is scoped to declared process ownership. It does not mean every process on the machine depends on its raw parent PID forever. Some processes are host-owned or intentionally shared.

## Ownership Classes

Every Narada-spawned process should be classifiable as one of:

| Class | Meaning | Default Reuse |
| --- | --- | --- |
| `session_owned` | Created for one carrier/session or one Site launch. | Not reused after owner session ends. |
| `host_owned` | Created by the User Site, PC Site, or host runtime as a durable local service. | May be reused by policy. |
| `shared_service` | Intentionally shared across sessions and Sites with explicit freshness and admission policy. | May be reused only when policy says so. |

Unclassified Site-local process children should be treated as `session_owned` for cleanup.

## Required Ownership Stamp

A Narada-spawned process or process registry record should carry enough metadata to answer who owns it and when it may be reused:

- `site_root`
- `site_id` when known
- `carrier_session_id`
- `agent_start_event_id`
- `surface_id` when the process hosts an MCP surface
- `created_by_pid` for the process that created the child, plus `launch_supervisor_pid` when a supervisor owns cleanup
- `ownership`: `session_owned`, `host_owned`, or `shared_service`
- `process_role`: `workspace_launch_plan`, `runtime_start`, `runtime_server`, `mcp_child`, `operator_projection`, or `helper`
- `cleanup_policy` and `transfer_policy`
- `evidence_status` and `validation_errors`
- `created_at` / boot time
- source/freshness basis when the process hosts code that can change

## Cleanup Semantics

When a launcher/session exits or is superseded, Narada must cleanup all `session_owned` descendants it created:

- agent runtime server processes;
- Site-scoped MCP runtime proxies;
- Site-scoped MCP child servers;
- local agent-web-ui projection processes;
- helper processes spawned only for that carrier/session.

Cleanup must kill downstream process trees, not just the visible shell or proxy process. Killing only the parent proxy while leaving the MCP child alive creates an orphan that can later be mistaken for a fresh surface.

## Launch Preflight

Before starting a new Site launch session, the launcher should inspect existing process records for the same Site/surface:

| Existing Process | Required Behavior |
| --- | --- |
| `session_owned`, owner session dead | Reap/kill before launch. |
| `session_owned`, owner session alive but different | Refuse, isolate, or require explicit operator takeover. |
| `host_owned` | Reuse only when host policy admits it and freshness is valid. |
| `shared_service` | Reuse only when explicitly declared shared and freshness is valid. |
| unclassified Site-local child | Treat as stale `session_owned`; reap or refuse. |

New launches must not silently attach to an old session-owned MCP process merely because it is reachable. Reachability is not freshness, authority, or lifecycle ownership.

Workspace launch attempts must persist their expected `launch_session_id` values and use them for every later dashboard recheck. A recheck that only matches by Site, role, or runtime is not authoritative; it can rediscover an old reachable carrier and mistake it for the launch being observed.

When a new launch observes a same Site/role session with a different `launch_session_id`, it may cleanup that existing process only if the existing record is explicitly `session_owned` and has `cleanup_policy: terminate_with_launch_session`. The launcher should request graceful `session.close` through the session control path when available, then terminate the recorded process tree when PID evidence exists. Unclassified or host/shared processes must not be killed by this path.

## Schema Ownership

The ownership stamp schema is part of Narada's launch authority boundary and should be maintained as a single semantic contract across TypeScript CLI code and JavaScript runtime code. If the implementation is split across language/package boundaries, tests must prove the emitted schema name, ownership classes, process roles, cleanup policy, transfer policy, and validation semantics stay equivalent.

## Freshness Rule

A process may be considered fresh for a requested change only if its boot evidence is newer than the restart request or source change that required the restart, or if an explicit freshness reconciliation record proves equivalence.

A process that predates the relevant restart request remains stale even if the operator opened a new launcher or browser tab.

## Boundary

This doctrine does not make raw OS process ancestry the source of authority. Raw ancestry is evidence. The authority-relevant lifecycle is the declared ownership class plus session/process registry evidence.

This doctrine also does not require killing User Site host-level MCP surfaces when a local project/Site carrier closes. Host-owned MCP surfaces may survive if they are declared host-owned and pass policy/freshness checks.

## Failure Mode This Prevents

A Sonar Site task-lifecycle MCP process remained alive after the operator closed visible PowerShell and browser windows. A later launch could have seen that reachable MCP process and misread it as the current Site surface, despite its boot time predating a required restart request.

The correct behavior is:

1. identify the process as Site/session-owned unless explicitly declared otherwise;
2. compare boot time to the restart request/source freshness marker;
3. reap old session-owned descendants when the owning launch session ends;
4. require a fresh process before using it as authority for Site-local task lifecycle work.

## Relation To Site Factorization

This doctrine refines the runtime-locus and execution-surface dimensions in [Site Factorization](site-factorization.md). A process can realize a Site operation, but it is not the Site authority object. Process ownership controls lifecycle and reuse; Site authority still comes from declared interfaces and governed crossings.
