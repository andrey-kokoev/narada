---
status: opened
depends_on: []
---

# Windows Bootstrap Correctness

## Goal

Commissioned chapter windows-bootstrap-correctness for tasks 1113-1118.

## DAG

```mermaid
flowchart TD
  T1113["1113 Make Windows bootstrap CLI readiness cwd-independent"]
  T1114["1114 Correct Windows execution-surface readiness semantics"]
  T1115["1115 Split Windows tool command resolution from semantic readiness"]
  T1116["1116 Make paired Windows User/PC bootstrap two-phase safe"]
  T1117["1117 Clarify Windows adapter plan execution state"]
  T1118["1118 Align Windows bootstrap docs with owning-locus adapter commands"]
  T1113 --> T1114
  T1114 --> T1115
  T1115 --> T1116
  T1116 --> T1117
  T1117 --> T1118
```

## Active Tasks

| # | Task | Name | Status |
|---|------|------|--------|
| 1 | 1113 | Make Windows bootstrap CLI readiness cwd-independent | opened |
| 2 | 1114 | Correct Windows execution-surface readiness semantics | opened |
| 3 | 1115 | Split Windows tool command resolution from semantic readiness | opened |
| 4 | 1116 | Make paired Windows User/PC bootstrap two-phase safe | opened |
| 5 | 1117 | Clarify Windows adapter plan execution state | opened |
| 6 | 1118 | Align Windows bootstrap docs with owning-locus adapter commands | opened |

## Closure Criteria

- [ ] All commissioned tasks are closed or confirmed.
- [ ] Chapter evidence is complete.
