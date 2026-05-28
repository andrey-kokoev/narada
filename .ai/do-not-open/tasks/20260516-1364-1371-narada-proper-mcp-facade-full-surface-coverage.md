---
status: opened
depends_on: []
---

# Narada Proper MCP Facade Full Surface Coverage

## Goal

Commissioned chapter narada-proper-mcp-facade-full-surface-coverage for tasks 1364-1371.

## DAG

```mermaid
flowchart TD
  T1364["1364 Audit narada-andrey MCP lift evidence freshness"]
  T1365["1365 Map Narada proper MCP package coverage against command surfaces"]
  T1366["1366 Add Narada proper MCP surface registry contract"]
  T1367["1367 Implement shared MCP payload and output ref primitives"]
  T1368["1368 Expand Narada proper task lifecycle MCP coverage"]
  T1369["1369 Lift filesystem test and shell MCP contracts into Narada proper packages"]
  T1370["1370 Add Site probe connectivity identity and lift advisory MCP coverage"]
  T1371["1371 Generate carrier MCP config and quarantine legacy facade"]
  T1364 --> T1365
  T1365 --> T1366
  T1366 --> T1367
  T1367 --> T1368
  T1368 --> T1369
  T1369 --> T1370
  T1370 --> T1371
```

## Active Tasks

| # | Task | Name | Status |
|---|------|------|--------|
| 1 | 1364 | Audit narada-andrey MCP lift evidence freshness | opened |
| 2 | 1365 | Map Narada proper MCP package coverage against command surfaces | opened |
| 3 | 1366 | Add Narada proper MCP surface registry contract | opened |
| 4 | 1367 | Implement shared MCP payload and output ref primitives | opened |
| 5 | 1368 | Expand Narada proper task lifecycle MCP coverage | opened |
| 6 | 1369 | Lift filesystem test and shell MCP contracts into Narada proper packages | opened |
| 7 | 1370 | Add Site probe connectivity identity and lift advisory MCP coverage | opened |
| 8 | 1371 | Generate carrier MCP config and quarantine legacy facade | opened |

## Closure Criteria

- [ ] All commissioned tasks are closed or confirmed.
- [ ] Chapter evidence is complete.
