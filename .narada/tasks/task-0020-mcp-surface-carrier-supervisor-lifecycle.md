# narada-proper.task-0020

Title: MCP Surface Carrier Supervisor Lifecycle

Status:
- Completed first read-only/status-registry implementation slice.
- Audit: `.narada/audit/task-0020-mcp-surface-carrier-supervisor-lifecycle-audit.json`.
- Package: `@narada2/mcp-surface-carrier-supervisor` at `packages/mcp-surface-carrier-supervisor`.

Source:
- User Site tracking: task #559.
- ISN: `isn_730210d0f3ae49debea88b26ccf56d72`.
- Inbound OSM: `OSM:osm_20260510_202553_877_8944d35c`.
- Reference-carrying upstream request: `OSM:osm_20260510_205048_269_dfd91a90`.
- Local design evidence only: `narada-andrey:docs/concepts/mcp-surface-carrier-supervisor-lifecycle.md`.
- Fixture evidence only: `narada-andrey:docs/concepts/fixtures/mcp-surface-carrier-supervisor/`.
- Supporting convention evidence only: `narada-andrey:kb/operator-surface/operator-surface-message-bus.md`.
- Source context commit: `f4ba725e0d5c19a9c7e6fc46187dcf553957f5a2`.
- Fresh upstream verification evidence: narada-andrey task #562 reported carrier recreation occurred while task-lifecycle restart pressure remained active via `restart_requested` and `source_newer_than_baseline`.

Authority basis:
- Operator requested a Narada proper task for MCP Surface Carrier Supervisor Lifecycle.
- Narada proper target: repo package/CLI/docs/tests and local `.narada` evidence only.
- This task does not admit arbitrary process control, native shell fallback, or stdio MCP self-restart.

Core invariant:
- A stdio MCP server must not self-restart.
- Restart/rebind belongs to an external carrier/supervisor, analogous to operator-surface workspace/site selectors that launch, focus, and bind surfaces without collapsing into the governed surface itself.

Goal:
- Define and implement the first read-only/status-registry slice for MCP surface carrier lifecycle.
- Make stale/live status observable without process kill, restart, rebind, native shell fallback, or hidden carrier mutation.

Lifecycle states:
- `stale`
- `restart_requested`
- `carrier_restarted`
- `live_verified`

Separated authorities/concepts:
- Site authority.
- MCP process.
- Carrier/session.
- Runtime registry.
- Restart request.
- Verification.
- Capability Lifecycle state and exposure class.

First implementation slice:
- Read-only/status registry plus neutral fixtures for stale and verified-live surfaces.
- Descriptor/status output only.
- No arbitrary process kill.
- No stdio self-restart.
- No native shell fallback.
- No live restart execution.

Expected scope:
- Package/CLI-local lifecycle/status types or module.
- Read-only fixture-backed tests for stale and live-verified MCP surfaces.
- Docs or task-local notes composing the lifecycle with Capability Lifecycle vocabulary.
- `.narada` audit/ledger evidence.

Acceptance:
- Status model names and separates Site authority, MCP process, carrier/session, runtime registry, restart request, verification, and capability lifecycle.
- Fixtures prove `stale` and `live_verified` status without mutating processes.
- Restart request is represented as a request/evidence object, not executed.
- The implementation refuses/omits process kill, self-restart, native shell fallback, and direct process mutation.
- Next live restart/rebind work remains a separate admitted carrier/supervisor execution task.

Verification:
- Focused tests for stale and verified-live fixtures.
- Typecheck/build for touched package.

Closeout evidence:
- Audit path: `.narada/audit/task-0020-mcp-surface-carrier-supervisor-lifecycle-audit.json`.
- Candidate path: `.narada/admission/candidates/task-0020-mcp-surface-carrier-supervisor-lifecycle-candidate.md`.
- Ledger event appended to `.narada/admission/admission-ledger.jsonl`.
- OSM status reply to `narada-andrey.Kevin`.
