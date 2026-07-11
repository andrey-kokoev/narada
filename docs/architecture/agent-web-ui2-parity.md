# Agent Web UI2 Parity Matrix

## Purpose

This is the completion matrix for replacing `packages/agent-web-ui` with
`packages/agent-web-ui2`. A green package build or a matching route is not
parity. Each row requires equivalent operator behavior, one owner in UI2, and
verification through the real browser/host/NARS boundary where applicable.

## Core Attachment And Session State

| Production behavior | UI2 owner | Status | Required evidence |
| --- | --- | --- | --- |
| Local WebSocket attachment, reconnect, replay cursor | `transport/session-transport.ts` | implemented | transport reconnect test and `test/e2e/transport-projection.spec.mjs` |
| Cloudflare attachment, replay, input, browser token | `transport/cloudflare-session-transport.ts` | implemented | real-browser replay/input journey, three-run repeat check, shared endpoint contract, and hosted asset path |
| Health polling, identity, active turn, bounded retention | `session/*` | implemented | session and host tests |
| Conversation, Operations, Diagnostics, Raw from one retained store | `session/projections.ts` | implemented | projection unit and browser view-switch E2E |
| Streaming normalization without duplicate final assistant messages | session projection | implemented | projection test and `test/e2e/transport-projection.spec.mjs` |
| Activity lifecycle and elapsed/tool progress | `session/activity.ts` | implemented | projection unit and fixture NARS browser E2E |

## Operator Controls

| Production behavior | UI2 owner | Status | Required evidence |
| --- | --- | --- | --- |
| Send, steer, enqueue, clear, focus | `features/operator` | implemented | controller and browser E2E |
| Scroll authority and unseen-message affordance | `ConversationView.vue` | implemented | browser scroll E2E |
| Slash palette from shared registry | `OperatorComposer.vue` | implemented | shared contract unit coverage and keyboard/browser E2E |
| Generated `/help`, unknown-command validation | projection contract | implemented | operator-controller unit and browser E2E |
| Double-Escape interrupt confirmation | `OperatorComposer.vue` | implemented | browser E2E |
| Queue review, edit, remove, steer-now | `operator-queue.ts` | implemented | controller and browser E2E |
| Composer history | `operator-history.ts`, `OperatorComposer.vue` | implemented | history unit and browser E2E |
| Snippet CRUD, run, queue, fill, import/export, undo | `operator-snippets.ts`, `OperatorSnippetPanel.vue` | implemented | controller unit and browser E2E |
| Snippet slash command integration and palette search | `OperatorComposer.vue`, operator feature controller | implemented | browser E2E |

## Content And Artifacts

| Production behavior | UI2 owner | Status | Required evidence |
| --- | --- | --- | --- |
| Markdown, tables, code, JSON, Mermaid | `content/*` | implemented | parser unit and browser rendering E2E |
| Intent references stage operator input | `MessageContent.vue` | implemented | component/browser E2E |
| Artifact metadata, local proxy, Cloudflare token, HTML/audio preview | `ArtifactReferencePart.vue`, host | implemented | host test and real-browser local/Cloudflare HTML/audio journey |
| Artifact-origin operator-input policy and session overrides | post-cutover feature DAG | tracked separately | tasks 1862-1872; this was not behavior in the replaced production package |

## Status And Panels

| Production behavior | UI2 owner | Status | Required evidence |
| --- | --- | --- | --- |
| Header identity, connection, health, intelligence | `StatusBar.vue` | implemented | browser E2E including advertised intelligence actions |
| Site information drawer | `SiteInfoPanel.vue` | implemented | browser E2E |
| Status-row preferences and projection verbosity | `features/status/use-status-preferences.ts`, `StatusBar.vue`, shell view controller | implemented | browser E2E verifies selector/tab synchronization, qualified persistence, and reload hydration |
| MCP inventory and per-surface tool list | `session/mcp-inventory.ts`, `McpSurfacePanel.vue` | implemented | inventory projection unit and fixture NARS browser E2E |
| SOP summary and run/template drilldown | `SopPanel.vue` | implemented | projection unit and fixture NARS browser E2E including template/run metadata, steps, results, and advertised actions |
| Artifact summary panel | `ArtifactsPanel.vue` | implemented | fixture NARS browser E2E including bounded index, aggregate counts, metadata, diagnostics copy, and content-link affordance |
| Delegation summary and worker/task drilldown | `DelegationPanel.vue` | implemented | projection test and `test/e2e/transport-projection.spec.mjs` |
| Git summary and worktree drilldown | `GitPanel.vue` | implemented | projection test and `test/e2e/transport-projection.spec.mjs` |
| Inbox summary and envelope drilldown | `InboxPanel.vue` | implemented | projection test and `test/e2e/transport-projection.spec.mjs` |
| Synced Email summary, accounts, messages, and drilldown | `MailboxPanel.vue` | implemented | projection test and `test/e2e/transport-projection.spec.mjs` |
| Scheduler posture and task drilldown | `SchedulerPanel.vue` | implemented | projection test and `test/e2e/transport-projection.spec.mjs` |
| Task lifecycle recommendation and governed collections | `TaskLifecyclePanel.vue` | implemented | projection test and `test/e2e/transport-projection.spec.mjs` |
| Surface feedback backlog and candidate-only lifecycle context | `SurfaceFeedbackPanel.vue` | implemented | projection test and `test/e2e/transport-projection.spec.mjs` |
| Runtime topology, Cloudflare projection controls, authority transitions | panel/status features | implemented | local topology projection, input-admission coverage, host publication contract, and browser controls |
| Generic MCP-advertised UI affordances | `surface-affordances.ts`, `GenericAffordancePanel.vue` | implemented | affordance projection unit and MCP metadata fixture E2E |

## Browser Product Behavior

| Production behavior | UI2 owner | Status | Required evidence |
| --- | --- | --- | --- |
| First/second/footer box visibility and qualified localStorage preferences | `features/preferences/*`, shell/status/composer owners | implemented | browser E2E verifies all three selectors, qualified persistence, and reload hydration |
| Tooltips, copyable session fields, favicon hierarchy | shell/status/preferences | implemented | browser E2E verifies collision-aware tooltip, separate agent/session copying, default/site/agent/tab precedence, and runtime NARS health updates |
| Reactive initial view, retained event paging, and scalable offscreen rendering | conversation feature | implemented | persisted initial view, NARS `session.events.read`, bounded store, scroll-anchor preservation, and browser-native `content-visibility` deferral |
| Local and Cloudflare host launch/attach UX | host and CLI adapters | implemented | CLI imports UI2 server; local host and Cloudflare publication contract tests |

## Exit Criteria

UI2 may replace the production package only when every row is `implemented`, its
required evidence is current, `dist/` remains ignored, and a final comparison
finds no production-only protocol path, user control, panel, or persistence
behavior.

## Cutover Verification

Production ownership transferred to `@narada2/agent-web-ui2` on 2026-07-10.
The current acceptance sweep records:

- 55 package unit tests passing;
- five real-browser transport journeys passing: durable
  `session.events.read` paging, local/Cloudflare HTML and audio artifacts,
  responsive transcript/markdown/command behavior, Cloudflare replay/input,
  and local NARS WebSocket projection/input;
- one opt-in live speech journey passing through the real speech MCP process,
  NARS artifact HTTP, and browser audio playback;
- UI2 typecheck passing and a production build completing successfully;
- all 15 focused CLI attach tests passing;
- successful CLI production build;
- launcher acceptance passing for both direct NARS launch journeys: the
  agent-cli plus agent-web-ui sibling projection and agent-web-ui as the
  primary NARS launch carrier; the three browser selector cases remain
  explicitly opt-in and were skipped by their host-sensitive gate;
- User Site MCP registry materialization now includes authoritative
  `runtime_binding`, `surface_type`, and `evidence` projections, and carrier
  generation completes with `--write --check` from that registry; the User
  Site registry validator also passes;
- a non-mutating real `narada launcher workspace-plan` for
  `sonar.resident` resolving NARS plus the exact agent-web-ui launch binding;
- the canonical `narada-agent-web-ui` binary resolving to UI2; and
- no production import, deploy asset path, contributor instruction, or concept
  registry record resolving to the predecessor package.

The build currently emits non-failing Rolldown warnings for third-party
`@vueuse/core` pure annotations and large Mermaid-related chunks. They do not
change the acceptance result, but remain build-hygiene follow-up items.

`packages/agent-web-ui` remains only as an explicitly non-admitted migration
predecessor. It owns no production capability and publishes no executable.
