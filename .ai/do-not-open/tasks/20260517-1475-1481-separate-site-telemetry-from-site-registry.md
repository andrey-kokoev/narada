---
status: opened
depends_on: [1433, 1463, 1474]
---

# Separate Site Telemetry From Site Registry

## Goal

Commissioned chapter separate-site-telemetry-from-site-registry for tasks 1475-1481.

## DAG

```mermaid
flowchart TD
  T1475["1475 Define boundary between Site operational telemetry and Site Registry authority"]
  T1476["1476 Audit hosted registry docs and routes for telemetry-registry naming smear"]
  T1477["1477 Clarify docs and UI language for separate hosted service concerns"]
  T1478["1478 Specify Site Registry relation publication command and MCP surface"]
  T1479["1479 Implement dry-run Site Registry relation publication planner"]
  T1480["1480 Plan live Site Registry relation publication capability as a separate guarded follow-up"]
  T1481["1481 Notify narada-andrey of hosted telemetry and registry separation outcome"]
  T1475 --> T1476
  T1476 --> T1477
  T1477 --> T1478
  T1478 --> T1479
  T1479 --> T1480
  T1480 --> T1481
```

## Active Tasks

| # | Task | Name | Status |
|---|------|------|--------|
| 1 | 1475 | Define boundary between Site operational telemetry and Site Registry authority | opened |
| 2 | 1476 | Audit hosted registry docs and routes for telemetry-registry naming smear | opened |
| 3 | 1477 | Clarify docs and UI language for separate hosted service concerns | opened |
| 4 | 1478 | Specify Site Registry relation publication command and MCP surface | opened |
| 5 | 1479 | Implement dry-run Site Registry relation publication planner | opened |
| 6 | 1480 | Plan live Site Registry relation publication capability as a separate guarded follow-up | opened |
| 7 | 1481 | Notify narada-andrey of hosted telemetry and registry separation outcome | opened |

## Closure Criteria

- [ ] All commissioned tasks are closed or confirmed.
- [ ] Chapter evidence is complete.
