# @narada-core/window-overlay-core

Reusable Windows overlay-window mechanics for Narada operator surfaces.

This package owns the mechanics extracted from the quota-meter overlay:

- one overlay process per stable overlay id;
- user-local state for PID, document, refresh signal, position, opacity, and pin state; position is persisted as a nearest-corner anchor (`top-left`, `top-right`, `bottom-left`, or `bottom-right`) with monitor-work-area insets rather than absolute desktop coordinates;
- borderless, rounded, topmost WPF window with drag-to-move;
- shared dark translucent chrome, compact icon actions, semantic row tones, hover states, opacity controls, and persisted pin/position preferences;
- pinned overlays are visible only while Windows Terminal is the foreground window by default, except while the overlay itself is active so interaction and drag-to-move remain possible; callers can explicitly select the `always` visibility policy;
- refreshable JSON document rendering with semantic tones, ochre accent titles/actions, and validated clickable HTTP(S) row values;
- controlled actions: open an HTTP(S) URL, request refresh, close, or invoke an explicitly supplied local restart command. Actions may provide a presentation-only `icon` and `tooltip`; execution semantics remain defined by `kind`.

It does not own provider/quota logic, operator-console authority, site discovery, or arbitrary command execution. A specialization supplies a versioned document and may explicitly supply one fixed restart command for a typed `restart` action; the overlay never accepts a command from the document itself.

The default state root is %LOCALAPPDATA%/Narada/window-surface-overlays. Set NARADA_WINDOW_SURFACE_OVERLAY_STATE_ROOT only for a deliberate test or isolated installation. A typed `restart` action uses the fixed command supplied by the owning specialization and never accepts executable details from the document.

On Windows, the Node boundary restores the lowercase `windir` environment alias from `SystemRoot`, derives `LOCALAPPDATA` from the user profile, and restores executable extensions in `PATHEXT` when an MCP carrier omits them. This keeps PowerShell/WPF startup deterministic for headless-stdio MCP launchers without requiring a carrier restart.

Position preferences are resolved against the work area of the monitor under the launch cursor, with the current monitor DPI applied before WPF coordinates are hydrated. Legacy `left`/`top` preferences are converted to the nearest corner on first hydration, and resolved positions are clamped into the visible work area. Drag completion persists the anchor immediately, so a forced host restart cannot discard the moved position.
