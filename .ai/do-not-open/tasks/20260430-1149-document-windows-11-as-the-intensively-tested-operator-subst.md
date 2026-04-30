---
status: claimed
---

# Document Windows 11 as the intensively tested Operator substrate

## Goal

Make potential Operators aware that Narada's current operator-surface and inhabited-agent workflows are intensively tested on Windows 11, while other substrates have weaker evidence.

## Context

Operator asked whether potential Operator-facing documentation should state that the substrate intensively tested is only Windows 11. The answer is yes: this is an evidence boundary, not a claim that Narada is Windows-only.

## Required Work

1. Inventory first-time Operator onboarding, Site bootstrap, and operator-surface documentation where substrate support expectations are set. 2. Add a clear evidence-boundary statement: Windows 11 with WSL, Windows Terminal, PowerShell carrier scripts, local Git, and Node tooling is the intensively exercised substrate for operator-surface binding, window labels, focused input, PC-locus messaging, and multi-agent ergonomics. 3. State that core CLI/docs/task flows may work elsewhere, but non-Windows substrates are not yet equally proven for operator-surface inhabitation. 4. Avoid marketing overclaim: do not describe Narada as Windows-only, and do not imply parity for macOS/Linux operator-surface flows without evidence. 5. Add or update any quickstart/bootstrap wording that should guide first-time Operators toward the proven path first.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] First-time Operator-facing docs state the Windows 11 evidence boundary plainly.
- [ ] Site bootstrap or onboarding docs distinguish core CLI portability from operator-surface substrate maturity.
- [ ] Operator-surface docs mention Windows 11/WSL/Windows Terminal/PowerShell carrier scripts as the currently proven path.
- [ ] No documentation claims unsupported substrate parity or Windows-only product identity.
