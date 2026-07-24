# Operator Console Production Readiness E2E

## Purpose

The operator-console launch path is production-ready only when the browser click, workspace-launch contract, intelligence catalog, NARS session index, runtime health, operator-surface attachment, failure diagnostics, and cleanup behavior are proven together.

One green browser test is not sufficient. The test must exercise the same authority boundaries that the User Site launch uses and must prove both success and refusal behavior.

## Current deterministic command

Run the focused deterministic readiness slice from the Narada repository:

```text
pnpm --filter @narada2/cli test:operator-console-production-readiness
```

The command builds the CLI and the agent-web-ui artifact before starting tests. This build dependency is intentional: the real launch path starts the materialized agent-web-ui bundle, so a stale or absent bundle is a launch failure and must not depend on an unrelated manual build. It then runs the focused admission, gateway-diagnostics, and workspace-boundary Vitest suites. Programmatic Operator Console launches request a User Site-owned workspace-result artifact, so a failed launch has both the console diagnostic and the nested workspace evidence available for correlation.

## Required E2E matrix

### 1. Artifact materialization gate

Setup: build every artifact consumed by the launch command, including `@narada2/agent-web-ui`.

Proof:

- the launch artifact exists;
- its build manifest/source identity is current;
- the operator-console test command performs this build itself;
- no test relies on a previously built ignored `dist/` directory.

Failure must identify the stale artifact and the required build command before any browser click is attempted.

### 2. Isolated real browser launch

Test: `operator-console-real-launch-e2e.test.mjs`.

Setup: temporary User Site registry, temporary Site root, seeded valid intelligence catalog, actual operator console server, actual operator router, actual browser, and an actual NARS-backed agent-web-ui launch.

Proof:

- the Site and admitted agent appear in the rendered Site box;
- clicking the agent button sends the real launch request;
- the request returns success;
- the exact launch session is indexed;
- the indexed identity and Site match the requested agent;
- the runtime health endpoint is healthy;
- the agent-web-ui attachment points to that exact session;
- session close and process-tree cleanup complete.

This is a real launch-contract test, but its seeded catalog means it does not prove first-use User Site bootstrap.

### 3. First-use User Site catalog bootstrap

Test: `intelligence-catalog-launch-preflight-e2e.test.mjs` plus the real browser launch path.

Setup: an empty User Site intelligence registry and a valid provider catalog source.

Proof:

- launch preflight initializes the catalog;
- the resulting catalog validates against the registry schema;
- the launch proceeds to runtime start rather than failing with `intelligence_registry_not_initialized`;
- the second launch is idempotent and does not rewrite immutable records.

The direct preflight test is necessary but does not replace a browser click test. The two tests must share the same launch-preflight implementation.

### 4. Existing catalog and migration-drift protection

Setup: an already initialized catalog whose source metadata or bootstrap input has changed, including the historical `account-anthropic-api:r1` conflict shape.

Proof:

- preflight recognizes the existing validated catalog;
- it does not replay source records into immutable existing records;
- it reports `already_ready` or an equivalent non-mutating result;
- the launch continues;
- a genuine schema or validation failure remains explicit and actionable.

This is the regression guard for the immutable migration conflict that blocked `andrey-user.architect`.

### 5. Runtime-start failure and missing-session-index refusal

Setup: a deterministic runtime child that exits or fails before emitting `session_started` and before writing a session-index record.

Proof:

- the browser request returns a structured non-2xx result;
- the diagnostic records the outer phase `workspace_launch`, while its message preserves the precise `session_attachment` failure and reason `session_not_indexed`;
- the request includes the result/failure artifact path;
- no stale prior session is attached;
- owned processes are rolled back;
- the failed session is not presented as healthy or attachable.

The test must use the exact workspace-launch executor and attachment boundary. A unit test of an isolated predicate is not enough.

### 6. Projection-readiness failure

Setup: the runtime session starts and is healthy, but the operator-surface projection does not become ready within the bounded readiness window.

Proof:

- the response message identifies projection readiness as the failed stage; the persisted wire artifact records the outer phase `workspace_launch`;
- the diagnostic points to the persisted workspace-result artifact, whose attached-session evidence retains the exact session identity and health correlation;
- the failure artifact is materialized;
- runtime and projection processes owned by this launch are cleaned up;
- an old healthy session cannot satisfy the new launch request.

This covers the stale agent-web-ui build/readiness failure seen when the existing test was run without rebuilding the web UI.

### 7. Concurrent exact-session binding

Setup: launch two roles or two launch requests for the same Site while an older session for the same agent also exists.

Proof:

- the real browser test submits the Site-box click and a simultaneous second launch request for the same agent;
- both responses resolve to one exact session, and at least one response proves the actual launch rather than a reuse;
- an older healthy session cannot win discovery by agent ID alone;
- duplicate or ambiguous session state is surfaced as a typed refusal, not silently guessed.

The browser race is complemented by the focused admission/gateway tests and exact-session workspace-boundary tests. This is mandatory because production users can open multiple launcher windows and retry after a delayed start.

### 8. Opt-in live User Site launch

Test: explicit, non-default live E2E; never run against the real User Site in ordinary CI.

Required opt-in marker: `NARADA_OPERATOR_CONSOLE_PRODUCTION_E2E=1`.

Setup: the actual User Site registry/catalog and a dedicated disposable role/site admission. The test must snapshot or isolate mutable state and must not use a personal production agent without an explicit operator decision.

Proof:

- the exact operator-console browser route is used;
- real catalog preflight runs against the real User Site authority;
- provider readiness is checked before runtime spawn;
- the resulting NARS session, identity, Site, provider, health endpoint, and projection are all correlated;
- failure diagnostics point to a materialized artifact;
- cleanup leaves no orphaned runtime or projection process.

This is the final production-evidence gate. It is intentionally opt-in because it invokes real local credentials and processes.

## Non-claims

- `operator-console-ui-e2e.test.mjs` is a UI/route fixture test; it does not prove runtime launch.
- A successful `200` response alone does not prove session correctness.
- A session directory alone does not prove runtime startup; `session_started`, index presence, health, and exact identity correlation are required.
- A clean temporary catalog does not prove User Site bootstrap or migration safety.
- A test that passes only after a manually built `dist/` directory is present is not reproducible.

## Release gate

The launch path may be called production-ready only when gates 1 through 7 are deterministic and green, and gate 8 has passed in an explicit disposable User Site environment. Until then, the honest status is `launch-contract verified` rather than `production-ready`.
