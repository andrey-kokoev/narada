---
status: opened
depends_on: [1309, 1321]
---

# Narada-native Capability Consent Binding

## Goal

Commissioned chapter narada-native-capability-consent-binding for tasks 1333-1338.

## DAG

```mermaid
flowchart TD
  T1333["1333 Define carrier capability projection schema"]
  T1334["1334 Implement provider capability projection lookup"]
  T1335["1335 Implement data-read capability projection lookup"]
  T1336["1336 Wire projections into session start and supervisor doctor"]
  T1337["1337 Integrate projection checks into provider and to-data execution"]
  T1338["1338 Add capability-consent reconstruction proof"]
  T1333 --> T1334
  T1334 --> T1335
  T1335 --> T1336
  T1336 --> T1337
  T1337 --> T1338
```

## Active Tasks

| # | Task | Name | Status |
|---|------|------|--------|
| 1 | 1333 | Define carrier capability projection schema | opened |
| 2 | 1334 | Implement provider capability projection lookup | opened |
| 3 | 1335 | Implement data-read capability projection lookup | opened |
| 4 | 1336 | Wire projections into session start and supervisor doctor | opened |
| 5 | 1337 | Integrate projection checks into provider and to-data execution | opened |
| 6 | 1338 | Add capability-consent reconstruction proof | opened |

## Closure Criteria

- [ ] All commissioned tasks are closed or confirmed.
- [ ] Chapter evidence is complete.
