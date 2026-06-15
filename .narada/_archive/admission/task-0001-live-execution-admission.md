# task-0001 Live Execution Admission Decision

Decision id: `narada-proper.admission.task-0001.live-execution`
Candidate packet: `.narada/admission/candidates/task-0001-live-execution-admission-packet.md`
Inbound OSM: `osm_20260510_140315_296_726d772e`
Decision: `blocked`
Recorded: 2026-05-10

## Decision

Do not execute live receiving-Site task-lifecycle setup in this session.

The incoming request authorizes asking Narada proper to proceed from the prepared packet, but the current Narada proper authority record does not admit the concrete execution carriers/surfaces required by the packet.

## Evidence

- The candidate packet says it is enough for admission decision/planning, not enough by itself to execute live setup.
- The existing admitted carrier `narada-proper.carrier.task-0001.package-implementation.v0` is limited to package implementation scope.
- No concrete adapter command/tool is admitted.
- No DB mutation carrier through an admitted adapter is admitted.
- No live MCP registration command/tool/surface is admitted.
- No receiving-Site write root for live initializer execution has been admitted beyond the existing package implementation and `.narada` evidence work.

## Exact Admissions Still Needed

1. `narada-proper.exec.task-0001.initializer.v0`
   - Must admit the receiving Site root for initializer writes.
   - Must name the exact execution carrier/tool for `initializeSiteTaskLifecycle(options)`.
   - Must define before/after file evidence and rollback.

2. `narada-proper.exec.task-0001.concrete-adapter.v0`
   - Must name the concrete adapter implementation outside `@narada2/site-task-lifecycle`.
   - Must name its dependency/driver owner.
   - Must provide conformance and rollback evidence.

3. `narada-proper.exec.task-0001.db-mutation.v0`
   - Must name the concrete adapter invocation for schema and task admission writes.
   - Must provide idempotency, readback, and rollback evidence.

4. `narada-proper.exec.task-0001.mcp-registration.v0`
   - Must name the Narada proper MCP registration tool/transport.
   - Must prove tools cannot mutate without admitted adapter authority.
   - Must provide unregister rollback evidence.

## Refused Actions

- No initializer execution.
- No concrete adapter admission.
- No DB mutation execution.
- No live MCP registration.
- No narada-andrey DB/task/inbox/roster/checkpoint/operator-surface/PC/secrets/identity state import.
- No source history import.

## Terminal State

Terminal live Site setup is not claimable.

Current posture: `blocked_pending_live_execution_admission`.
