# Agent Identity Rendering Hardening

This inventory exists to prevent the launcher/NARS/operator-surface stack from splitting identity display between raw protocol `agent_id` and canonical operator-facing identity.

## Invariant

Raw `agent_id` remains a compatibility/storage/protocol field. Operator-facing display, grouping, attach ambiguity, session listing, launch preambles, health text, and terminal/browser projections must prefer `agent_identity_ref.display` or `agent_identity_ref.canonical_agent_id` when available.

For Site-local records such as Sonar, this means the protocol field may stay `resident`, while the operator sees `sonar.resident`.

## Site Identity Target State

Each Site must choose and preserve one launch/admission identity shape for active runtime inputs. The current Site-scoped NARS launcher target is:

- Workspace registry entries may use a Site-local `Agent` such as `resident` when the record also carries `Site` and `Role`.
- Runtime environment and admission surfaces use the launch identity exactly as `NARADA_AGENT_ID`; for Site-local records this is the local id, for example `resident`.
- `agent_identity_ref` carries the display/canonical projection as the structured v2 shape, for example `identity_scope.site_id = sonar`, `canonical_agent_id = sonar.resident`, and `local_agent_id = resident`.
- Operator-facing projections may render `sonar.resident`, but launch commands, env probes, live roster rows, resident loop config, and executable examples must use the active launch/admission identity shape.

The target state is intentionally not "prefix everything". `canonical_agent_id` is a projection/display key unless a specific Site's live roster and launcher registry explicitly use prefixed ids as the active launch identity. Do not repair a local-id Site by putting `sonar.resident` into runtime env probes or executable commands.

The symmetric mistake is also invalid: do not repair a prefixed Site by stripping prefixes from active launch/admission fields. A Site such as `smart-scheduling` may legitimately use `smart-scheduling.resident` as the launch identity when the workspace registry and live roster both use that prefixed value. The hardening invariant is agreement on the Site's chosen active identity shape, not a universal preference for local or prefixed ids.

Longer-term migrations from legacy scalar identities to structured identity refs should follow [Versioned Shape Resolver](versioned-shape-resolver.md): leave historical `agent_id` records immutable, lift them at read boundaries with explicit context and provenance, and require new writes to use the current structured schema after the migration gate.

### Identity Loci

| Locus | Target value for Site-local `resident` | Authority posture |
| --- | --- | --- |
| Workspace launcher registry `Agent` | `resident` with `Site = sonar`, `Role = resident` | Launch selection input. |
| `NARADA_AGENT_ID` | `resident` | Runtime/admission identity input. |
| Task lifecycle SQL `agent_roster.agent_id` | `resident` | Live Site admission authority when the Site uses SQL roster. |
| Site-local JSON roster/projection | `resident`, unless documented as canonical-display-only | Projection/config must match the Site's chosen active identity shape. |
| Resident loop launch/probe strings | `resident`, `NARADA_AGENT_ID=resident` | Active launch/probe inputs. |
| Runtime host selector | `narada-agent-runtime-server` | `nars` is a compatibility alias and must not appear in new active Site config or executable examples. |
| `agent_identity_ref.canonical_agent_id` | `sonar.resident` | Display/grouping/session-discovery projection. |
| Schema/type ids | `narada.sonar.resident_*.v1` may remain | Namespace strings, not runtime identity inputs. |

## Site Identity Repair SOP

Use this SOP when a Site reports `identity_not_in_roster`, carrier admission missing for a role, stale `sonar.<role>` launch commands, or mixed local/canonical identity rendering.

1. Identify the active launch record from the saved workspace launch result or registry entry. Record `Agent`, `Site`, `Role`, `operator_surface_kind`, `runtime_host_kind`, `authority`, and `intelligence_provider`.
2. Determine the active launch/admission identity. For Site-local records with `Agent = resident` and `Site = sonar`, the active identity is `resident`; `agent_identity_ref.canonical_agent_id = sonar.resident` is not by itself an admission identity.
3. Inspect the live roster authority before editing projections. If the Site uses SQL task lifecycle roster, verify `.ai/task-lifecycle.db::agent_roster` contains the active identity and role. If the Site uses JSON roster as authority, verify that JSON directly.
   Common SQL and JSON roster loci include `.ai/task-lifecycle.db`, `.narada/.ai/task-lifecycle.db`, `.narada/agents/roster.json`, and `.narada/.ai/agents/roster.json`.
   For SQL-backed Sites with JSON roster projections, compare every registered Site agent across `agent_id`, `role`, `status`, and normalized capability set; resident-only checks miss architect/builder drift.
4. Normalize Site-local projection/config files to the active identity shape. Check `.narada/agents/roster.json`, `.narada/capabilities/site-loop-config.json`, Site loop config, scheduler/supervisor commands, launch probes, and executable docs.
   When correcting a live SQL roster, add an `agent_roster_events` audit row when that table exists.
5. Replace active runtime selectors with `narada-agent-runtime-server`. Do not leave `-Runtime nars`, `"runtime": "nars"`, or `"preferred_runtime": "nars"` in active config or executable examples.
6. Leave schema/type identifiers alone unless they are being used as launch inputs. Strings such as `narada.sonar.resident_mailbox_proof.v1` are namespaces, not agent ids.
7. Run a targeted anti-regression search for active bad forms: `agent_id.*sonar.resident`, `NARADA_AGENT_ID=sonar.resident`, `-Agent sonar.resident`, `--agent sonar.resident`, `Runtime nars`, `"runtime": "nars"`, and non-canonical runtime aliases such as `"fallback_runtime": "agent-runtime-server"`.
8. Verify the launch dry-run or saved launch result shows the intended raw `Agent`, derived `agent_identity_ref`, `--authority auto` or intended authority, and `narada-agent-runtime-server` runtime host.
9. If the running NARS session predated the fix, restart or relaunch it; runtime admission state may have been read at startup.

The SOP is complete only when the live authority and every active projection agree on the launch/admission identity shape. A JSON projection-only edit is not sufficient when the Site's live admission path reads SQL; completion for SQL-backed Sites requires row-for-row JSON-vs-SQL equivalence for all registered Site agents.

## Canonical Helper

| Place | Responsibility | Hardening posture |
| --- | --- | --- |
| `packages/agent-identity/src/index.mjs` | Derive, normalize, match, group, display, and resolve identity refs. | Authoritative helper package for maintained runtime/projection code. Owns the v1 projection helper and the v2 structured resolver contract. |
| `packages/agent-identity/src/index.test.mjs` | Prove prefixed and Site-local derivation. | Must include Site-local `resident` plus explicit `sonar` fixture. |

`AgentIdentityRefV2` is the target authority-bearing shape for new writes: `identity_scope`, `local_agent_id`, `role`, `canonical_agent_id`, optional `legacy_agent_id`, and resolver provenance. Historical scalar `agent_id` values should be lifted with `resolveAgentIdentityRef(input, context)` instead of rewritten in place.

## Launch Materialization

| Place | Responsibility | Hardening posture |
| --- | --- | --- |
| `packages/layers/cli/src/commands/launcher.ts` | Workspace registry selection and launch planning. | Build `agent_identity_ref` from registry `Agent`, `Role`, and `Site`; do not infer display in Windows title or argv alone. |
| `packages/agent-start/src/narada-agent-start.ts` | Start-event and launch-result materialization. | Emit `AgentIdentityRefV2` in launch results, and pass it to carrier process launch/wait prompt. |
| `packages/agent-start/src/carrier-process-launch.ts` | Wait-before-exec prompt handoff. | Forward `agentIdentityRef` to renderer; raw `agentId` remains fallback only. |
| `packages/agent-start-renderer/src/agent-start-renderer.mjs` | Human launch preamble and wait prompt. | Render `identity:` and wait prompt from identity ref; show `local_agent_id` separately when different. |
| `packages/agent-start/bin/verify-registered-site-launchers.mjs` | Registered launcher fleet verifier. | Compare expected and actual `agent_identity_ref` for every registered launch record. |

## Runtime Emission And Session Index

| Place | Responsibility | Hardening posture |
| --- | --- | --- |
| `packages/agent-runtime-server/src/runtime-context.mjs` | Runtime context creation. | Build identity ref from launch identity, role, and resolved Site id. |
| `packages/agent-runtime-server/src/runtime-server-events.mjs` | NARS session events and heartbeats. | Emit `agent_identity_ref` on session and wrapper events while preserving raw `agent_id`. |
| `packages/nars-session-core/src/session-index.mjs` | Session-index record/read model. | Persist structured identity refs; derive them from session_started when absent. |
| `packages/agent-runtime-server/src/runtime-server-events.mjs` | Runtime wrapper event projection. | Preserve identity ref and use it for host-status display labels. |

## Operator Projections

| Place | Responsibility | Hardening posture |
| --- | --- | --- |
| `packages/carrier-terminal-projection/src/terminal-event-rendering.mjs` | `agent-cli` terminal projection. | Display and filter with identity ref; raw `agent_id` fallback only. |
| `packages/nars-client-projection-contract/src/nars-client-projection-contract.mjs` | Shared client projection contract. | Session summaries and render keys use identity ref before raw `agent_id`. |
| `packages/agent-web-ui/src/domain/events.ts` | Browser event identity normalization. | Extract Site, agent, role, and session identity from canonical event and health fields before scalar fallbacks. |
| `packages/agent-web-ui/src/domain/session-store.ts` | Browser session identity retention. | Keep one normalized identity projection across replay, live events, and paged history. |
| `packages/agent-web-ui/src/session/activity.ts` | Browser activity labels. | Display normalized agent identity where health/activity events carry it. |
| `packages/agent-web-ui/src/features/status/StatusBar.vue` | Browser identity and health display. | Render Site, agent, role, session, and health from the normalized session snapshot. |

## Task Lifecycle Writes

| Place | Responsibility | Hardening posture |
| --- | --- | --- |
| `packages/layers/cli/src/commands/task-review-request.ts` | Review-request obligation creation. | Persist `source_agent_identity_ref` in the durable payload alongside `source_agent_id`; keep the scalar for compatibility only. |
| `packages/task-lifecycle-tools/src/task-obligations.mjs` | Manual obligation create/route maintenance. | Persist and surface `source_agent_identity_ref` so future task-lifecycle writes do not depend on raw scalar identity alone. |

## Task Lifecycle Read Models

| Place | Responsibility | Hardening posture |
| --- | --- | --- |
| `packages/layers/cli/src/commands/task-next.ts` | Next-task packet selection. | Surface `source_agent_identity_ref` alongside the scalar source id in directed-obligation packets. |
| `packages/layers/cli/src/commands/task-workboard.ts` | Workboard review-obligation summary. | Include `source_agent_identity_ref` so review obligations render canonical identity without guessing from the scalar. |
| `packages/layers/cli/src/commands/work-next.ts` | Unified next-action surface. | Include `source_agent_identity_ref` in directed-obligation packets for the same reason. |

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