# @narada2/agent-web-ui

The production Agent Web UI browser surface for one NARS session.

The Narada CLI resolves `@narada2/agent-web-ui/server` for local and Cloudflare
projection launch. The package owns browser transport, session projections,
operator rendering, and browser-local input behavior; NARS remains the owner of
session state, event ordering, health, authority, and command admission.

Bounded checks:

```text
pnpm --filter @narada2/agent-web-ui typecheck
pnpm --filter @narada2/agent-web-ui test
pnpm --filter @narada2/agent-web-ui build
```
