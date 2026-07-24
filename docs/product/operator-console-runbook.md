# Operator Console Runbook

This is the operator-facing recovery guide for the local Operator Console and
its Workspace route directory. The architecture and ownership target is
defined in [`operator-workspace-target.md`](../architecture/operator-workspace-target.md).

## Normal Entry Point

Start the local Workspace host through the Narada CLI:

```powershell
narada console serve
```

Open the Workspace URL printed by the command. The normal entry point is
`/console/agents`; it groups the User Site and Host/PC Site separately from
ordinary Sites and shows only admitted agents. The Registry remains available
at `/console/registry/`. The Workspace route directory is read from
`/console/routes`; it describes which Console surfaces and routes are actually
available from the current host.

For a first-time personal User Site, use `/console/onboarding` (the **First
Use** route). It projects the CLI-owned doctor and onboarding contracts and
offers only the resident-first live start or the credential-free demo. It does
not accept secrets or replace `narada onboarding` as the mutation authority.

The browser is a projection client. It does not invent routes, replace the
route authority, or bypass the CLI-owned server.

## Projection Lifecycle

The stable Operator Router is host-owned and may outlive the terminal that
started the Console projection. The projection itself has first-class CLI
lifecycle commands:

```powershell
narada console stop
narada console restart
```

`stop` discovers the authenticated `operator-console` route, verifies the
recorded owner process before terminating it, and removes the route. If the
owner has already exited, it removes only the stale route. It never stops the
shared Operator Router. `restart` performs the same bounded stop and then
starts a fresh projection on the stable port. Use `--no-open` when only the
server should be restarted. A process-identity refusal is intentional: do
not force-kill an unrelated process whose PID was reused; inspect the route
diagnostics instead.

## Sites and Agents

Each Site box identifies its explicit Site kind and admitted agents. The dot
shows runtime posture, while the text under the role icon shows independent
work posture. Do not interpret color alone.

- Select a stopped agent to start it and open Agent Web UI when its healthy
  session route appears.
- Select a running agent to reuse its one healthy session; this does not start
  a duplicate runtime.
- Right-click an agent or press `Shift+F10` to inspect it. A uniquely healthy
  session opens Agent Web UI directly; there is no intermediate action menu.
- Multiple healthy sessions are `ambiguous`; inspection opens Agent Sessions
  with the exact canonical `site` and `agent` scope. Partial or cross-Site
  scopes refuse attachment, and unrelated sessions are not listed.
- A degraded runtime must be inspected or recovered before another launch.
- A launch handoff first reports session registration, then route publication.
  It waits for up to five minutes without depending on the original Console
  component. At timeout, use **Retry**, **Open scoped sessions**, or **Cancel
  wait**. A missing route never falls back to a historical session.

Agent Web UI remains session-scoped. The overview never substitutes an agent
id for a NARS session id, and it does not mutate Principal Runtime or the NARS
session index directly.

The authority chain is explicit: Site metadata and Principal Runtime own Site
kind and work posture; the canonical NARS session index owns runtime/session
posture; the User Site launch registry owns admitted launch records; the CLI
gateway owns atomic ensure-running admission; and the Workspace route directory
owns WebUI reachability. Missing or invalid authority data is rendered as a
bounded refusal rather than inferred from paths, labels, or another Site.

Pending handoff state survives browser reload and page teardown while the
Console server remains alive. It does not survive a Console server restart;
the runtime remains protected by cross-process launch admission and can be
recovered through the canonical scoped Agent Sessions view.

## Route-directory States

| Browser state | Meaning | Operator action |
| --- | --- | --- |
| `Loading operator workspace routes...` | The first live directory read is in progress. | Wait for the bounded read to finish. |
| Live directory unavailable, no prior snapshot | The live navigation projection has not produced a valid directory yet. Safe read navigation may be limited; already-open registry mutations still use the canonical registry authority. | Use **Retry route directory** after confirming the host is running. |
| Live directory unavailable, last known routes shown | A refresh failed, but the last valid directory is retained. The banner shows when it was last verified; already-open registry mutations remain governed by the canonical registry authority. | Continue reading if needed, then retry when convenient. |
| No warning | The current route directory was read successfully. | Continue normally. |

Failures are rendered with a bounded error code and HTTP status when one is
available. They are not silently converted into a new route set.

## Recovery

1. Confirm that the Console host is still running and that its printed URL is
   reachable.
2. Select **Retry route directory** in the warning banner.
3. If the browser was offline or backgrounded, return it online or visible;
   the UI retries automatically in those cases.
4. If the refresh succeeds, the warning clears and the new directory replaces
   the previous snapshot.
5. If the warning persists, inspect the bounded code:
   - `timeout`: the route read exceeded its deadline.
   - `http_error`: the authority returned a non-success HTTP status.
   - `invalid_json`: the response was not JSON.
   - `invalid_response`: JSON did not match the route-directory contract.
   - `unavailable`: the transport failed before a more specific code was known.

Do not repair the browser by hardcoding a missing route. Fix the owning Console
or Router boundary, then retry the directory read.

## Draft and Selection Safety

Registry changes are draft-first. Leaving an Add or Manage page with unsaved
changes prompts before navigation, and closing or reloading the browser exposes
the standard unsaved-work warning. Preview and Apply remain separate actions;
the canonical registry API admits or refuses them using its operation,
revision, and confirmation rules. Route-directory loss affects discovery and
navigation only; it is never a mutation-authority signal.

Site selection is reflected in the Registry URL as `?site=<site-id>`. This
means refresh, browser history, and a copied Registry URL reopen the same
canonical Site selection. If the selected record disappears during refresh,
the query is removed rather than pointing at a nonexistent record.

## Task Executability Recovery

The operator does not repair an assessment by editing SQLite or retrying until a verdict changes. Run the deterministic proof and follow the bounded recovery steps in [`../operations/task-executability-e2e-and-recovery.md`](../operations/task-executability-e2e-and-recovery.md). That proof checks executable-path and lifecycle/recovery mechanics, not task correctness. A live provider check is explicit and optional; an exit-code `2` skip means its external authority was not configured.

## Verification

Run the focused checks from `D:\code\narada`:

```powershell
pnpm --filter @narada2/operator-console-ui test
pnpm --filter @narada2/cloudflare-nars-projection test
pnpm --filter @narada2/cloudflare-nars-projection typecheck
pnpm --filter @narada2/cli exec vitest run --silent=true test/commands/console-server.test.ts
pnpm --filter @narada2/cli exec node --import tsx --test test/commands/console-projection-lifecycle.test.ts
pnpm --filter @narada2/cli build
```

The route-directory behavior is covered by the UI route-state tests and the
Cloudflare projection tests. The built-browser Sites and Agents journey is in
`packages/layers/cli/test/integration/operator-console-ui-e2e.test.mjs`. The
CLI build is required because the Console UI is a launch artifact consumed by
the CLI and Cloudflare asset pipeline.
