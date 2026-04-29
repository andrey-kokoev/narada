---
status: closed
criteria_proved_by: builder
criteria_proved_at: 2026-04-29T23:35:19.125Z
criteria_proof_verification:
  state: unbound
  rationale: Added narada operator-surface agent instantiate as the high-level Operator path. It admits or reuses durable identities, rejects unsupported roles, supports dry-run without mutation, emits bootstrap/copy text with bind-focused --as self, defers runtime binding to owning runtime locus, supports JSON and compact human output, and docs now name it while preserving lower-level primitives.
closed_at: 2026-04-29T23:35:45.560Z
closed_by: builder
governed_by: task_close:builder
closure_mode: agent_finish
---

# Add one-command Operator Surface agent instantiation

## Chapter

Operator Surface Agent Instantiation

## Goal

Provide a single Operator-facing command that commissions or instantiates a Site role agent surface, starting with architect, without collapsing Narada proper identity authority into volatile User/PC runtime-handle mutation authority.

## Context

<!-- Context placeholder -->

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Expose one ergonomic CLI command for Operator use
- [x] e.g. narada operator-surface agent instantiate --site <site-id-or-root> --role architect --agent-kind codex_cli --by <principal>
- [x] with help text that is shorter than the lower-level identity/bind sequence.
- [x] The command must admit or reuse the durable Operator Surface identity for the requested Site and role through the existing identity registry instead of requiring direct JSON edits.
- [x] The command must emit copyable bootstrap text or a launch/handoff packet for the requested role using the Site agent-bootstrap contract when available
- [x] and must include the self-bind instruction narada operator-surface bind-focused --as self.
- [x] The command must not directly mutate volatile runtime handles from Narada proper; when a focused runtime/window/session binding is requested
- [x] it must return a runtime-locus deferral with the exact command for the owning User/PC/runtime Site.
- [x] The command must support dry-run/preview semantics and JSON output so Operator surfaces can call it safely before any identity mutation.
- [x] Add focused tests covering architect happy path
- [x] unknown role rejection
- [x] dry-run no mutation
- [x] existing identity reuse
- [x] runtime-locus deferral
- [x] and compact human output.
- [x] Update Operator Surface and Site bootstrap documentation to name this as the canonical high-level Operator path
- [x] while keeping lower-level identity add and bind-focused commands as primitives.
