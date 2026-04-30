---
status: opened
---

# Add canonical Windows startup runtime installation for client Sites

## Goal

Provide a first-class Narada command path for installing a client Site operation as a separate Windows auto-start runtime with dry-run plan, read-back evidence, health/status integration, and uninstall posture.

## Context

Inbox proposal `env_02b10e3d-b6a5-4227-acad-7776d2a1fc63` records CPY onboarding friction. The Operator chose continuous background processing, a separate CPY runtime process, Windows auto-start, automatic draft creation for admitted mail, no autonomous send, and no source mailbox modification except draft creation. Narada could configure and activate the operation, but there was no polished CLI command for installing that operation as a separate Windows startup runtime.

This should not be hand-rolled through Task Scheduler, Startup folder, ad hoc `pnpm daemon`, or a copied service script. Runtime installation crosses an authority boundary and needs a governed command with evidence, read-back, and disable/uninstall semantics.

## Required Work

1. Inspect current daemon/runtime commands, Windows Site bootstrap, doctor/status, health files, logs, and Staccato daemon residuals.
2. Design and implement or stub a canonical command such as `narada runtime install-windows-startup --site <site-root> --operation <operation-id> --mode separate-client-runtime --dry-run|--execute`.
3. The dry-run plan must declare authority locus, Windows startup substrate, service/task name, command line, environment/credential binding posture, log paths, PID/health paths, read-back checks, and uninstall command.
4. The command must distinguish shared User Site runtime from separate client Site runtime.
5. Execution, if implemented, must create only the declared startup substrate and then read it back to prove it targets the intended Site and operation.
6. Add `runtime status` or doctor integration so CLI health and process reality can be reconciled.
7. Add tests/fixtures for dry-run plan, separate-client-runtime mode, shared-runtime distinction, read-back verification, and uninstall/disable output.
8. Document the CPY-like path and the deferred posture when runtime installation is desired but not yet executed.

## Non-Goals

- Do not start autonomous sending.
- Do not mutate a client Site runtime from Narada proper without explicit target-locus execution.
- Do not hardcode CPY paths or mailbox identities.
- Do not hide Windows substrate choice; make it explicit in the plan.
- Do not replace Linux/macOS runtime installation paths in this task.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] A sanctioned Windows startup runtime command or documented stub exists for client Site operations
- [ ] Dry-run output includes authority locus, startup substrate, service/task name, command line, env/credential posture, log paths, PID/health paths, read-back checks, and uninstall command
- [ ] Command distinguishes shared User Site runtime from separate client Site runtime
- [ ] Status or doctor output can reconcile installed startup entry, expected Site/operation, and process/health reality
- [ ] Tests cover dry-run plan, separate-client-runtime mode, shared-runtime distinction, read-back verification, and uninstall/disable output
- [ ] CPY-like desired runtime posture can be recorded as deferred without hand-rolled Windows startup machinery
