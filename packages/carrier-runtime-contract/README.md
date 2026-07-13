# @narada2/carrier-runtime-contract

Use `operatorSurfaceKindsForRuntimeHost()` when a consumer needs the
projections sharing a runtime host, or
`operatorSurfaceKindsForProjectionCapability()` when it needs a bounded
projection capability. Do not repeat a carrier list in the consumer.
Materialized session records and process environments preserve the selected
matrix fields as evidence.

Shared runtime launch, MCP runtime, terminal runtime, heartbeat, and session identity contracts for Narada carrier surfaces.

This package owns the launch-slice, carrier-launch-matrix, MCP-runtime, and terminal-runtime JSON contracts. The carrier-launch matrix is the single authority for admitted launch selections, their operator surfaces, semantic carrier implementations, default runtime hosts, tool-fabric adapter kinds, bounded projection capabilities, and static conformance posture consumed by `agent-start`, the carrier conformance report, and acceptance tests. Runtime substrate admission remains defined by `runtime-substrate-kinds.json`; matrix rows are cross-validated against that contract, and launcher consumers use the exported admission list instead of maintaining a second list. `carrier_kind` in the legacy launch result remains the `--carrier` selection alias; `carrier_implementation_kind` is the explicit semantic implementation field. `expected_tools` are bounded sentinel tools, not a complete tool catalog. A row with `expected_tools_scope: none` makes no Narada MCP availability claim. The conformance report may add current launch-registry observations, but must derive its row set and static posture from this matrix.

Standalone PowerShell projections must read `runtime-substrate-kinds.json` through an explicit contract path or `NARADA_RUNTIME_SUBSTRATE_CONTRACT_PATH`, and must read `carrier-launch-matrix.json` through an explicit launch-matrix path or `NARADA_CARRIER_LAUNCH_MATRIX_CONTRACT_PATH`. `NARADA_PROPER_ROOT` is an accepted launcher-provided fallback for both canonical contracts. A projection must refuse when either contract is absent, malformed, schema-incompatible, or empty; it must not embed a second admitted-runtime or carrier-selection list. When a runtime substrate maps to multiple matrix rows, the projection must require an explicit `launch_selection_kind` rather than infer a carrier.

Carrier adapter entrypoints have the same fail-closed boundary: every launch selection must resolve to a canonical matrix row before adapter metadata, executable commands, or spawn arguments are produced. An unknown selection is refused as `carrier_launch_matrix_row_missing:<selection>`; it must never receive an ambient or substrate-native fallback contract.

`defaultRuntimeForCarrier()` is matrix-backed as well: it derives the row's
runtime substrate and refuses unknown launch selections instead of returning
an unadmitted runtime name.
