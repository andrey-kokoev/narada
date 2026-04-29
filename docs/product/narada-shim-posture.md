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

## Delegated Site Invocation

A Site wrapper should not hand-assemble Node, NVM, WSL, or `dist/main.js` paths as an agent-facing repair strategy. The canonical delegated invocation is either:

- the installed `narada` shim available in the target embodiment, or
- a Site-declared wrapper in `package.json` under `narada.delegated_cli_embodiment`.

Example:

```json
{
  "narada": {
    "delegated_cli_embodiment": {
      "command": "./bin/narada-site",
      "cwd": ".",
      "shell": "login",
      "repair_command": "pnpm run narada:install-shim"
    }
  }
}
```

`narada inbox doctor` reads this contract, checks `--version`, classifies failures, and prints the exact repair command. If the delegated embodiment is not loadable, an agent should report that failure and repair command rather than inventing a sampled PATH command.
