# Versioned Shape Resolver

## Purpose

A versioned shape resolver is the Narada-proper pattern for accepting historical records and current records at read boundaries, then producing one current canonical shape with explicit provenance and refusal semantics.

It exists because long-lived Narada records evolve. Older records may carry scalar fields, partial objects, or earlier schema versions. Rewriting all history is usually wrong; silently guessing at read time is also wrong.

## Core Semantics

A resolver takes:

- a schema family, such as `narada.agent_identity_ref`
- an input record or partial payload
- optional context required to lift older shapes
- a target schema version

It returns either:

- a canonical target-version object
- or an explicit resolution error explaining why lifting is ambiguous or impossible

The resolver must report how the target object was produced: copied fields, inferred fields, defaults, aliases, legacy fields consumed, and context dependencies.

## Shape

```ts
resolveVersionedShape({
  family: 'narada.agent_identity_ref',
  input,
  context,
  targetVersion: 'v2',
})
```

Specialized facades are encouraged when a family becomes central enough:

```ts
resolveAgentIdentityRef(input, context) -> AgentIdentityRefV2 | ResolutionError
```

The first concrete facade lives in `@narada2/agent-identity`:

```ts
resolveAgentIdentityRef(input, context) ->
  | { status: 'resolved', value: AgentIdentityRefV2, provenance: ResolutionProvenance[] }
  | { status: 'refused', code: string, message: string }
```

`normalizeAgentIdentityRefV2(input, context)` is available only as a nullable convenience wrapper for consumers that cannot yet carry refusal details. New migration-sensitive code should prefer the explicit resolver result.

## Optional Presence

Resolvers must handle optional presence deliberately. Common cases:

- current structured object is present
- older structured object is present
- legacy scalar field is present, such as `agent_id`
- no identity object is present, but surrounding context can provide scope
- no resolvable identity exists

Absence is not failure by itself. Unresolvable authority is failure.

## Context Discipline

Context is allowed, but it must be explicit. For example, legacy `resident` cannot be lifted into a Site-scoped identity without a known `site_id` from the launch result, session, database, or caller-supplied authority context.

Legacy `smart-scheduling.resident` can often be parsed into a candidate scope and local id, but it should still be validated against known Site aliases or launcher/roster authority when the result will drive admission or mutation.

## Agent Identity Example

Historical task records may contain:

```json
{ "agent_id": "smart-scheduling.resident" }
```

A current read model should expose:

```json
{
  "schema": "narada.agent_identity_ref.v2",
  "identity_scope": {
    "kind": "narada_site",
    "site_id": "smart-scheduling"
  },
  "local_agent_id": "resident",
  "role": "resident",
  "legacy_agent_id": "smart-scheduling.resident",
  "canonical_agent_id": "smart-scheduling.resident"
}
```

Future writes should write the structured identity. Historical string-only records may remain immutable and be lifted at read boundaries.

Current package contract:

- `AGENT_IDENTITY_REF_V2_SCHEMA = 'narada.agent_identity_ref.v2'`
- `buildAgentIdentityRefV2(input)` constructs a current structured ref from explicit scope and local id.
- `resolveAgentIdentityRef(input, context)` lifts current v2, legacy v1, and scalar `agent_id` forms into v2 or refuses ambiguity.
- Local scalar identities such as `resident` require context such as `{ site_id: 'sonar' }`.
- Prefixed scalar identities such as `smart-scheduling.resident` can be lifted into a candidate Site scope and should still be validated by callers before mutation/admission use.

## Versioning Policy

Schema versioning should make migrations observable:

- old records remain valid under their historical schema
- readers accept historical and current versions
- writers move to the newest authoritative schema after the migration gate
- compatibility aliases are accepted only at explicit boundaries
- ambiguity is refused, not guessed

## Non-Goals

A resolver is not a background migration by itself. It does not rewrite history unless a separate migration task explicitly does so.

A resolver is not display formatting. Display strings such as `smart-scheduling.resident` may be derived from the canonical object, but display derivation is downstream of authority resolution.

## Where This Applies

The pattern is expected to recur in:

- agent identity refs
- task lifecycle records
- session events and session indexes
- launch results
- artifacts and artifact references
- MCP payloads and envelope contracts
- Cloudflare projection payloads

## Completion Criteria For A Resolver

A resolver is complete when it has:

- fixtures for every accepted historical shape
- fixtures for ambiguous or insufficient context
- explicit provenance output
- explicit refusal output
- target-version validation
- writer-side tests proving new records are no longer written in legacy-only shape after the migration gate
