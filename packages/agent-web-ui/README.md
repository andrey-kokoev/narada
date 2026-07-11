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

Verification ownership:

- `test/agent-web-ui-projection.test.mjs` proves event/session projection behavior.
- `test/agent-web-ui-protocol.test.mjs` proves protocol framing and attachment boundaries.
- `test/agent-web-ui.test.mjs` proves browser preference serialization, content and panel feature seams, package wiring, and bounded UI contracts.
- `pnpm --filter @narada2/agent-web-ui test:e2e` is an explicit browser boundary suite; it builds first and is not part of the default test command.
- `test:live:*` and `test:browser:cdp` are explicit live-smoke suites and require an operator-supplied runtime or projection.

Browser-local preferences are owned by their feature and use the registry in
`src/app/lib/browserPreferences.js`. They affect only browser presentation or
browser-local snippets; they are never session authority, durable event state,
or protocol input. Provider, model, and thinking changes are NARS session
actions and therefore are deliberately not persisted as browser preferences.
