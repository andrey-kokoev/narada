---
status: opened
depends_on: []
---

# Simple Task Command Runner Migration

## Goal

<!-- Goal placeholder -->

## DAG

```mermaid
flowchart TD
  T742["742 Migrate task lint to shared command runner"]
  T743["743 Migrate task list to shared command runner"]
  T744["744 Migrate task read to shared command runner"]

  T742 --> T743
  T743 --> T744
```

## Active Tasks

| # | Task | Name | Purpose |
|---|------|------|---------|
| 1 | 742 | Migrate task lint to shared command runner | Route task lint through the reusable direct CLI command boundary. |
| 2 | 743 | Migrate task list to shared command runner | Route task list through the reusable direct CLI command boundary. |
| 3 | 744 | Migrate task read to shared command runner | Route task read through the reusable direct CLI command boundary. |

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
