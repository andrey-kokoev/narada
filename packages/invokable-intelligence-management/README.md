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

## Verification

```sh
pnpm --filter @narada2/invokable-intelligence-management typecheck
pnpm --filter @narada2/invokable-intelligence-management test
pnpm --filter @narada2/invokable-intelligence-management build
```

The focused suite covers SQLite and D1 parity, library/CLI/MCP semantics, list/show/validate/mutate/explain, every materialization transition, replay idempotency, cross-locus refusal, explicit time, secret refusal, and evidence/audit readback.
