# Cloudflare NARS projection

This private workspace package keeps its package exports pointed at compiled
dist/ output. The repository ignores dist/, so consumer lifecycle gates build
the projection package before consuming it:

- @narada2/agent-web-ui builds it before build, test, test:unit, and typecheck.
- @narada2/cli builds it before build, test, and typecheck.

The same rule applies to a clean checkout: run the following before invoking a
consumer entry point directly:

    pnpm --filter @narada2/cloudflare-nars-projection build
