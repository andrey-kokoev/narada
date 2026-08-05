# @narada-core/quota-meter

Quota-meter's domain package for provider usage, quota windows, glide-path calculations, and the quota-specific Windows overlay projection.

## Shape

`quota-meter` owns provider adapters, normalized quota results, glide-path calculations, CLI formatting, and MCP tools. It delegates generic Windows overlay mechanics to `@narada-core/window-overlay-core`.

```text
provider adapters -> quota domain -> quota overlay document
                                  \-> CLI / MCP
quota overlay document -> window-overlay-core
```

The Operator Console is a separate specialization. Both it and quota-meter consume `window-overlay-core`; neither depends on the other.

## Commands

From the Narada workspace:

```text
pnpm --filter @narada-core/quota-meter check
pnpm --filter @narada-core/quota-meter test
pnpm --filter @narada-core/quota-meter exec bun src/cli.js providers
pnpm --filter @narada-core/quota-meter exec bun src/cli.js overlay --provider codex,kimi
```

Node.js 22 or Bun 1.3 or newer is required because the package consumes the Narada workspace overlay core.

## Runtime posture

Tests and the MCP entrypoint are Bun-first; `test:node` and `mcp:node` retain
the Node compatibility paths. The provider adapters and Windows overlay worker
still use Node-compatible `node:` child-process, readline, and filesystem APIs;
those are deliberate domain boundaries, not a new runtime abstraction. `check`
remains the existing Node syntax check (also available as `check:node`) because
there is no stable Bun script-level equivalent to promote.

## State and refresh

The generic overlay state lives under `%LOCALAPPDATA%\Narada\window-surface-overlays\quota-meter` (or the explicit `NARADA_WINDOW_SURFACE_OVERLAY_STATE_ROOT`). The quota domain's hidden worker fetches provider data and publishes a validated `OverlayDocument`; the WPF host never reads credentials or invokes provider commands.

The former standalone repository remains a migration source/rollback reference until the workspace package is verified and the standalone entry point is deliberately retired.
