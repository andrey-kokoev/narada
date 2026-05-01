---
status: opened
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

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Site config can declare external doctrine/regulatory regimes with source, authority, version/effective date, scope, applicability, inheritance, and binding posture.
- [ ] Documentation distinguishes regime import from interpretation and process mapping.
- [ ] Operation/task machinery implications are described for evidence, review, approval, traceability, and closure gates.
- [ ] An example shows FDA QMSR admitted at Site level and inherited by a CAPA Operation.
- [ ] The design preserves Narada authority separation: config declares binding, doctrine/KG/KB interprets obligations, and task/runtime surfaces project applicable gates.
