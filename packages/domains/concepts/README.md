# @narada-core/concepts

ConceptRegistry storage, validation, and lookup for Narada concepts.

## Role

This package owns the machine-readable ConceptRegistry embodiment: schema, loader, lookup, and registry validation.

Concept doctrine lives in `docs/concepts/concept-registry.md`. The package owns the durable records and the code that reads them.

## Storage

Canonical ConceptRecords live in `records/*.concept.json`.

## Query Surface

The Narada CLI exposes a human/operator-facing query surface via `narada concepts`.

## Installation

```bash
npm install @narada-core/concepts
# or
pnpm add @narada-core/concepts
```

## Related Packages

- `@narada-core/cli`: operator CLI query surface
- `@narada-core/charters`: adjacent policy/package pattern

## Runtime posture

Local build, typecheck, and tests are Bun-first. The `build:node`,
`typecheck:node`, and `test:node` scripts retain the Node compatibility paths.
