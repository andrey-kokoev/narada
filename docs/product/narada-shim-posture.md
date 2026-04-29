# Narada Shim Posture

The installed `narada` shim defaults to production-safe dist execution:

- It executes `packages/layers/cli/dist/main.js`.
- It refuses to run if source files are newer than dist.
- It prints the build command instead of silently running stale code.
- It allows stable governance commands (`task`, `chapter`, `inbox`, `principal`) to continue against installed dist by default when source is stale, so Architect/task authority work is not blocked by unrelated Builder source edits.

For active development, an operator may explicitly opt into rebuild-on-use:

```bash
NARADA_SHIM_AUTO_BUILD=1 narada --help
```

That opt-in is intentionally explicit because it lets a shell command perform a build side effect before executing the CLI.

To make governance commands block on stale source like ordinary implementation commands:

```bash
NARADA_SHIM_ALLOW_STALE_GOVERNANCE=0 narada task create --title "..."
```

This preserves the default development safety posture for implementation commands while keeping task, chapter, inbox, and principal authority surfaces usable during active Builder work.
