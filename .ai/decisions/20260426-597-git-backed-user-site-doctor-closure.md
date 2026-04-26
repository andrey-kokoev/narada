---
closes_tasks: [597]
decided_at: 2026-04-26
decided_by: codex
reviewed_by: codex
governance: direct implementation
---

# Decision 597 — Git-Backed User Site Doctor Closure

## Status

Chapter 597 is closed. `narada sites doctor` now treats `git_backed` as an inspectable User Site posture.

## Produced

- The doctor validates that a `git_backed` Site root is a Git work tree.
- It checks upstream branch tracking, clean/dirty working tree state, and origin URL against `sync.git.remote_url`.
- It reports configured remote status and verifies private GitHub repo reachability when GitHub metadata is present and active.
- Product docs name the Git-backed doctor checks.

## Verification

The live `andrey-user` Site at `C:\Users\Andrey\Narada` passes all Site doctor checks, including Git-backed checks for the private GitHub repo `andrey-kokoev/narada-andrey`.
