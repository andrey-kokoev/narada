---
status: opened
depends_on: [1311, 1327]
---

# Narada-native Governed Effect Handoff

## Goal

Commissioned chapter narada-native-governed-effect-handoff for tasks 1345-1350.

## DAG

```mermaid
flowchart TD
  T1345["1345 Define generic carrier action packet envelope"]
  T1346["1346 Implement task-report handoff family"]
  T1347["1347 Implement inbox handoff family"]
  T1348["1348 Implement command intent handoff family"]
  T1349["1349 Implement outbox and publication handoff families"]
  T1350["1350 Add handoff reconstruction and doctor integration"]
  T1345 --> T1346
  T1346 --> T1347
  T1347 --> T1348
  T1348 --> T1349
  T1349 --> T1350
```

## Active Tasks

| # | Task | Name | Status |
|---|------|------|--------|
| 1 | 1345 | Define generic carrier action packet envelope | opened |
| 2 | 1346 | Implement task-report handoff family | opened |
| 3 | 1347 | Implement inbox handoff family | opened |
| 4 | 1348 | Implement command intent handoff family | opened |
| 5 | 1349 | Implement outbox and publication handoff families | opened |
| 6 | 1350 | Add handoff reconstruction and doctor integration | opened |

## Closure Criteria

- [ ] All commissioned tasks are closed or confirmed.
- [ ] Chapter evidence is complete.
