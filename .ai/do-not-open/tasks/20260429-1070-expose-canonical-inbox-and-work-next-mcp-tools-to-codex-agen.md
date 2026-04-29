---
status: opened
amended_by: architect
amended_at: 2026-04-29T15:33:56.216Z
---

# Expose canonical inbox and work-next MCP tools to Codex agents

## Chapter

MCP Agent Work Surface

## Goal

Make Narada canonical inbox submission and work-next discovery available as MCP tools in Codex agent tool surfaces so onboarded agents can submit observations and discover governed work without falling back to ad hoc chat or shell-only CLI access.

## Context

This task follows an observed Codex tool-surface gap: a Narada Site architect attempted to submit an inbox observation through MCP but only GitHub and Gmail app tools were exposed. No narada_inbox_submit_observation or work-next MCP tool was discoverable. This forces agents back to CLI, file-drop, or chat, which is weaker than the Narada MCP facade doctrine.

## Required Work

1. Inspect the existing Narada MCP facade implementation and Codex app/tool registration path. 2. Expose canonical inbox submission as an MCP tool or tools, including at minimum observation submission and preferably generic typed envelope submission. 3. Expose canonical work-next discovery as an MCP tool so an onboarded agent can ask for governed assigned/admissible work without relying on chat memory. 4. Ensure tools delegate to canonical Narada application services or CLI command logic rather than duplicating authority semantics. 5. Keep output bounded: return ids, status, next action, artifact paths, and summaries, not full transcripts or giant payloads. 6. Document tool names and expected agent usage in AGENTS or MCP facade docs. 7. Add tests or a local verification path proving tools are discoverable and can dry-run or perform local submission/work-next. 8. Run pnpm verify and report residuals.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-29T15:33:56.216Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Codex-visible MCP tool surface includes canonical inbox observation submission or an equivalent governed envelope submission tool
- [ ] Codex-visible MCP tool surface includes work-next discovery for assigned or admissible governed work
- [ ] Tool implementation delegates to Narada canonical application services or CLI logic rather than creating a second authority implementation
- [ ] Agent-facing tool names and outputs are bounded ergonomic and documented in AGENTS or MCP facade docs
- [ ] Tests or verification demonstrate tool discovery and a dry-run or local submission path and pnpm verify passes
