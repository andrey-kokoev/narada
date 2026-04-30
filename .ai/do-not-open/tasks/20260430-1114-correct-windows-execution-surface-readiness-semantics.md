---
status: opened
---
# Correct Windows execution-surface readiness semantics

## Chapter

/home/andrey/src/narada/.ai/do-not-open/tasks/20260430-1113-1118-windows-bootstrap-correctness.md

## Goal

Make Windows bootstrap distinguish WSL-assisted, native Windows, and not-applicable path translation postures without false warnings.

## Context

Inbox observation env_ffeed7c4 reports that `wsl_path_translation` warns whenever execution surface is not `wsl_assisted`, even for native Windows execution where WSL translation is not required.

## Required Work

1. Inventory execution surface values emitted by `bootstrap-windows`.
2. Define readiness states for WSL-assisted, native Windows, and unsupported/unknown execution surfaces.
3. Change `wsl_path_translation` to pass, warn, or not_applicable based on actual execution surface semantics.
4. Add focused tests for wsl_assisted, native_windows, explicit override, and unknown execution surface.

## Non-Goals

- Do not require WSL for native Windows onboarding.
- Do not remove WSL path diagnostics when WSL is actually the selected bridge.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Native Windows execution does not warn about missing WSL path translation
- [ ] WSL-assisted execution still validates path translation and reports actionable blockers
- [ ] Unknown or unsupported execution surfaces produce bounded warnings with unblock guidance
- [ ] Tests cover native, WSL-assisted, override, and unknown postures
