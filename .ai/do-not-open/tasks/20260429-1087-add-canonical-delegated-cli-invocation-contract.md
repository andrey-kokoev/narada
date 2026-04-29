---
status: closed
amended_by: architect
amended_at: 2026-04-29T19:17:29.768Z
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T19:24:40.803Z
criteria_proof_verification:
  state: unbound
  rationale: Agent guidance now forbids hardcoded Node/NVM/WSL path repair; package.json can declare narada.delegated_cli_embodiment with command/cwd/shell/repair_command; inbox doctor reports loadability, failure_kind, and repair_command; output points to shim/wrapper contract; source envelope env_e20fca5c-33cf-489e-8610-c6094b121dbf is routed through task 1087; focused inbox tests and pnpm verify passed.
closed_at: 2026-04-29T19:24:52.648Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Add canonical delegated CLI invocation contract

## Chapter

Delegated CLI Embodiment Ergonomics

## Goal

Replace hand-assembled WSL Node PATH invocation with a declared, doctor-verified delegated Narada CLI embodiment invocation contract for agents and Site wrappers.

## Context

Inbox envelope env_e20fca5c-33cf-489e-8610-c6094b121dbf reports that narada-andrey.architect fell back to hardcoded WSL Node bin paths to run Narada CLI commands. The correct rule is to use the Narada shim inside the target embodiment, or report delegated CLI embodiment not loadable with the exact doctor/preflight repair command. Current evidence: non-login WSL with ./node_modules/.bin/narada failed because node was not on PATH; login-shell WSL succeeded; User Site doctor reported no Site-local delegated Narada CLI embodiment configured and missing local CLI dist.

## Required Work

1. Inspect delegated CLI health, inbox doctor, Site embodiments, shim install, Site bootstrap, and agent-facing docs. 2. Define the canonical invocation contract for a delegated Narada CLI embodiment: how a Site declares the command/wrapper, cwd, shell mode, environment assumptions, and repair command. 3. Make doctor/preflight surface the contract and distinguish missing config, missing build output, missing node, stale dist, and broken shim. 4. Add or specify a generated stable wrapper if needed so agents do not assemble wsl.exe/bash/node PATH commands by memory. 5. Update agent/operator guidance to forbid hardcoded Node/NVM path repair and prefer the declared embodiment invocation or explicit refusal. 6. Add tests or fixtures for non-login shell node-not-found versus declared login-shell/wrapper success. 7. Verify with focused tests or pnpm verify and record residuals.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T19:17:29.768Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Agent-facing guidance forbids hardcoded Node or NVM bin path repair for Narada CLI invocation
- [x] Delegated CLI embodiment config can declare the canonical invocation path or wrapper for a target Site embodiment
- [x] Doctor or preflight reports loadability and exact repair command when the delegated CLI embodiment is not usable
- [x] Output recommends using the Narada shim or generated wrapper instead of sampled PATH commands
- [x] Source envelope env_e20fca5c-33cf-489e-8610-c6094b121dbf is routed
