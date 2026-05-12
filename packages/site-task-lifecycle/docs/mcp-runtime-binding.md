# MCP Runtime Binding

This package can describe an MCP runtime binding request for Narada proper, but it does not perform live registration.

The binding is descriptor/request/result oriented:

- tools expose package-local planning and projection surfaces;
- task DB writes are adapter-bound;
- SQLite dependency ownership stays outside `@narada2/site-task-lifecycle`;
- SQLite mutation stays outside this package;
- live MCP registration requires a separate Narada proper authority admission.

## Authority Checks

`buildMcpRuntimeBindingRequest` requires a Narada proper authority basis:

- `siteId` is `narada-proper`;
- task surface begins with `narada-proper.task-`;
- carrier begins with `narada-proper.carrier.`;
- admitting identity is neutral;
- live registration is not admitted in this package surface;
- adapter boundary remains `adapter_interface_only`.

The request refuses source Site DBs, task or inbox history, rosters, checkpoints, operator-surface state, PC-locus state, secrets, and identity-specific source state.

## Result

`buildMcpRuntimeBindingResult` records that the descriptor is ready for an admitted runtime surface. It does not claim that live registration, SQLite mutation, or receiving-Site DB writes occurred.
