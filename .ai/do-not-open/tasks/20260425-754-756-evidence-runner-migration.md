---
status: opened
depends_on: []
---

# Evidence Runner Migration

## Goal

<!-- Goal placeholder -->

## DAG

```mermaid
flowchart TD
  T754["754 Migrate evidence inspection and listing"]
  T755["755 Migrate evidence mutation commands"]
  T756["756 Verify evidence boundary migration"]

  T754 --> T755
  T755 --> T756
```

## Active Tasks

| # | Task | Name | Purpose |
|---|------|------|---------|
| 1 | 754 | Migrate evidence inspection and listing | Route task evidence inspect/list/assert-complete through the shared direct command boundary. |
| 2 | 755 | Migrate evidence mutation commands | Route evidence prove-criteria and admit through the shared direct command boundary. |
| 3 | 756 | Verify evidence boundary migration | Prove evidence command migration remains build-clean and operational. |

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
