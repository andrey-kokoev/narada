---
status: closed
closed_at: 2026-04-26T15:42:28.7858563-05:00
closed_by: codex
---

# Chapter DAG — Windows User Site Doctor (Tasks 596–596)

> Self-standing chapter for validating the Windows User Site as a coherent local root.

---

## Chapter Goal

Give the User Site an executable local trust check before future work treats it as a durable operator surface.

---

## Task DAG

```mermaid
graph TD
    596[Task 596]
```

| Task | Title | Purpose |
|------|-------|---------|
| **596** | Validate Windows User Site root posture and lifecycle | Add `narada sites doctor <site-id>` for User Site root policy, config identity, sync posture, registry, and task lifecycle schema |

---

## Closure

Implemented and verified against `C:\Users\Andrey\Narada` / `andrey-user`. The doctor reported `passed` with all checks passing.
