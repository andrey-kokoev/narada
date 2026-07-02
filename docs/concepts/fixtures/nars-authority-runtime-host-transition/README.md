# NARS Authority Runtime Host Transition Fixtures

These fixtures support [`nars-authority-runtime-host-transition.md`](../../nars-authority-runtime-host-transition.md).

They are concept-level contract fixtures, not yet package-owned runtime validators. The implementation chapter should either promote them into a package test surface or keep package tests pointed at these files with an explicit docs-contract dependency.

## Files

- `schema.transition-record.target.json` defines the target transition record shape.
- `schema.refusal.target.json` defines the target refusal shape.
- `transition.proposed.valid.json`, `transition.source-draining.valid.json`, `transition.target-active.valid.json`, and `transition.aborted.valid.json` cover representative valid states.
- `invalid.split-authority.json`, `invalid.missing-epoch.json`, `invalid.missing-fencing.json`, and `invalid.projection-cache-authority.json` document configuration shapes that must be refused.
- `refusal.active-turn-in-progress.json` and `refusal.mcp-fabric-incompatible.json` document structured refusal output.

## Contract Boundary

The fixtures encode these invariants:

1. Authority is held by one runtime epoch at a time.
2. Source and target epochs are explicit.
3. Fencing posture is explicit before target write admission.
4. Projection stores are never accepted as authority runtimes.
5. Refusals name the violated invariant and the operator repair action.

