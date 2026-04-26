---
closes_tasks: [598]
decided_at: 2026-04-26
decided_by: codex
reviewed_by: codex
governance: direct implementation
---

# Decision 598 — PC-Locus Registry Registration Closure

## Status

Chapter 598 is closed. Windows Site initialization now registers native and WSL Sites in the registry for their declared authority locus.

## Produced

- `sites init --authority-locus pc` uses the PC-locus registry path.
- Native PC-locus Sites register in `%ProgramData%\Narada\registry.db`.
- A CLI regression test covers the PC-locus registry path.
- Docs clarify User-locus vs PC-locus registry locations.

## Verification

The live PC Site `desktop-sunroom-2` at `C:\ProgramData\Narada\sites\pc\desktop-sunroom-2` passes `narada sites doctor --authority-locus pc` after initialization.
