---
closes_tasks: [596]
decided_at: 2026-04-26
decided_by: codex
reviewed_by: codex
governance: direct implementation
---

# Decision 596 — Windows User Site Doctor Closure

## Status

Chapter 596 is closed. Narada now has a Windows User Site doctor surface for validating a materialized User Site before treating it as a coherent operator root.

## Produced

- `narada sites doctor <site-id>` validates root existence, config identity, authority locus, User-locus root policy, sync posture, locus-aware registry DB, registry entry/root match, and `.ai/tasks/task-lifecycle.db`.
- The command returns a non-zero exit code when hard validation fails.
- Windows Site docs identify `narada sites doctor <site-id>` as the validation surface for User Site roots.

## Verification

Direct command smoke against `andrey-user` at `C:\Users\Andrey\Narada` passed with all doctor checks reporting `pass`.
