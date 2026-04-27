---
status: opened
depends_on: [998]
amended_by: architect
amended_at: 2026-04-27T21:49:41.462Z
---

# Route resume tool hydration through CEIZ

## Chapter

resume-continuity-implementation

## Goal

Make optional resume tool hydration an explicit Command Execution Intent Zone request instead of an advisory string when execution is requested.

## Context

`narada resume --with codex` currently returns an advisory command. Actual launch belongs in CEIZ because starting a tool process is command execution, not continuity inspection. This task adds the explicit crossing while keeping the default read-only behavior.

## Required Work

1. Keep default `--with codex` advisory and read-only.
2. Add an explicit execution flag or subcommand that creates a CEIZ command request/result for tool hydration.
3. Include configured cwd/locus, AGENTS/doctrine context pointers, resume brief digest, and bounded output admission.
4. Refuse execution when locus/preflight is ambiguous.
5. Add tests for advisory mode, execution mode, CEIZ record creation, and refusal paths.

## Non-Goals

- Do not make resume launch tools by default.
- Do not bypass CEIZ output admission.
- Do not invent tool-specific authority outside the configured runtime/locus.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Default `--with codex` remains advisory/read-only unless an explicit execution flag is provided.
- [ ] Execution path creates a CEIZ command request/result and does not bypass output admission.
- [ ] Hydration command uses configured runtime/locus and includes AGENTS/doctrine context pointers.
- [ ] Tests prove advisory vs execution modes remain separate.
- [ ] `pnpm verify` passes.
