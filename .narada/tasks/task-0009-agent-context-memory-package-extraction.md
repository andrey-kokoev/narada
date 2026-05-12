# narada-proper.task-0009

## Title

Extract reusable agent-context checkpoint memory machinery into repo package form.

## Authority Basis

- Operator request relayed by `narada-andrey.Kevin` in `OSM:osm_20260510_191344_269_1cc2f2f2`.
- Source evidence: User Site task `#552` and CPY observation `env_c3abf79a-0e51-48a1-a437-f82312567d33`.

## Goal

Create a pure reusable package for agent-context checkpoint memory contracts that future Sites can consume from Narada repo packages without importing narada-andrey, CPY, Narada proper, operator-surface, PC, checkpoint, or runtime state.

## Non-Goals

- No live SQLite dependency or mutation in the package.
- No source Site DB/history/state import.
- No secrets or operator-surface/PC runtime copying.
- No live MCP registration or runtime hydration execution.
- No role assignment collapse into named-agent identity.

## Changed-File Scope

- `packages/agent-context-memory/`
- `.narada` task/admission/audit/ledger evidence.

## Verification Checklist

- Package typecheck passes.
- Package tests pass.
- Package build passes.
- Audit names changed files, verification, refused imports, rollback, terminal claim, and remaining blockers.
