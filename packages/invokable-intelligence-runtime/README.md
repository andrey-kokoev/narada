# @narada2/invokable-intelligence-runtime

Local Narada runtime integration for invokable intelligence (#2184).
The invocation entry point that replaces env-based provider/model
selection: resolve immediately before each invocation, invoke only the
adapter named by the plan, and persist the full
**Intent → Plan → Attempt → Evidence** chain.

## Local invocation gateway

```ts
const gateway = createLocalInvocationGateway({ store, sites, adapters });
const result = await gateway.invoke({
  intentId: "intent:session-42",      // pin for replay; derived otherwise
  purpose: "operator-chat",
  principal: "operator",
  requestedOptions: { thinking: "low" },
  messages,
});
```

- `sites` is the explicit target/User/Host context — launcher and session
  boundaries transport this, never a provider or model.
- `adapters` maps adapter ids to injected invokers; the gateway knows
  nothing about providers and dispatches only `plan.selected.adapter.id`.
- Refusals are recorded (`getRefusalByIntent`) and returned before any
  dispatch, with the resolver's structured explanation.
- **Replay/restart:** a recorded plan for the same intent is reused
  verbatim (decision provenance preserved); attempts upsert by id, so
  retries never duplicate. Plans are byte-stable for identical inputs,
  so restart resolution is idempotent.

## Runtime plan boundary

The gateway passes the selected offering, route, adapter coordinates, and
credential locator from the immutable plan directly to the canonical protocol
adapter. Environment variables may materialize credential secrets at the final
adapter boundary, but they never select an inference provider, model provider,
model, endpoint, thinking level, or route.

## agent-runtime-server wiring

`server-wrapper.mjs` transports only catalog location, Site loci, and principal
identity at session startup:

```
NARADA_INTELLIGENCE_REGISTRY_DB   registry db path (node:sqlite store)
NARADA_INTELLIGENCE_TARGET_SITE   e.g. site:thoughts-project
NARADA_INTELLIGENCE_USER_SITE     e.g. site:andrey-user
NARADA_INTELLIGENCE_HOST_SITE     e.g. site:andrey-pc
NARADA_INTELLIGENCE_PRINCIPAL_ID  principal evaluated by access policy
```

Each invocation supplies intent and requested capabilities, then resolves
through the canonical SQLite catalog and policy immediately before dispatch.
Missing Site/principal context or a policy refusal fails before provider
invocation with structured evidence. There is no startup provider binding and
no provider/model environment fallback.

## Verification

Package tests cover context and plan boundaries; happy paths with linked
records; recorded refusals before dispatch; replay dedup; restart
provenance over a reopened store; adapter failure states; and a local
live e2e driving a real HTTP dispatch from a plan through an injected
adapter. The server-wrapper seam is proven against the canonical registry and
plan-driven protocol adapter without a legacy binding projection.

## Scripts

```sh
pnpm build       # tsc → dist/
pnpm typecheck
pnpm test        # node --import tsx --test
```
