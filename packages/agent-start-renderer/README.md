# @narada2/agent-start-renderer

Shared renderer for Narada `agent-start` pre-carrier launch output.

This package owns the operator-facing startup preamble shape used before a
carrier such as `agent-cli`, Codex, Pi, Claude Code, or Kimi is spawned. Sites
may supply Site-specific launch data, but they must not fork the field order,
color semantics, API-key redaction, or wait prompt text.

Site launchers should resolve this package through `NARADA_PROPER_ROOT` and
dynamic import. They must not hardcode a machine-specific `file:///D:/...`
module URL.

Canonical source:

```text
D:\code\narada\packages\agent-start-renderer\src\agent-start-renderer.mjs
```

Verification:

```powershell
pnpm --filter @narada2/agent-start-renderer test
pnpm --filter @narada2/agent-start-renderer typecheck
```
