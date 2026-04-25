---
status: opened
depends_on: []
---

# Roster Runner Migration

## Goal

<!-- Goal placeholder -->

## DAG

```mermaid
flowchart TD
  T751["751 Migrate roster observation and assignment commands"]
  T752["752 Migrate roster review and completion commands"]
  T753["753 Verify roster boundary migration"]

  T751 --> T752
  T752 --> T753
```

## Active Tasks

| # | Task | Name | Purpose |
|---|------|------|---------|
| 1 | 751 | Migrate roster observation and assignment commands | Route roster show and assign through the shared direct command boundary. |
| 2 | 752 | Migrate roster review and completion commands | Route roster review, done, and idle through the shared direct command boundary. |
| 3 | 753 | Verify roster boundary migration | Prove roster command migration remains build-clean and operational. |

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
