---
status: closed
closed_at: 2026-05-01T20:39:47.916Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Add Site config doctrine imports for external constraint regimes

## Chapter

site-governance-constraint-imports

## Goal

Allow Site config to declare admitted external doctrine or regulatory regimes without embedding their interpretation directly in config.

## Context

Inbox envelope env_36f69b06-55a7-4f28-9640-f2d3daabc8f3 proposes Site-level support for governed doctrine imports such as FDA QMSR / 21 CFR Part 820. The Site should declare admission, scope, binding posture, and inheritance rules while doctrine, KG, or KB stores interpretation and mappings.

## Required Work

Add or specify a Site config schema concept such as doctrine_imports or governing_regimes. Include fields for id, kind, authority, citation/source, effective date or version, binding scope, applicability predicates, inheritance behavior, and binding posture. Document the distinction between importing a regime and interpreting it. Show an example where FDA QMSR is admitted at Site level and inherited by a CAPA Operation or task lifecycle gate without encoding the whole regulation as config prose.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

1. Added `SiteDoctrineImportSchema` and `governance.doctrine_imports` to Site governance coordinates.
2. Added default `doctrine_imports: []` to generated client/project Site config.
3. Documented doctrine imports in `docs/product/site-governance-coordinates.md`, including an FDA QMSR / 21 CFR Part 820 CAPA example.
4. Preserved the separation: Site config declares binding coordinates; doctrine/KG/KB interprets obligations; task/runtime surfaces project gates.
5. Added focused validation coverage for doctrine imports and updated bootstrap tests to assert the new default coordinate.
6. Aligned stale client-bootstrap assertions with the current admitted Observer role contract exposed by generated Site AGENTS.md.

## Verification

- Control-plane Site manifest test: `pnpm --filter @narada2/control-plane exec vitest run test/unit/config/site-manifest.test.ts --pool=forks --no-file-parallelism --maxWorkers=1 --minWorkers=1 --testTimeout=120000 --hookTimeout=120000` passed.
- CLI Site bootstrap tests: `pnpm --filter @narada2/cli exec vitest run test/commands/sites-project-bootstrap.test.ts test/commands/sites-client-bootstrap.test.ts --pool=forks --no-file-parallelism --maxWorkers=1 --minWorkers=1 --testTimeout=120000 --hookTimeout=120000` passed.
- Typecheck: `pnpm --filter @narada2/control-plane typecheck` and `pnpm --filter @narada2/cli typecheck` passed.
- Build: `pnpm --filter @narada2/control-plane build` and `pnpm --filter @narada2/cli build` passed.
- TIZ verification: `run_1777667906250_9pr6s6` passed with exit code 0.

## Acceptance Criteria

- [x] Site config can declare external doctrine/regulatory regimes with source, authority, version/effective date, scope, applicability, inheritance, and binding posture.
- [x] Documentation distinguishes regime import from interpretation and process mapping.
- [x] Operation/task machinery implications are described for evidence, review, approval, traceability, and closure gates.
- [x] An example shows FDA QMSR admitted at Site level and inherited by a CAPA Operation.
- [x] The design preserves Narada authority separation: config declares binding, doctrine/KG/KB interprets obligations, and task/runtime surfaces project applicable gates.
