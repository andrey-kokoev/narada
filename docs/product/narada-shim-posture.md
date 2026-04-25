# Narada Shim Posture

The installed `narada` shim defaults to production-safe dist execution:

- It executes `packages/layers/cli/dist/main.js`.
- It refuses to run if source files are newer than dist.
- It prints the build command instead of silently running stale code.

For active development, an operator may explicitly opt into rebuild-on-use:

```bash
NARADA_SHIM_AUTO_BUILD=1 narada --help
```

That opt-in is intentionally explicit because it lets a shell command perform a build side effect before executing the CLI.
