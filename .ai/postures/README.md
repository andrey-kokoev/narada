# CCC Posture Artifacts

This directory contains Coherence / Constructive / Counterweight (CCC) posture advisory signals.

## Files

- `schema.json` — JSON Schema for CCC posture validation.
- `current.json` — Active posture (or absent if none).
- `archive/` — Previous postures, archived on each update.

## Authority

- Posture is **advisory only**. No command requires it to function.
- Update requires `admin` authority (operator-only).
- Posture influences `narada task recommend` scoring but never hard-filters.

## Schema

See `schema.json` for the canonical shape. A posture captures six coherence coordinates:

| Coordinate | Readings |
|-----------|----------|
| `semantic_resolution` | stable, improving, degraded |
| `invariant_preservation` | strong, adequate, weak |
| `constructive_executability` | strong, improved, stalled, weak |
| `grounded_universalization` | healthy, premature, deferred |
| `authority_reviewability` | strong, overweighted, underweighted |
| `teleological_pressure` | focused, diffuse, needs_target |
