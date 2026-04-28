---
status: opened
depends_on: [1047]
---

# Task 1048 — Verify role bootstrap doctrine, generation, and CLI surface

## Execution Mode

Proceed directly. This is a narrow corrective task; use focused edits only.

## Assignment

<!-- Assignment placeholder -->

## Required Reading

- packages/layers/cli/test/commands/sites-init.test.ts
- packages/layers/cli/test/commands/sites-client-bootstrap.test.ts
- packages/layers/cli/test/commands/sites-project-bootstrap.test.ts
- packages/layers/cli/test/commands/resume.test.ts
- docs/concepts/inhabited-evolution.md

## Context

The role split should not remain prose-only. Tests should prove that Site bootstrap emits both role contracts, governance coordinates expose the role shape, and the CLI inspection surface is bounded and rejects non-admitted roles.

## Goal

Add focused tests and evidence for the role-specific AI thread bootstrap chapter.

## Required Work

1. Add or update focused tests for generated AGENTS.md role sections in relevant Site bootstrap paths.
2. Add or update tests for Site governance role contract shape if implemented.
3. Add tests for role bootstrap CLI output for architect and builder and rejection of unadmitted roles.
4. Run focused tests plus pnpm verify after exporting lifecycle snapshot.
5. Record residuals if full verification is blocked by unrelated dirty work.

## Non-Goals

- Do not expand the role set
- Do not test speculative future roles

## Crossing Regime

<!--
Fill in ONLY if this task introduces a new durable authority-changing boundary.
If the task uses an existing canonical crossing (e.g., Source → Fact, Decision → Intent),
leave this section commented and delete it before closing.

See SEMANTICS.md §2.15 and Task 495 for the declaration contract.

- source_zone:
- destination_zone:
- authority_owner:
- admissibility_regime:
- crossing_artifact:
- confirmation_rule:
- anti_collapse_invariant:
-->

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Focused tests cover Architect and Builder generated bootstrap sections
- [ ] Focused tests cover the read-only bootstrap command for both roles and unknown-role rejection
- [ ] pnpm verify passes or any blocker is recorded with exact unrelated cause
- [ ] Chapter tasks are evidence-complete before closure
