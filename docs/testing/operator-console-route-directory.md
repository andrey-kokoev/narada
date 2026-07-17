# Operator Console Route-directory Verification

This note is the focused verification contract for the Workspace route
directory. The target behavior is documented in
[`operator-workspace-target.md`](../architecture/operator-workspace-target.md),
and operator recovery steps are in
[`operator-console-runbook.md`](../product/operator-console-runbook.md).

## Required Behaviors

- The response is parsed against the typed route-directory contract.
- Duplicate navigation keys and malformed authority/intent bindings are
  rejected.
- External, protocol-relative, and otherwise unsafe route paths are rejected
  at the contract and browser admission boundaries.
- A stalled read has a bounded timeout.
- An initial failure exposes a retryable diagnostic.
- A failed refresh preserves the last valid snapshot.
- A successful retry clears the diagnostic and replaces the snapshot.
- A failed refresh exposes the last successful verification time and marks
  navigation/discovery stale while leaving canonical registry mutation
  admission to the registry API.
- Registry mutation navigation warns before discarding dirty drafts, including
  browser unload/reload behavior.
- Site selection survives refresh and history through the `site` query
  parameter.
- Console HTML projection escapes injected JSON for HTML-script context.
- Transformed HTML does not retain stale asset validators or encoding metadata.
- Root and `/console/` redirects resolve to the canonical Registry route.
- CLI route handlers consume shared contract path constants.

## Focused Commands

Run from `D:\code\narada`:

```powershell
pnpm --filter @narada2/operator-console-contract test
pnpm --filter @narada2/operator-console-ui test
pnpm --filter @narada2/cloudflare-nars-projection test
pnpm --filter @narada2/cloudflare-nars-projection typecheck
pnpm --filter @narada2/cli exec vitest run --silent test/commands/console-server.test.ts
pnpm --filter @narada2/cli build
```

Do not substitute a broad repository test as the only verification for this
slice. These checks exercise the contract, Vue route state, Cloudflare HTML
projection, CLI route boundary, and generated CLI launch artifact separately.
