# @narada2/agent-start-renderer

Shared renderer for Narada `agent-start` pre-carrier launch output.

This package owns the operator-facing startup preamble shape used before a
carrier such as `agent-cli`, Codex, Pi, Claude Code, or Kimi is spawned. Sites
may supply Site-specific launch data, but they must not fork the field order,
color semantics, API-key redaction, or wait prompt text.

Site launchers should resolve this package through its package export
`@narada2/agent-start-renderer`. `NARADA_PROPER_ROOT` is only a local workspace
fallback for locating the package root. Launchers must not hardcode a
machine-specific `file:///D:/...` module URL or import `packages/.../src`
directly.

Canonical package export:

```text
package: @narada2/agent-start-renderer
export:  .
```

Verification:

```powershell
pnpm --filter @narada2/agent-start-renderer test
pnpm --filter @narada2/agent-start-renderer typecheck
```
