# Carrier Runtime Contract Extraction

Temporary migration note for extracting duplicated carrier/runtime semantics from `agent-cli`, `agent-tui`, and Codex-as-carrier into shared Narada packages.

The target architecture is described in `../carrier-runtime-contract.md`.

## Current Split To Resolve

1. Carrier protocol exists as shared JS plus local Rust equivalent.
2. MCP fabric projection exists as shared JS plus local Rust equivalent.
3. Provider admission and provider metadata are separate.
4. Codex tool-call envelope handling is separate.
5. Tool admission and payload sensitivity are separate.
6. Input/control queue semantics are separate.
7. Session persistence and transcript projection are separate.
8. Command semantics are separate.
9. Runtime launch and heartbeat contracts are separate or loosely coordinated.

## Extraction Targets

Existing packages:

1. `packages/carrier-protocol`
2. `packages/mcp-fabric`
3. `packages/carrier-action-admission`

Likely new packages:

1. `packages/carrier-runtime-contract`
2. `packages/carrier-provider-contract`
3. `packages/carrier-command-contract`

## Migration Order

1. Stabilize shared fixtures for carrier protocol, session events, payload refs, and reader-tool behavior.
2. Move or verify MCP fabric projection and tool visibility against shared fixtures.
3. Centralize tool admission, action classification, argument summaries, and payload sensitivity rules.
4. Extract provider/carrier admission metadata, env var names, model defaults, and thinking settings.
5. Define the Codex/Narada tool-call envelope as a shared contract with parser fixtures.
6. Extract runtime launch, heartbeat, session identity, and carrier path schemas.
7. Extract command vocabulary and command effect schemas.
8. Replace local semantic copies in `agent-tui` with generated or fixture-verified Rust bindings.
9. Keep only presentation and adapter mechanics inside each carrier surface.

## Acceptance Checks

1. `agent-cli`, `agent-tui`, and Codex-as-carrier consume the same fixtures for shared semantics.
2. Cross-surface tests prove identical decisions for protocol parsing, MCP visibility, tool admission, payload refs, provider admission, commands, and runtime identity.
3. Surface-specific tests remain focused on rendering, terminal input, process mechanics, and adapter transport.
4. No surface-local module is the only source of truth for a carrier/runtime rule.

## Deletion Rule

After a contract has moved into a shared package, the old surface-local implementation should either be deleted or reduced to a thin adapter around the shared contract. Keeping both as active semantic implementations preserves the drift risk.
