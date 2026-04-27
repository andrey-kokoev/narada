---
status: opened
amended_by: architect
amended_at: 2026-04-27T21:49:42.550Z
---

# Add Site mutation authority preflight

## Chapter

telos-aligned-doctrine-guards

## Goal

Add a preflight that tells an agent whether a planned mutation is happening at the declared Site authority locus before the command mutates task, inbox, Site, publication, or secret state.

## Context

Plural Embodiment, Singular Authority and Authority-Revealing Inversion both point to the same operational need: before mutation, identify whether this cwd/runtime is the authority locus or merely a read embodiment. This preflight is the reusable guard that later commands can call.

## Required Work

1. Define authority-locus preflight result states: authority locus, read-only embodiment, stale clone, unknown, and unsupported.
2. Inspect repo root, configured Site identity, branch/upstream posture, known Site registry data, and relevant local authority files.
3. Return bounded JSON/human output with mutation safety and exact next safe command.
4. Integrate v0 callers or document integration hooks for task lifecycle, inbox, publication, and secret commands.
5. Add tests for authority locus, stale/unknown locus, and read-only embodiment cases.

## Non-Goals

- Do not block every command before caller integration exists.
- Do not require network access for local preflight.
- Do not make stale read-only clones useless for inspection.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Preflight can classify the current cwd as authority locus, read-only embodiment, stale clone, or unknown.
- [ ] Preflight returns bounded JSON/human output with next safe command.
- [ ] Initial integration covers task lifecycle, inbox, and publication commands or clearly gates them for follow-up.
- [ ] Tests cover authority locus, stale/unknown locus, and read-only embodiment cases.
- [ ] `pnpm verify` passes.
