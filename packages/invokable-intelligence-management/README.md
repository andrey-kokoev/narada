# @narada2/invokable-intelligence-management

Canonical application-service boundary for managing Narada's invokable-intelligence catalog, policy, access, topology, and cross-Site materializations.

`IntelligenceManagementService` owns the operation semantics. The typed library helpers, CLI, and host-agnostic MCP definitions are projections of that service and use the same:

- `narada.invokable-intelligence.management-result.v1` success/result envelope;
- `narada.invokable-intelligence.management-error.v1` structured refusal envelope;
- explicit Site, authority-locus, actor, principal-consent, destination, target, decision-time, and evidence context for mutations;
- registry and materialization adapters rather than direct SQLite/D1 writes;
- secret-bearing input/output refusal.

## Operations

Read operations cover canonical resources, model offerings, assertions, policies, catalog records, executable routes, topologies, authority statements, access records, materialized projections, and materialization audit events. All list operations are bounded and paged.

Mutation operations are:

- `admit-catalog-record` for a same-locus, validated canonical record;
- `materialize`, `refresh`, and `reject-materialization` through the dedicated provenance-preserving materialization store;
- `revoke-materialization` for origin-authorized revocation.

Direct foreign-locus catalog writes are refused. Materialization identity, transitions, evidence, and audit remain queryable through `inspect-materialization` and `explain-materialization`. Resolution explanation requires an explicit decision time; it never substitutes wall-clock time.

## CLI

The CLI accepts canonical payloads and mutation contexts only by JSON file reference, keeping raw payloads and secrets out of command arguments.

```sh
narada-intelligence --db .ai/intelligence.db list catalog-records --limit 50
narada-intelligence --db .ai/intelligence.db show catalog-record catalog-record:...
narada-intelligence --db .ai/intelligence.db validate

narada-intelligence --db .ai/intelligence.db --owning-site site:target \
  admit-catalog-record --record record.json --context mutation-context.json

narada-intelligence --db .ai/intelligence.db --owning-site site:target \
  materialize --envelope envelope.json --admission admission.json --context mutation-context.json

narada-intelligence --db .ai/intelligence.db explain-resolution \
  --intent intent.json --target site:target --user site:user --host site:host \
  --runtime node --time 2026-07-19T00:00:00Z
```

Use `narada-intelligence help` for the complete collection and operation list. Every canonical operation prints one management result or management error JSON document.

## MCP

`createManagementTools(session)` returns host-agnostic definitions named `intelligence_management_*`. Canonical records, intents, materialization envelopes, admissions, and revocations are accepted only through immutable input references resolved by the MCP host. Mutation context remains explicit and schema-labelled.

## Legacy migration

The package temporarily retains the dry-run-by-default provider-registry migration used for cutover. It factorizes legacy provider entries into canonical inference providers, model providers, models, offerings, adapters, credential locators, routes, access records, policies, and provenance-bearing catalog records. It does not grant legacy configuration runtime authority. The migration surface is removed after verified zero-consumer cutover.

User Site catalog bootstrap is first-use only: an empty registry is seeded once, and a registry that already contains catalog records is treated as ready without rewriting immutable records. Deliberate catalog changes belong to an explicit versioned migration, not to the launcher preflight path.

## Local readiness and explicit principal binding

Local launch readiness is a read-only doctor over the complete authority chain. It does not migrate a legacy provider registry, create a principal, infer identity from a name, or fabricate grants, consent, entitlements, quotas, budgets, governance, credentials, or route evidence. A service account or a present credential is not principal admission.

The launch context must carry an explicit User Site binding for the principal embodied by the runtime. The binding is an authority input, not a provider/model selection mechanism:

```json
{
  "schema": "narada.intelligence.launch_context.v1",
  "user_site_id": "site:andrey-user",
  "host_site_id": "site:andrey-pc",
  "principal_id": "principal:andrey",
  "principal_binding": {
    "schema": "narada.intelligence.principal_binding.v1",
    "actor": { "principal_id": "principal:andrey", "auth_type": "user-site-session" },
    "memberships": [{
      "registry": "site-roster",
      "site_id": "site:target",
      "role": "resident",
      "evidence_ref": "evidence:principal-membership"
    }],
    "evidence_refs": ["evidence:principal-membership"]
  }
}
```

Run the doctor against an explicit readiness context before launching:

```powershell
narada-intelligence --db C:\Users\Andrey\Narada\.ai\intelligence-registry.db local-readiness --context C:\path\readiness-context.json
```

The doctor reports each chain separately and returns `ready` only when catalog integrity, Site admission, principal admission and binding, route access, consent, credential, grant, entitlement, quota, budget, and governance checks all pass. `blocked` and `ambiguous` results are actionable refusals; no missing authority is synthesized.

When setup is required, use the explicit management admission operation with a complete, residual-free canonical seed and one mutation context per record:

```powershell
narada-intelligence --db C:\Users\Andrey\Narada\.ai\intelligence-registry.db admit-catalog-seed --seed canonical-seed.json --record-contexts record-contexts.json --context mutation-context.json
```

This mutation is a deliberate setup/management action. Launcher preflight never performs it. After setup, write or update the User Site launch context with the authoritative binding, rerun `local-readiness`, and only then launch the runtime. The launch context and readiness context may contain opaque evidence references, but never raw secrets.

The runtime and agent-start preflight use the same explicit binding and readiness rules. A legacy migration can preserve historical records for inspection, but it cannot make local intelligence launchable by itself; a refusal such as `intelligence_local_readiness_blocked` is the correct result until the full authority chain is explicitly admitted.

## Temporary compatibility read

`readLegacyCompatibilityProjection` serves only the exact
`carrier.provider_registry` key. It reconstructs the legacy
`narada.carrier.provider_registry.v1` shape from the latest admitted canonical
catalog records and never reads provider/model selection environment variables.
Every read requires a call site, configuration key, migration owner, and a
mandatory telemetry sink. The returned envelope is deeply frozen, deprecated,
and read-only; unknown keys, writes, ambiguous state, and uninitialized
registries are refused. Telemetry is bounded to 64 canonical record IDs and
never includes credential locator references or secret values.

The projection is removed only after task #2219 records an admitted
repository-wide zero-consumer inventory and accepted local and Cloudflare
cutover evidence.

## Verification

```sh
pnpm --filter @narada2/invokable-intelligence-management typecheck
pnpm --filter @narada2/invokable-intelligence-management test
pnpm --filter @narada2/invokable-intelligence-management build
```

The focused suite covers SQLite and D1 parity, library/CLI/MCP semantics, list/show/validate/mutate/explain, every materialization transition, replay idempotency, cross-locus refusal, explicit time, secret refusal, and evidence/audit readback.
