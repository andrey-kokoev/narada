# @narada2/concepts

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
npm install @narada2/concepts
# or
pnpm add @narada2/concepts
```

## Related Packages

- `@narada2/cli`: operator CLI query surface
- `@narada2/charters`: adjacent policy/package pattern
