---
status: opened
depends_on: []
---

# Store Scoped Command Boundary

## Goal

<!-- Goal placeholder -->

## DAG

```mermaid
flowchart TD
  T745["745 Introduce store-scoped direct command runner"]
  T746["746 Migrate store-owning lifecycle commands"]
  T747["747 Verify store-scoped command boundary"]

  T745 --> T746
  T746 --> T747
```

## Active Tasks

| # | Task | Name | Purpose |
|---|------|------|---------|
| 1 | 745 | Introduce store-scoped direct command runner | Centralize resource lifetime for direct CLI commands that need a task lifecycle store. |
| 2 | 746 | Migrate store-owning lifecycle commands | Remove store lifetime boilerplate from direct task review, close, and dispatch actions. |
| 3 | 747 | Verify store-scoped command boundary | Prove the new store-scoped boundary works and chapter artifacts remain clean. |

## CCC Posture

| Coordinate | Evidenced State | Projected State If Chapter Verifies | Pressure Path | Evidence Required |
|------------|-----------------|-------------------------------------|---------------|-------------------|
| semantic_resolution | 0 | 0 | TBD | TBD |
| invariant_preservation | 0 | 0 | TBD | TBD |
| constructive_executability | 0 | 0 | TBD | TBD |
| grounded_universalization | 0 | 0 | TBD | TBD |
| authority_reviewability | 0 | 0 | TBD | TBD |
| teleological_pressure | 0 | 0 | TBD | TBD |

## Deferred Work

| Deferred Capability | Rationale |
|---------------------|-----------|
| **TBD** | TBD |

## Closure Criteria

- [ ] All tasks in this chapter are closed or confirmed.
- [ ] Semantic drift check passes.
- [ ] Gap table produced.
- [ ] CCC posture recorded.
