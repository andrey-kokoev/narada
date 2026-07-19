# @narada2/invokable-intelligence-management

Governed intelligence catalog and policy management, plus the legacy
provider-registry migration (#2183). Ships the `narada-intelligence` CLI
and a host-agnostic MCP tool surface over the registry (#2181) and
resolver (#2182).

## Migration (legacy → canonical)

`buildMigrationPlan` untangles the legacy
`narada.carrier.provider_registry.v1` shape — which conflates inference
provider, model provider, model, adapter, credentials, and defaults —
into canonical records:

- one `InferenceProvider`, `InferenceEndpoint`, and (shared)
  `InferenceAdapter` per legacy provider id;
- `ModelProvider` per vendor and one `Model` per available model, related
  explicitly;
- `CredentialLocator` per provider (`env` store for api_key_secret,
  `none` for codex local subscription) held by the Host Site — never any
  secret material;
- capability assertions for support state and thinking levels, stamped
  `provenance.source = "migration"` with the source reference;
- a target-Site `defaults` policy carrying `default_provider`,
  per-provider `default_model`, and cognition-tier defaults — as policy,
  not environment variables.

Guarantees:

- **Dry-run by default.** `dryRunMigration` diffs the deterministic plan
  against store state (`add` / `update` / `unchanged`) without mutating.
- **Idempotent apply.** The CLI derives provenance time from the source
  file's mtime, so re-running over unchanged content replans byte
  identically and applies zero writes.
- **No fabricated feasibility.** Migration never asserts credential
  feasibility — that belongs to host probes, admitted per locus.

## Operations

`listResources` / `showResource` (with derived relations) /
`listAssertions` / `listPolicies` / `validateStore` (full contract +
reference integrity) / `explainResolution` (resolve + operator-readable
provenance lines).

Writes are locus-checked against the session's owning Site:
`writeRecord` rejects cross-locus writes (`cross-locus-write`);
`materializeRecord` is the explicit authorized materialization operation
and stamps provenance so cross-locus effects are auditable.

## Compatibility projection (temporary)

`projectLegacyRegistry` renders registry state back into the legacy
provider-registry shape for unmigrated consumers. Read-only, covered by
tests, and removed in #2186 once consumers reach zero. Do not extend it.

## CLI

```sh
narada-intelligence --db .ai/intelligence-registry.db validate
narada-intelligence list resources --kind model
narada-intelligence show model:openai-api-gpt-5.6-sol
narada-intelligence migrate --registry provider-registry.json \
  --target site:X --user site:Y --host site:Z            # dry-run
narada-intelligence migrate ... --apply                  # writes
narada-intelligence explain --intent intent.json --target ... --user ... --host ...
narada-intelligence compat                               # legacy projection
```

## MCP surface

`createManagementTools(session)` returns host-agnostic tool definitions
(`intelligence_list_resources`, `intelligence_show_resource`,
`intelligence_list_assertions`, `intelligence_list_policies`,
`intelligence_validate_store`, `intelligence_explain_resolution`,
`intelligence_compat_projection`) with structured handlers and
`{ error: { code, message } }` failure shape. Any MCP host can register
them; errors are data, not throws.

## Scripts

```sh
pnpm build       # tsc → dist/
pnpm typecheck
pnpm test        # node --import tsx --test
```
