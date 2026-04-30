---
status: closed
amended_by: architect
amended_at: 2026-04-30T14:08:30.542Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-30T14:09:48.496Z
criteria_proof_verification:
  state: unbound
  rationale: Focused tests, typecheck/build, and live dry-run prove target-locus next_command, target Site-local registry resolution warning/classification, and no caller-registry mutation for external Site invocation.
closed_at: 2026-04-30T14:10:19.835Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Prevent cross-Site operator-surface registry mutation during onboarding

## Goal

Prevent Site onboarding commands run from one locus from mutating another Site's operator-surface registry by accident.

## Context

Inbox incident `env_7124588f-fa33-4bdd-8a97-225899a2a07c` reports a client Site onboarding capability gap: an operator-surface identity/registry command was invoked from Narada proper while targeting a client Site. The command path made it too easy for the caller's cwd or Narada proper registry to become the mutation locus instead of the target Site's registry.

This violates Plural Embodiment, Singular Authority: the shell/clone that runs the command is only an embodiment. The target Site registry must be explicit, visible, and protected from accidental cross-Site mutation.

## Required Work

1. Trace current `sites doctor`, `site-readiness`, and `operator-surface agent instantiate` behavior when invoked from Narada proper against an external/client Site.
2. Ensure any next command emitted for target Site-local operator-surface mutation includes the target locus explicitly, including `--site` and/or `--cwd` as appropriate.
3. Make `operator-surface agent instantiate` fail closed or emit a clear warning when `--site`, `--cwd`, and the resolved registry path disagree.
4. Add dry-run or status output that classifies the registry mutation locus as target_site_local, caller_context, or ambiguous.
5. Add focused regression tests for invoking a client Site onboarding command from Narada proper and proving the client Site registry, not Narada proper, is the intended mutation locus.
6. Preserve Observer/Builder/Architect role semantics; this task is about authority locus, not adding new role powers.
7. Record the source inbox envelope and mutation evidence in the final task report.

## Non-Goals

- Do not mutate live external/client Site state from Narada proper during tests.
- Do not hardcode Windows-specific paths as the general rule.
- Do not make volatile operator-surface window handles authoritative in Narada proper.
- Do not bypass sanctioned operator-surface commands with direct registry JSON editing.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] `sites doctor` next_command includes explicit target-locus arguments for target Site-local operator-surface mutation
- [x] `operator-surface agent instantiate` fails closed or warns when `--site` and `--cwd` resolve to different Site-local registries
- [x] Dry-run/status output classifies `registry_path` authority locus as `target_site_local`, `caller_context`, or `ambiguous`
- [x] Focused tests cover external client Site invocation from Narada proper without mutating Narada proper's registry
- [x] Final report records the source inbox envelope, changed files, verification, and residuals
