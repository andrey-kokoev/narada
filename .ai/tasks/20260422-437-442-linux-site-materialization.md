---
status: opened
depends_on: [429]
---

# Linux Site Materialization Chapter DAG

> Chapter plan for Tasks 437–442: Linux-backed Narada Site materializations.

---

## Task Sequence

```
429 (Linux chapter shaping)
  │
  ├── 437 — Linux Site Boundary / Design Contract
  │         Validates design doc into actionable contract.
  │         Produces: docs/deployment/linux-site-boundary-contract.md
  │
  ├── 438 — systemd Runner / Supervision Spike
  │         Implements Linux Cycle runner and systemd unit generator.
  │         Produces: packages/sites/linux/src/runner.ts, supervisor.ts
  │
  ├── 439 — Linux Credential and Path Binding Contract
  │         Implements credential resolver and path utilities.
  │         Produces: packages/sites/linux/src/credentials.ts, path-utils.ts
  │
  ├── 440 — Health / Trace / Operator-Loop Integration
  │         Wires health transitions, trace storage, and CLI commands.
  │         Produces: packages/sites/linux/src/observability.ts, CLI extensions
  │
  ├── 441 — Service Hardening and Recovery Fixture
  │         Adds stuck-cycle recovery, service hardening options, cron fallback.
  │         Produces: packages/sites/linux/src/recovery.ts, hardening configs
  │
  └── 442 — Linux Site Materialization Closure
            Reviews chapter for semantic coherence and generic abstraction decision.
            Produces: .ai/decisions/20260422-442-linux-site-closure.md
```

---

## Dependencies

| Task | Depends On |
|------|-----------|
| 437 | 429 |
| 438 | 437 |
| 439 | 437 |
| 440 | 438, 439 |
| 441 | 438, 440 |
| 442 | 437, 438, 439, 440, 441 |

---

## Non-Goals (Chapter-Wide)

- Do not create a generic Site abstraction.
- Do not implement container-hosted Linux Sites.
- Do not rename existing Windows, Cloudflare, or macOS packages.
- Do not require live Linux root/systemd access in unit tests.
- Do not use private machine paths or secrets.
- Do not create derivative `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.
