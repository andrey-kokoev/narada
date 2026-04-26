---
status: closed
closed_at: 2026-04-26T16:27:05.1557503-05:00
closed_by: codex
---

# Chapter DAG — PC Locus Registry Registration (Tasks 598–598)

> Self-standing chapter for fixing PC-locus Site registry registration.

---

## Chapter Goal

Ensure `sites init --authority-locus pc` registers in the PC-locus registry that `sites doctor --authority-locus pc` validates.

---

## Task DAG

```mermaid
graph TD
    598[Task 598]
```

| Task | Title | Purpose |
|------|-------|---------|
| **598** | Register PC locus Sites in PC registry | Register Windows Sites in the authority-locus registry during initialization |

---

## Closure

Implemented and verified against the live PC Site at `C:\ProgramData\Narada\sites\pc\desktop-sunroom-2`. PC-locus doctor now passes after initialization creates `C:\ProgramData\Narada\registry.db`.
