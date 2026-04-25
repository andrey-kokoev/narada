---
status: closed
created: 2026-04-23
closed: 2026-04-23
owner: system
depends_on:
  - 492
---

# Task 493 - Sidecar Live-Operation Repository Template

## Context

`narada.sonar` appears to instantiate a missing template kind:

```text
sidecar live-operation repository template
```

This is not the operated system repo itself. It is an adjacent repository that:

- owns operation configuration and posture
- owns operator runbooks and evidence
- binds to neighboring system repo `.narada/` interfaces
- runs governed live work against external systems

The template kind is not yet formalized.

## Goal

Define the canonical template represented by:

```text
narada.sidecar-live-operation-repository-template
```

and map `narada.sonar` onto it.

## Read First

- `.ai/do-not-open/tasks/20260423-492-grammar-template-instantiation-ladder.md`
- `/home/andrey/src/narada.sonar/README.md`
- `/home/andrey/src/narada.sonar/RUNBOOK.md`
- `/home/andrey/src/narada.sonar/config/config.json`

## Required Work

1. Define the template.
   - What it contains
   - What it does not contain
   - What boundary it preserves relative to the neighboring system repo

2. Define its core components.
   - operation config
   - posture/policy
   - operator runbooks
   - evidence
   - mailbox/workflow-owned operational materials
   - tool-catalog bindings to neighboring repos

3. Clarify public/private split.

4. Map `narada.sonar` to the template concretely.

5. Produce a durable spec/decision artifact.

## Non-Goals

- Do not instantiate a generator in this task.
- Do not rename `narada.sonar`.
- Do not implement repo scaffolding yet.

## Acceptance Criteria

- [x] The sidecar live-operation repository template is defined.
- [x] Its boundary relative to a neighboring operated repo is explicit.
- [x] Its required contents are listed.
- [x] `narada.sonar` is mapped onto the template concretely.
- [x] A durable decision/spec artifact is created.
- [x] Verification evidence is recorded in this task.

## Execution Notes

Executed in single research pass. Key steps:

1. **Read prerequisite task 492** — established grammar/template/instantiation ladder context.
2. **Read `narada.sonar` structure** — `README.md`, `RUNBOOK.md`, `config/config.json`, `package.json`, `scripts/supervisor.sh`.
3. **Read neighboring system repo interface** — `sonar.cloud/.narada/tool-catalog.json` to verify Tool Locality Doctrine boundary.
4. **Read canonical docs** — `SEMANTICS.md`, `docs/concepts/runtime-usc-boundary.md`, `docs/product/bootstrap-contract.md`, `docs/product/site-bootstrap-contract.md`, `docs/concepts/system.md`.
5. **Produced durable decision artifact** at `.ai/decisions/20260423-493-sidecar-live-operation-repository-template.md` (20552 bytes).
6. **Updated `SEMANTICS.md`** — added cross-reference in `ops repo` section linking to the new template.

No code changes. No generator/scaffolding implemented (explicit non-goal). All acceptance criteria met.

## Verification

### Method
- Manual inspection of `narada.sonar` filesystem against template requirements.
- Cross-reference with `SEMANTICS.md` vocabulary and `runtime-usc-boundary.md` boundary rules.
- Verification of `sonar.cloud/.narada/tool-catalog.json` as the canonical neighbor interface.

### Evidence
- Durable decision artifact: `.ai/decisions/20260423-493-sidecar-live-operation-repository-template.md`
- Template formally named: `narada.sidecar-live-operation-repository-template`
- Position on grammar/template/instantiation ladder: §3 of decision
- Boundary diagram: §6 of decision
- Required contents table: §4 of decision
- Forbidden contents table: §5 of decision
- Public/private split: §8 of decision
- Concrete mapping of `narada.sonar`: §9 of decision
- Boundary verification against 8 criteria: §9.1 (all pass)
- Gap identification: §9.2 (4 minor/acceptable gaps identified)
