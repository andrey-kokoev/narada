# Agent Identity Rendering Hardening

This inventory exists to prevent the launcher/NARS/operator-surface stack from splitting identity display between raw protocol `agent_id` and canonical operator-facing identity.

## Invariant

Raw `agent_id` remains a compatibility/storage/protocol field. Operator-facing display, grouping, attach ambiguity, session listing, launch preambles, health text, and terminal/browser projections must prefer `agent_identity_ref.display` or `agent_identity_ref.canonical_agent_id` when available.

For Site-local records such as Sonar, this means the protocol field may stay `resident`, while the operator sees `sonar.resident`.

## Canonical Helper

| Place | Responsibility | Hardening posture |
| --- | --- | --- |
| `packages/agent-identity/src/index.mjs` | Derive, normalize, match, group, and display identity refs. | Authoritative helper package for maintained runtime/projection code. |
| `packages/agent-identity/src/index.test.mjs` | Prove prefixed and Site-local derivation. | Must include Site-local `resident` plus explicit `sonar` fixture. |

## Launch Materialization

| Place | Responsibility | Hardening posture |
| --- | --- | --- |
| `packages/layers/cli/src/commands/launcher.ts` | Workspace registry selection and launch planning. | Build `agent_identity_ref` from registry `Agent`, `Role`, and `Site`; do not infer display in Windows title or argv alone. |
| `packages/agent-start/src/narada-agent-start.ts` | Start-event and launch-result materialization. | Include `agent_identity_ref` in launch result and pass it to carrier process launch/wait prompt. |
| `packages/agent-start/src/carrier-process-launch.ts` | Wait-before-exec prompt handoff. | Forward `agentIdentityRef` to renderer; raw `agentId` remains fallback only. |
| `packages/agent-start-renderer/src/agent-start-renderer.mjs` | Human launch preamble and wait prompt. | Render `identity:` and wait prompt from identity ref; show `local_agent_id` separately when different. |
| `packages/agent-start/bin/verify-registered-site-launchers.mjs` | Registered launcher fleet verifier. | Compare expected and actual `agent_identity_ref` for every registered launch record. |

## Runtime Emission And Session Index

| Place | Responsibility | Hardening posture |
| --- | --- | --- |
| `packages/carrier-runtime/src/carrier-runtime-context.mjs` | Runtime context creation. | Build identity ref from launch identity, role, and resolved Site id. |
| `packages/carrier-runtime/src/server-mode.mjs` | NARS session events and heartbeats. | Emit `agent_identity_ref` on session and wrapper events while preserving raw `agent_id`. |
| `packages/carrier-runtime/src/nars-session-index.mjs` | Session-index record/read model. | Persist normalized identity ref; derive it from session_started when absent. |
| `packages/agent-runtime-server/src/runtime-server-events.mjs` | Runtime wrapper event projection. | Preserve identity ref and use it for host-status display labels. |

## Operator Projections

| Place | Responsibility | Hardening posture |
| --- | --- | --- |
| `packages/carrier-terminal-projection/src/terminal-event-rendering.mjs` | `agent-cli` terminal projection. | Display and filter with identity ref; raw `agent_id` fallback only. |
| `packages/nars-client-projection-contract/src/nars-client-projection-contract.mjs` | Shared client projection contract. | Session summaries and render keys use identity ref before raw `agent_id`. |
| `packages/agent-web-ui/src/session-identity.js` | Browser session title derivation. | Extract identity ref from events, whoami, and nested payloads. |
| `packages/agent-web-ui/src/session-projection.js` | Browser conversation grouping. | Group by identity ref key to avoid collapsing same-role agents across Sites. |
| `packages/agent-web-ui/src/session-projection-activity.js` | Browser activity labels. | Display canonical identity where health/activity events carry refs. |
| `packages/agent-web-ui/src/health.js` | Direct browser health text. | Render health identity via identity ref when the health endpoint supplies it. |

## Attach And Discovery CLI

| Place | Responsibility | Hardening posture |
| --- | --- | --- |
| `packages/layers/cli/src/commands/nars.ts` | `narada nars sessions` read model and human table. | Preserve `agent_identity_ref` in command-session JSON and table display. |
| `packages/layers/cli/src/commands/agent-web-ui.ts` | Direct browser projection attach/discovery. | Match sessions using identity ref, distinguish ambiguity by identity group key, and format refusal candidates canonically. |
| `packages/layers/cli/src/commands/agent-web-ui-register.ts` | CLI wrapper output for attach command. | Should not introduce raw-agent display beyond structured fields returned by attach. |

## Context And Startup Surfaces

| Place | Responsibility | Hardening posture |
| --- | --- | --- |
| `packages/agent-context-tools/src/agent-context-mcp-server.mjs` | Startup/whoami/checkpoint context. | Include identity ref in context responses so clients can render canonical identity even when env `NARADA_AGENT_ID` is local. |
| `C:/Users/Andrey/Narada/config/launch/agents.psd1` | User Site launch registry. | Records may use prefixed ids or Site-local role ids, but Site-local ids must carry `Site` and `Role` so the launcher derives canonical refs. |

## Verification Gates

| Gate | Evidence |
| --- | --- |
| Focused helper and duplicate-rendering guards | `pnpm --filter @narada2/agent-identity test`; includes recursive source gates that allow `agentIdentityDisplay` only in `@narada2/agent-identity` and reject local identity-ref display fallback chains outside that package. |
| Launch-result rendering tests | `pnpm --filter @narada2/agent-start-renderer test` |
| Agent-start transform/syntax gate | `pnpm --filter @narada2/agent-start run syntaxcheck`; proves the TSX-loaded launcher entrypoint and verifier bin are syntactically loadable. |
| Agent-start option/registry tests | `pnpm --filter @narada2/agent-start test`; includes the transform/syntax gate plus dry-run, provider, registry, and option-contract shards. |
| Terminal projection tests | `pnpm --filter @narada2/carrier-terminal-projection test` |
| Shared client projection contract tests | `pnpm --filter @narada2/nars-client-projection-contract test`; proves shared NARS event summaries use canonical identity refs. |
| Browser projection tests | `pnpm --filter @narada2/agent-web-ui test` |
| Runtime wrapper tests | `pnpm --filter @narada2/agent-runtime-server test` |
| Context startup/whoami MCP tests | `pnpm --filter @narada2/agent-context-tools test`; proves default startup summary and whoami both expose canonical `agent_identity_ref`. |
| CLI attach/session tests | `node scripts/run-vitest-quiet.mjs run --silent test/commands/nars.test.ts` from `packages/layers/cli` |
| Registered fleet dry-run | `node D:/code/narada/packages/agent-start/bin/verify-registered-site-launchers.mjs --registry C:/Users/Andrey/Narada/config/launch/agents.psd1 --start-agent C:/Users/Andrey/Narada/Start-NaradaAgent.ps1 --runtime-policy default-only --jobs 4 --progress` |

## Anti-Regression Search

When this invariant is touched, search maintained source for raw display leaks:

```text
agent_id
agentId
identity:
resident
sonar.resident
agent_identity_ref
canonical_agent_id
```

Classify every match as storage/protocol, authority, matching, or rendering. Rendering matches must either call an identity-ref helper or explicitly document why raw identity is the intended displayed object.
