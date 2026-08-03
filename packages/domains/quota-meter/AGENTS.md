# Quota Meter Domain

This package owns quota-meter's provider-neutral domain and its operator-surface adapters.

## Ownership

- `core.js` owns quota normalization, glide-path calculations, and versioned domain data.
- `codex.js`, `kimi.js`, and `providers.js` own provider adapters and authentication boundaries.
- `format.js` owns CLI presentation.
- `overlay.js` and `overlay-worker.js` own the quota-specific projection into Narada's generic window overlay.
- `cli.js` and `mcp.js` own the CLI and MCP transport surfaces.

The package delegates window process, WPF, persisted overlay state, visibility, focus, and action mechanics to `@narada-core/window-overlay-core`.

## Boundary Rules

Do not add provider, quota, or credential logic to `window-overlay-core`. Do not depend on `operator-console-overlay`; it is a separate consumer of the generic overlay mechanics. Do not let the overlay worker execute arbitrary commands or persist provider credentials.

The domain remains provider-specific at the adapter boundary but provider-agnostic in its normalized output. The overlay document is a projection, not a second source of quota truth.
