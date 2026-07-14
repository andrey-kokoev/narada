# Shared Narada UI review evidence - 2026-07-11

This replacement evidence supersedes the original completion reports for tasks 1967-1972 for review purposes. It records the current repository state after the post-report review fixes.

## 1967 - Shared UI package boundary

The boundary decision remains present at docs/concepts/shared-narada-ui-package-boundary.md. It assigns cross-renderer CSS and compiled styles to @narada2/ui, Vue primitives to @narada2/ui-vue, session-specific behavior to @narada2/agent-web-ui, and keeps mcp-surfaces UI-neutral.

## 1968 - Shared CSS foundation

@narada2/ui exports the compiled styles.css artifact and has a package-local non-Vue consumer fixture. The package build and @narada2/ui tests pass. Consumer packages now have explicit build hooks where the compiled artifact is required, so a clean checkout does not depend on a prior manual UI build.

## 1969 - Shared Vue primitives

@narada2/ui-vue owns the selected Vue primitives, exports them explicitly, consumes the shared CSS foundation, and does not require shadcn-vue at runtime. pnpm --filter @narada2/ui-vue test passes, including vue-tsc, the package fixture build, and the consumer test. The generated dist-fixture directory was removed after verification.

## 1970 - Agent Web UI migration

Agent Web UI consumes @narada2/ui and @narada2/ui-vue. The stale package-local components.json was removed, the package now builds the shared CSS foundation before its own build, and unused generator/runtime dependencies were removed. The local transport nullability guard was fixed after review. Typecheck and package tests pass. The Playwright suite passes with explicit chromium-light and chromium-dark projects over the existing desktop and mobile scenarios.

Changed in the post-report review: packages/agent-web-ui/package.json, packages/agent-web-ui/playwright.config.js, packages/agent-web-ui/src/protocol/localSessionTransport.ts, and deletion of packages/agent-web-ui/components.json.

## 1971 - Site Registry migration

Site Registry consumes the built @narada2/ui/styles.css artifact without Vue. The CLI now builds the shared UI package before build, test, and real-filesystem integration workflows. Focused Site Registry server and browser verification passes, including desktop and narrow mobile layouts and the guarded draft workflow.

The broader cli test:realfs command currently builds successfully but has two unrelated pre-existing local-history failures: one history CLI readiness timeout and one Windows temporary-directory EPERM cleanup failure. The run had 9 passing, 2 failing, and 3 skipped tests. This is recorded as an evidence limit, not treated as a Site Registry failure.

Changed in the post-report review: packages/layers/cli/package.json.

## 1972 - Consumer contract and boundary enforcement

The shared consumer contract documents CSS-only, Vue primitive, Agent Web UI, and mcp-surfaces consumption. The mcp-surfaces-owned UI-neutral guard now checks manifests, TypeScript/JavaScript/Vue module imports including require() and dynamic imports, and direct stylesheet files. The guard is exposed as pnpm test:ui-boundary and runs first in the mcp-surfaces root test command. The focused boundary test passes.

The Narada-side focused checks pass:
- pnpm --filter @narada2/ui-vue test
- pnpm --filter @narada2/agent-web-ui typecheck
- pnpm --filter @narada2/agent-web-ui test
- pnpm --filter @narada2/agent-web-ui test:browser
- pnpm --filter @narada2/cli typecheck

The full mcp-surfaces typecheck was previously passing; the current focused boundary check passes after the guard changes.

Changed in the post-report review: test/ui-neutral-boundary.test.mjs, package.json, docs/mcp-taxonomy.md, and AGENTS.md in mcp-surfaces.

## Lifecycle disposition

All six tasks have admitted completed outcomes and satisfied dependencies, but remain in_review with no closure evidence. This artifact updates the review evidence; it does not assert independent review or closure. Closure still requires the lifecycle review authority to accept this evidence.
