---
status: opened
---

# Add delegated CLI embodiment health preflight

## Chapter

site-embodiments

## Goal

Make Site authority and inbox preflight distinguish runtime health from delegated Narada CLI embodiment health for downstream Sites such as Staccato.

## Context

This task was created from Windows embodiment inbox envelope `env_39d5b527-e7c6-4e10-b240-de53f1fbb74f`, sourced from `/mnt/d/code/narada/.ai/inbox-drop/20260428-003-staccato-runtime-cli-dependency-friction.md`.

The reported failure: Staccato runtime state is inspectable and mostly healthy, but its operator command surface delegates to `D:/code/narada/packages/layers/cli/dist/main.js`, which fails to load because `@narada2/task-governance` is missing from that Windows CLI embodiment. This is a Site embodiment health issue: runtime substrate health and delegated operator CLI health are different surfaces.

## Required Work

1. Inspect the existing Site authority preflight, inbox doctor, and Site doctor surfaces for where delegated CLI embodiment health belongs.
2. Add a bounded diagnostic for configured CLI embodiment loadability or missing dependency/module diagnostics.
3. Ensure output distinguishes runtime substrate health from operator command-surface health.
4. Add focused tests with a broken delegated CLI embodiment fixture.
5. Record whether Staccato needs a separate Site-local remediation after Narada proper exposes the diagnostic.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Preflight reports configured CLI embodiment loadability or missing dependency diagnostics
- [ ] Docs distinguish runtime substrate health from operator command-surface health
- [ ] Focused tests cover broken delegated CLI embodiment reporting
- [ ] Source inbox envelope is handled through governed archive action
- [ ] pnpm verify passes
