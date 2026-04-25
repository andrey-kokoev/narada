---
status: opened
depends_on: []
---

# Direct Action Helper

## Goal

<!-- Goal placeholder -->

## DAG

```mermaid
flowchart TD
  T764["764 Add direct command action helper"]
  T765["765 Migrate task authoring command registrations to action helper"]
  T766["766 Verify direct action helper migration"]

  T764 --> T765
  T765 --> T766
```

## Active Tasks

| # | Task | Name | Purpose |
|---|------|------|---------|
| 1 | 764 | Add direct command action helper | Reduce repeated commander action boilerplate while preserving the shared direct-command output/error boundary. |
| 2 | 765 | Migrate task authoring command registrations to action helper | Apply the direct command action helper to a bounded family of task authoring commands in main.ts. |
| 3 | 766 | Verify direct action helper migration | Prove the helper abstraction is useful without hiding command-specific semantics. |

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
