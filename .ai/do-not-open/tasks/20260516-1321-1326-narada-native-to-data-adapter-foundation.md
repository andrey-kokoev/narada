---
status: opened
depends_on: [1307]
---

# Narada-native To-data Adapter Foundation

## Goal

Commissioned chapter narada-native-to-data-adapter-foundation for tasks 1321-1326.

## DAG

```mermaid
flowchart TD
  T1321["1321 Define Narada-native to-data packet contract"]
  T1322["1322 Implement task and work-next to-data readers"]
  T1323["1323 Implement inbox summary to-data reader"]
  T1324["1324 Implement readiness and evidence reference readers"]
  T1325["1325 Implement bounded local file excerpt reader"]
  T1326["1326 Add integrated to-data adapter reconstruction proof"]
  T1321 --> T1322
  T1322 --> T1323
  T1323 --> T1324
  T1324 --> T1325
  T1325 --> T1326
```

## Active Tasks

| # | Task | Name | Status |
|---|------|------|--------|
| 1 | 1321 | Define Narada-native to-data packet contract | opened |
| 2 | 1322 | Implement task and work-next to-data readers | opened |
| 3 | 1323 | Implement inbox summary to-data reader | opened |
| 4 | 1324 | Implement readiness and evidence reference readers | opened |
| 5 | 1325 | Implement bounded local file excerpt reader | opened |
| 6 | 1326 | Add integrated to-data adapter reconstruction proof | opened |

## Closure Criteria

- [ ] All commissioned tasks are closed or confirmed.
- [ ] Chapter evidence is complete.
