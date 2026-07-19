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

## Legacy binding bridge

`planToLegacyBindingOverrides(plan, model)` maps a plan onto the existing
`resolveProviderRuntimeBinding(provider, { env, overrides })` seam:
the plan becomes binding *overrides* — which beat env at every field —
so env carries only credential material, never selection.

## agent-runtime-server wiring

`server-wrapper.mjs` resolves plan-driven at session startup when
configured:

```
NARADA_INTELLIGENCE_REGISTRY_DB   registry db path (node:sqlite store)
NARADA_INTELLIGENCE_TARGET_SITE   e.g. site:thoughts-project
NARADA_INTELLIGENCE_USER_SITE     e.g. site:andrey-user
NARADA_INTELLIGENCE_HOST_SITE     e.g. site:andrey-pc
```

With all four set, the `agent-session` intent resolves through the
ontology and the binding is plan-driven; a refusal fails startup with
`intelligence_resolution_refused:<reason_code>:<explanation>` before any
provider invocation. The resolution explanation rides in
`providerSettings.resolution` for diagnostics. When unset, the legacy
`NARADA_INTELLIGENCE_PROVIDER` env path applies unchanged — final env
retirement is #2186 cutover.

## Verification

9/9 package tests: context/bridge units; happy path with linked
records; recorded refusals before dispatch; replay dedup; restart
provenance over a reopened store; adapter failure states; and a local
live e2e driving a real HTTP dispatch from a plan through an injected
adapter. The server-wrapper seam is proven against the migrated real
registry (plan → bridge → `resolveProviderRuntimeBinding` overrides),
and the full agent-runtime-server suite stays green (91/91).

## Scripts

```sh
pnpm build       # tsc → dist/
pnpm typecheck
pnpm test        # node --import tsx --test
```
