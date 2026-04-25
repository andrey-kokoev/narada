---
status: opened
depends_on: []
---

# CLI Boundary Library Runner

## Goal

<!-- Goal placeholder -->

## DAG

```mermaid
flowchart TD
  T739["739 Promote direct command runner to CLI boundary library"]
  T740["740 Add direct runner boundary tests"]
  T741["741 Migrate next direct task command batch"]

  T739 --> T740
  T740 --> T741
```

## Active Tasks

| # | Task | Name | Purpose |
|---|------|------|---------|
| 1 | 739 | Promote direct command runner to CLI boundary library | Move the direct command runner out of main.ts into the reusable CLI command-wrapper library. |
| 2 | 740 | Add direct runner boundary tests | Prove direct command boundary behavior without invoking real CLI processes. |
| 3 | 741 | Migrate next direct task command batch | Use the library runner for another bounded batch of task commands with duplicated result/error/exit handling. |

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
