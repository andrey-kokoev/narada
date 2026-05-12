# task-0002 Live Carriers and MCP Surface Admission Decision

Decision id: `narada-proper.admission.task-0002.live-carriers-surface`
Task id: `narada-proper.task-0002`
Inbound OSM: `osm_20260510_141155_707_3ce3f401`
Decision: `admitted_descriptor_only`
Recorded: 2026-05-10

## Decision

Admit the missing task-0001 carrier/surface records as Narada proper descriptor/admission surfaces:

- `narada-proper.carrier.task-0001.initializer-execution.v0`
- `narada-proper.carrier.task-0001.concrete-adapter.v0`
- `narada-proper.carrier.task-0001.db-mutation.v0`
- `narada-proper.surface.task-0001.live-task-lifecycle-mcp-registration.v0`

Also admit `.narada/capabilities/mcp-surfaces.json` as the local capability projection that makes the site-local task lifecycle MCP surface visible.

## Authority Basis

- Narada proper `.narada/site.json` admits `.narada` as local seed authority evidence.
- Task-0001 package implementation authority already admitted package/local evidence work under `narada-proper.carrier.task-0001.package-implementation.v0`.
- The latest OSM request asks for a Narada proper task to create/admit the missing carriers and surface rather than requesting more broad approval.
- The prior blocker audit named exactly these four missing carrier/surface ids.

## Scope Admitted

This decision admits descriptor records and capability visibility only.

It does not execute:

- initializer filesystem writes;
- concrete adapter installation or activation;
- SQLite or task DB mutation;
- live MCP transport registration.

## Refusal Conditions Preserved

Refuse any step that imports narada-andrey runtime DBs, task/inbox history, roster/checkpoint/operator-surface/PC state, secrets, identity-specific data, or source history.

Refuse any step that makes `@narada2/site-task-lifecycle` own a SQLite dependency or directly execute SQLite mutation.

Refuse live MCP registration unless a later Narada proper execution task names the concrete MCP registration transport/tool and rollback route.

## Remaining Execution Blockers

Terminal live Site setup is still not claimable until a separate live execution task admits and executes:

1. receiving Site root initialization;
2. concrete adapter implementation/activation outside the package;
3. DB mutation through the admitted adapter;
4. live MCP registration and smoke test.

## Evidence

- Task surface: `.narada/tasks/task-0002-admit-task-lifecycle-live-surfaces.md`
- Carrier/surface records: `.narada/surfaces/task-0001-*.md`
- Capability declaration: `.narada/capabilities/mcp-surfaces.json`
- Audit: `.narada/audit/task-0002-live-carriers-surface-admission-audit.json`
