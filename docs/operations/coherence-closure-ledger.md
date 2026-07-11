# Coherence Closure Ledger

## Scope

This ledger records the launcher/NARS/web-projection inventory for the current Narada launcher slice. It is intentionally factual and conservative: open items stay open until the relevant source, test, and runtime evidence exists.

Each row names the main invariant, the owning files, the best current proof, the remaining gap, and a concrete next verification command or file path.

## Inventory

### 1813. Reviewed clean checkpoint

- State: open; this is the meta-slice that makes the rest of the inventory auditable.
- Owning files: `D:/code/narada` git worktree summary, `D:/code/mcp-surfaces` git worktree summary, `C:/Users/Andrey/Narada/.ai/do-not-open/task-chapters.json`.
- Current evidence: the worktree is still broad and dirty, but the task chapter map and dirty-state summaries are now explicit and grouped.
- Remaining gap: no reviewed thematic commit boundary yet, so future launcher/NARS work still starts from a dirty baseline.
- Next verification: `git_repositories_summary` for `D:/code/narada`, `D:/code/mcp-surfaces`, and `C:/Users/Andrey/Narada`.

### 1814. Carrier terminology

- State: open; terminology is partially migrated but still mixed across launcher docs, runtime docs, and compatibility fields.
- Owning files: `docs/concepts/first-class-narada-runtime-concepts.md`, `docs/operator/agent-start.md`, `Start-NaradaWorkspace.ps1`, `packages/agent-start/src/narada-agent-start.ts`, `packages/layers/cli/src/commands/carrier.ts`.
- Current evidence: the launcher vocabulary now distinguishes `runtime`, `operator surface`, and `NARS` in several docs, and the task chapter already records this as a separate migration slice.
- Remaining gap: compatibility aliases and legacy wording still need a final documented boundary so old and new terms do not drift back together.
- Next verification: search the launcher/docs tree for `carrier`, `runtime_host`, and `NARS` terminology and compare against the compatibility plan in `docs/concepts/first-class-narada-runtime-concepts.md`.

### 1815. Legacy session env vars

- State: open; session env naming still needs a compatibility boundary.
- Owning files: `packages/agent-start/src/narada-agent-start.ts`, `packages/agent-runtime-server/src/server-wrapper.mjs`, `packages/agent-runtime-server/src/runtime-context.mjs`, `Start-NaradaAgent.ps1`.
- Current evidence: the launch path already materializes session and agent identity context through runtime code instead of relying only on ad hoc shell variables.
- Remaining gap: legacy and canonical env var names still need a single, documented compatibility story so launchers do not split on different env sources.
- Next verification: `pnpm --filter @narada2/agent-start test` and `pnpm --filter @narada2/carrier-runtime test`.

### 1816. Agent identity rendering guard

- State: in progress; canonical identity rendering is drafted and the helper package exists.
- Owning files: `docs/concepts/agent-identity-rendering-hardening.md`, `packages/agent-identity/src/index.mjs`, `packages/agent-identity/src/index.test.mjs`, `packages/agent-start-renderer/src/agent-start-renderer.mjs`, `packages/agent-web-ui/src/session-identity.js`, `packages/agent-web-ui/src/session-projection-activity.js`, `packages/agent-web-ui/src/health.js`.
- Current evidence: the draft doc states the raw `agent_id` vs canonical display invariant, and the rendering code has been moved toward `agent_identity_ref`-based display.
- Remaining gap: prove the helper and all renderers actually prevent raw identity from leaking into operator-facing text when canonical identity is available.
- Next verification: `pnpm --filter @narada2/agent-identity test`, `pnpm --filter @narada2/agent-start-renderer test`, `pnpm --filter @narada2/agent-web-ui test`.

### 1817. Layered launch output

- State: in progress; launcher output has been split into structured records, but the user-facing layering still needs to be proven end-to-end.
- Owning files: `packages/agent-start-renderer/src/agent-start-renderer.mjs`, `packages/agent-start/src/carrier-process-launch.ts`, `packages/agent-start/src/narada-agent-start.ts`, `packages/layers/cli/src/commands/launcher.ts`.
- Current evidence: launch result materialization now carries session and identity structure instead of a single flat preamble.
- Remaining gap: verify that the launch text, wait prompt, and result output preserve the intended layering under both CLI and interactive selection flows.
- Next verification: `pnpm --filter @narada2/agent-start-renderer test` and the launcher option/registry tests in `packages/agent-start/test`.

### 1818. Renderable value contract

- State: in progress; renderable values are being normalized across terminal, CLI, and browser projections.
- Owning files: `packages/carrier-terminal-projection/src/terminal-event-rendering.mjs`, `packages/carrier-terminal-projection/src/projected-input.mjs`, `packages/nars-client-projection-contract/src/nars-client-projection-contract.mjs`, `packages/agent-web-ui/src/runtime-events.js`.
- Current evidence: the rendering stack already treats structured message parts and renderable values as first-class inputs instead of plain text blobs.
- Remaining gap: prove that the same value contract is used consistently in the terminal projection, browser projection, and shared client contract.
- Next verification: `pnpm --filter @narada2/carrier-terminal-projection test` and `pnpm --filter @narada2/nars-client-projection-contract test`.

### 1819. Launcher Session Dashboard

- State: in progress; the dashboard doc and implementation draft exist, including repeated launch attempts and persistent session state.
- Owning files: `docs/concepts/launcher-session-dashboard.md`, `packages/layers/cli/src/commands/launcher.ts`, `packages/layers/cli/test/integration/workspace-selection-ui-e2e.test.mjs`, `packages/agent-web-ui/src/app/components/SurfaceNavigator.vue`.
- Current evidence: the dashboard doc defines the persistent `Launch UI Session -> Launch Attempt -> Host Handoff -> Runtime Observation -> Projection Observation -> Admitted Lifecycle Action` chain, and the e2e draft exercises multiple launches in one browser session.
- Remaining gap: confirm the implementation persists and reloads the dashboard state exactly as the doc requires, not just in one happy-path session.
- Next verification: rerun the launcher dashboard e2e test in `packages/layers/cli/test/integration/workspace-selection-ui-e2e.test.mjs`.

### 1820. Unified launch observation

- State: open; launch observation needs a single operator-facing model across terminal, browser, and NARS session index.
- Owning files: `packages/layers/cli/src/commands/launcher.ts`, `packages/nars-session-core/src/session-index.mjs`, `packages/agent-web-ui/src/session-projection.js`, `packages/agent-web-ui/src/session-projection-activity.js`.
- Current evidence: the launcher draft now records handoff, runtime, and projection observation records separately, which is the right shape for a unified observation layer.
- Remaining gap: verify that the same observation can be rediscovered and displayed after the launcher process restarts.
- Next verification: `pnpm --filter @narada2/carrier-runtime test` plus the launcher dashboard e2e test.

### 1821. Attach ambiguity / staleness UX

- State: open; attach commands and discovery UX still need a clearer stale-versus-ambiguous story.
- Owning files: `packages/layers/cli/src/commands/agent-web-ui.ts`, `packages/layers/cli/src/commands/nars.ts`, `packages/agent-web-ui/src/session-identity.js`.
- Current evidence: the identity helper now gives the UI a canonical grouping key instead of forcing raw `agent_id` grouping.
- Remaining gap: ambiguous attach candidates and stale discoveries still need explicit row labels and refusal text that the operator can act on.
- Next verification: `packages/layers/cli/test/commands/operator-surface.test.ts` and the browser projection tests for ambiguous session grouping.

### 1822. Event normalization

- State: open; event normalization is partially implemented in browser/session projection code.
- Owning files: `packages/agent-web-ui/src/session-projection.js`, `packages/agent-web-ui/src/session-projection-activity.js`, `packages/carrier-protocol/src/carrier-protocol.mjs`.
- Current evidence: the projection reducers already normalize event shape and canonical identity display.
- Remaining gap: prove that every relevant event lane uses the same normalization path rather than specialized one-off parsing.
- Next verification: `pnpm --filter @narada2/agent-web-ui test`.

### 1823. Event lanes

- State: open; event lanes exist in the web UI draft, but the routing model still needs a strong coherence check.
- Owning files: `packages/agent-web-ui/src/app/components/NarsSessionShell.vue`, `packages/agent-web-ui/src/app/components/SurfaceNavigator.vue`, `packages/agent-web-ui/src/app/App.vue`.
- Current evidence: the browser UI already separates session, surface, and activity components instead of rendering one undifferentiated feed.
- Remaining gap: show that those lanes remain distinct under projection attach, health updates, and conversational events.
- Next verification: `pnpm --filter @narada2/agent-web-ui test` and the panel-focused UI e2e coverage.

### 1824. Web UI peer maturity

- State: open; the browser projection needs a final peer-maturity pass rather than a minimal feature pass.
- Owning files: `packages/agent-web-ui/README.md`, `packages/agent-web-ui/src/agent-web-ui.css`, `packages/agent-web-ui/src/app/components/*.vue`, `packages/agent-web-ui/test/agent-web-ui-*.test.mjs`.
- Current evidence: the UI package already has dedicated panel, projection, protocol, and UX smoke tests.
- Remaining gap: prove the page behaves like a first-class projection peer rather than a thin transport viewer.
- Next verification: `pnpm --filter @narada2/agent-web-ui test` and the launcher dashboard e2e once the same session is attached from the browser.

### 1825. Cloudflare / local symmetry

- State: open; local and Cloudflare projection semantics still need one agreed coherence story.
- Owning files: `docs/operations/cloudflare-local-nars-projection-symmetry-matrix.md`, `docs/architecture/cloudflare-carrier/target.md`, `packages/agent-runtime-server/src/server-wrapper.mjs`, `packages/nars-capability-gateway/src/mcp-runtime.mjs`, `D:/code/mcp-surfaces/packages/site-coherence-mcp/src/main.ts`.
- Current evidence: the new symmetry matrix maps local/runtime and Cloudflare/runtime quadrants to the existing agent-web-ui and cloudflare-nars-projection tests, and the architecture doc plus site-coherence surface already describe the intended local-versus-Cloudflare comparison model.
- Remaining gap: keep the matrix synchronized with future projection tests and document any additional asymmetry rather than blurring it into symmetry.
- Next verification: the site coherence check for the relevant Site id plus the Cloudflare carrier projection smoke.

### 1826. Authority-host transition execution

- State: open; launcher authority handoff still needs to be consistently represented from workspace start through operator attach.
- Owning files: `Start-NaradaWorkspace.ps1`, `Start-NaradaAgent.ps1`, `tools/operator-surface-carriers/Start-AgentCliSession.ps1`, `packages/agent-start/src/carrier-process-launch.ts`, `tools/operator-surface/mcp-runtime-instance-registry.mjs`.
- Current evidence: the launcher path already records handoff evidence and operator-terminal posture separately from runtime ownership.
- Remaining gap: prove the authority transition is explicit in the launch path rather than inferred from the process tree.
- Next verification: launcher workspace launch smoke plus the terminal projection test.

### 1827. MCP fabric handoff

- State: open; worker-facing MCP scope still needs to be bounded by the owning runtime, not by accidental process inheritance.
- Owning files: `packages/agent-start/src/narada-agent-start.ts`, `packages/agent-runtime-server/src/session-core-runtime-service.mjs`, `packages/agent-context-tools/src/agent-context-mcp-server.mjs`.
- Current evidence: the runtime stack already separates discovery, projection, and session index responsibilities.
- Remaining gap: the launcher and delegated worker flows still need explicit proof that MCP exposure is intentional and scoped.
- Next verification: `pnpm --filter @narada2/carrier-runtime test` and the worker-delegation/launcher tests that cover scoped MCP startup.

### 1828. User-site scoped provider readiness cache

- State: open; provider readiness still needs a user-site-scoped cache or equivalent persisted readiness model.
- Owning files: `packages/agent-start/src/narada-agent-start.ts`, `packages/layers/cli/src/lib/launcher-runtime.ts`, `Start-NaradaWorkspace.ps1`, `C:/Users/Andrey/Narada/config/launch/agents.psd1`.
- Current evidence: provider selection and runtime selection are already materialized in launcher planning, but readiness is still largely resolved at launch time.
- Remaining gap: cache readiness per user site so the launcher does not rediscover the same provider posture on every run.
- Next verification: the launcher option-contract and workspace-plan tests in `packages/agent-start/test` and `packages/layers/cli/test`.

### 1829. Dist freshness ergonomics

- State: open; fresh builds and ignored dist outputs still need clearer operator ergonomics.
- Owning files: `packages/agent-start/package.json`, `packages/layers/cli/package.json`, `packages/agent-start/bin/verify-registered-site-launchers.mjs`, `packages/agent-start/test/run-agent-start-tests.mjs`.
- Current evidence: the repo already has explicit launcher verification scripts and test shards that can surface stale build output.
- Remaining gap: make it obvious when a launcher command is depending on an out-of-date dist tree versus a genuinely missing build.
- Next verification: the agent-start and CLI test suites plus the registered-launcher verifier.

### 1830. Compatibility command surface

- State: open; the compatibility command surface still needs one coherent operator vocabulary.
- Owning files: `Start-NaradaWorkspace.ps1`, `Start-NaradaAgent.ps1`, `packages/layers/cli/src/commands/launcher.ts`, `packages/layers/cli/src/commands/nars.ts`.
- Current evidence: the workspace launcher, agent launcher, and CLI command set already share the same general start/attach shape.
- Remaining gap: the operator-facing command surface still needs a final canonical mapping so old and new invocations do not diverge.
- Next verification: `packages/layers/cli/test/commands/launcher-workspace-plan.test.ts`, `packages/layers/cli/test/commands/nars.test.ts`, and the user-site launcher docs.

### 1831. Launcher acceptance e2e

- State: in progress; the acceptance path is represented by a dedicated browser integration test and a launcher smoke doc.
- Owning files: `packages/layers/cli/test/integration/workspace-selection-ui-e2e.test.mjs`, `docs/operator/launcher-nars-acceptance-smoke.md`.
- Current evidence: the integration test already exercises repeated launches, handoff records, runtime observation, projection handoff, and dashboard persistence.
- Remaining gap: keep the acceptance path synchronized with the dashboard doc and ensure it remains the canonical operator smoke.
- Next verification: rerun the integration test whenever launcher/dashboard behavior changes.

### 1832. Closure ledger

- State: in progress; this document is the artifact.
- Owning files: `docs/operations/coherence-closure-ledger.md`.
- Current evidence: the ledger now maps the current 20-item inventory to source files, tests, and remaining gaps.
- Remaining gap: keep it synchronized with future launcher/NARS/web-projection commits.
- Next verification: review this document alongside the repo git summaries before any new launcher or NARS change.

## Verification Checklist

Run the narrow tests that correspond to the changed slice, then update the row in this ledger if the evidence changes:

- `pnpm --filter @narada2/agent-identity test`
- `pnpm --filter @narada2/agent-start-renderer test`
- `pnpm --filter @narada2/carrier-terminal-projection test`
- `pnpm --filter @narada2/nars-client-projection-contract test`
- `pnpm --filter @narada2/agent-web-ui test`
- `pnpm --filter @narada2/carrier-runtime test`
- `pnpm --filter @narada2/agent-start test`
- launcher dashboard e2e: `packages/layers/cli/test/integration/workspace-selection-ui-e2e.test.mjs`
- workspace and site git summaries through Git MCP before committing launcher/NARS changes

## Ledger Rule

No row below should be promoted from `open` or `in progress` to `done` without a source link and a test or runtime artifact that actually proves the claim.