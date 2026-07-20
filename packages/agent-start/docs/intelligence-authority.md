# Intelligence authority at launch

`agent-start` selects an operator surface and runtime substrate. It does not
select an inference provider, model provider, model, offering, route, endpoint,
credential, or thinking level.

For NARS operator surfaces, invocation selection is owned by the top-level
invokable-intelligence runtime. Each invocation is resolved from its intent,
the admitted Site catalog, destination-authorized materialized policy, and
runtime context. The default is policy in the catalog, not a launcher argument,
environment variable, or hardcoded model.

`--preflight-only` validates that the Site's canonical SQLite catalog exists and
contains admitted catalog records and resources. It deliberately does not pick
one provider or preflight one provider credential. Credential material is
resolved only from the exact credential locator in the selected runtime plan.

The removed `--intelligence-provider` option is refused. Legacy provider/model
selection variables are scrubbed from NARS child environments. API keys may
remain available as credential transport when an admitted catalog locator names
that exact environment reference; their presence never selects intelligence.
