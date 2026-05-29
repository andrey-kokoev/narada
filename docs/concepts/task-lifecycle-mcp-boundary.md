# Task Lifecycle MCP Boundary

Task lifecycle MCP tools expose governed task mutation and readback. They are not a generic prose channel.

## Tool Intent

- `task_lifecycle_prove_criteria`: criteria proof only. It does not accept summaries or report prose.
- `task_lifecycle_submit_report` / `task_lifecycle_finish`: lifecycle report evidence, including `changed_files` or `no_files_changed`.
- `task_lifecycle_disposition_closeout`: bounded inbox-disposition closeout that may write task notes, prove criteria, and finish when requested.
- `mcp_payload_create`: byte transport for long argument objects, not lifecycle authority.

## Shared Contract

The canonical task lifecycle MCP tool contract belongs in `@narada2/task-governance/task-lifecycle-mcp-contract` in Narada proper:

- tool aliases
- domain tool names
- JSON schema shapes
- long-payload recovery fields
- task report and directive linkage fields
- conformance tests

The contract is not a task store, transport store, or Site policy surface. It owns the domain-facing MCP shape that must be identical across Sites, so an agent does not have to learn different argument aliases or report fields per Site. It may advertise `payload_ref` fields where domain tools accept long-argument recovery, but payload bytes and output-ref storage remain transport-owned.

`@narada2/mcp-transport` owns byte transport and output-ref helpers such as `mcp_payload_create` and `mcp_output_show`.

`@narada2/task-lifecycle-kernel` is retained only for older boundary helpers during migration. New shared task lifecycle domain contract work goes into `@narada2/task-governance`.

## Site Adapter

Site-local behavior remains local:

- task store location
- roster projection
- review routing
- inbox coupling
- site authority/admission gates
- customer-visible effect policy

Site adapters import the shared contract and append local transport tools at the edge. They must not move Site authority into the package. A Site adapter decides whether a task can be claimed, reported, reviewed, closed, or linked to inbox state. The shared package only defines the common call contract and domain service logic.

For stdio MCP, Site adapters launch `@narada2/task-governance/task-lifecycle-mcp-server`. Site-local `tools/task-lifecycle/task-mcp-server.mjs` files are launch adapters only. They must not contain lifecycle dispatch switches, local validation engines, review routing, closeout transitions, recurrence transitions, or task lifecycle write rules.

## Package Provenance

Shared package use must be explicit at each Site. A local junction, workspace link, or package manager entry is not enough evidence by itself.

`narada sites deps sync --root <site> --apply` records package provenance at:

```text
<site>/.ai/runtime/package-provenance.json
```

The provenance record names each shared package, its Narada proper source locus, install path, and link mode. Current shared packages are:

- `@narada2/agent-cli`
- `@narada2/mcp-transport`
- `@narada2/task-lifecycle-kernel`
- `@narada2/task-governance`

This keeps distribution mechanics separate from Site policy. The package source remains Narada proper; the Site records that it admits the package through a workspace link.

Narada proper itself does not use this command for its own dependencies. Its package links are pnpm workspace links, so `sites deps sync` refuses the Narada proper workspace root instead of replacing package-manager state with Site-local junctions. For client/project Sites, link replacement is bounded to the exact `<site>/node_modules/@narada2/<package>` path before any recursive removal is allowed.

## Agent Recovery

Recoverable tool failures must provide a mechanical next step when possible. For long inline fields, the next step is:

1. Call `mcp_payload_create` with the complete intended argument object under `payload`.
2. Retry the original tool with `payload_ref`.

Agents should not print JSON as prose when a tool call is required.

## Extraction Inventory

The extraction is governed by classification, not by copying one Site as canonical.

- Preserve: task lifecycle store schema, report/review/close services, assignment lifecycle, evidence admission, task search, task spec parsing, recurrence definitions, and MCP domain tool schemas.
- Adapter: Site root resolution, process launch, stdio wiring, MCP payload/output byte stores, runtime freshness markers, roster projection from local Site files, inbox envelope indexing, and customer-visible effect policy.
- Repair: stale vendored packages, Site-local copies of MCP dispatch logic, raw package runtime imports, long-payload failure recovery that leaves the agent without a valid next action, and opaque output references without a working reader argument shape.

The package may provide reusable runtime helpers for adapter use, but only through named exports such as `@narada2/task-governance/task-lifecycle-runtime/unified-workboard`. It must not expose a wildcard path into `runtime/task-lifecycle`.

## Runtime Entry Point

The shared MCP server runtime must be importable without starting stdin processing or opening a Site task store. Importing the module exposes functions; launching the module as the process entry point starts stdio.

Required exported functions:

- `configureTaskLifecycleMcpRuntime`: binds a Site root, environment, and streams to one runtime instance.
- `runTaskLifecycleMcpStdioServer`: runs the stdio MCP loop after explicit configuration.
- `handleTaskLifecycleMcpRequest`: handles one JSON-RPC request for tests and controlled adapters.

This keeps packaging separate from execution. A Site adapter can import the runtime for tests, but only process launch creates a live MCP server.
