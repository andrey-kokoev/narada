# Carrier Runtime Contract

This document defines the durable target architecture for Narada carrier/runtime contracts.

## Problem

Narada currently has multiple carrier-facing implementations: `agent-cli`, `agent-tui`, and Codex-as-carrier. They should differ in presentation and adapter mechanics, but not in the meaning of a session, command, tool, payload, authority decision, or runtime state.

When those semantics live inside each surface, behavior drifts. One carrier may admit a tool while another hides it; one may serialize a payload ref differently; one may treat a provider or command as available while another rejects it. Those are runtime contract failures, not UI differences.

## Target

Narada should have one shared carrier runtime contract consumed by all admitted carriers and carrier surfaces.

The shared contract defines:

1. Carrier protocol and session event schema
2. Input/control JSONL schema
3. Payload refs and reader-tool semantics
4. MCP fabric projection and tool visibility
5. Tool admission and action classification
6. Provider/carrier admission and environment contract
7. Tool-call envelope format
8. Runtime launch, heartbeat, session identity, and carrier paths
9. Transcript/session persistence rules
10. Command vocabulary and command semantic effects

## Ownership Boundary

Shared packages own runtime meaning and policy.

Carrier surfaces own presentation and transport details.

`agent-cli` owns line-oriented terminal presentation, stdin/stdout behavior, and CLI formatting.

`agent-tui` owns Ratatui layout, panes, composer behavior, keybindings, and visual transcript rendering.

Codex-as-carrier owns Codex-specific process/API adaptation and stream parsing.

No surface should independently define carrier authority, MCP visibility, provider admission, payload ref semantics, command effects, session protocol, or runtime identity.

## Contract Invariants

A carrier is compatible only if these invariants hold:

1. The same input/control/session fixture parses to the same semantic event in every carrier.
2. The same MCP fabric configuration exposes the same visible tools in every carrier.
3. The same tool request receives the same admission decision in every carrier.
4. The same payload size/sensitivity decision produces the same inline/ref behavior in every carrier.
5. The same provider/carrier configuration resolves to the same admitted or refused state in every carrier.
6. The same command text resolves to the same command effect in every carrier.
7. The same launch/session identity data produces the same heartbeat and session metadata in every carrier.

## Package Shape

Existing shared packages should remain the first home for their domains:

1. `packages/carrier-protocol`
2. `packages/mcp-fabric`
3. `packages/carrier-action-admission`

New packages should be introduced only where the existing package boundary would become confused:

1. `packages/carrier-runtime-contract`
2. `packages/carrier-provider-contract`
3. `packages/carrier-command-contract`

The shared packages should expose JSON schemas, golden fixtures, and JS APIs. Rust consumers should use generated or fixture-verified bindings rather than local semantic copies.

## Non-Goals

This is not a plan to make `agent-tui` call `agent-cli`.

This is not a plan to force every carrier to share UI code.

This is not a plan to hide provider-specific adapters. Provider adapters may remain surface-specific where process/API mechanics differ, but their contracts and fixture behavior must be shared.
