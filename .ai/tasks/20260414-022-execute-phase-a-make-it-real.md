.ai/tasks/20260414-021-execute-phase-a-make-it-real.md

# Execute Phase A — Make It Real

## Parent Spec

.ai/tasks/20260414-020-control-plane-v2-to-production-mailbox-agent-gap-closure-plan.md

## Scope

Execute **Phase A — Make It Real** only.

Do not implement Phase B or Phase C work.

## Step 0 — Resolve Runtime Decision

Before writing code, you MUST explicitly choose and document:

- production runtime:
  - Codex API
  - Codex CLI
  - or dual abstraction

Output a short decision note at:

.ai/decisions/20260414-runtime-choice.md

No further work proceeds until this is written.

## Step 1 — Decompose Phase A

Break Phase A into concrete implementation tasks:

- runtime wiring into daemon
- config + secrets surface
- invocation envelope tool population
- tool execution path integration
- end-to-end daemon integration test

Output tasks as:

.ai/tasks/20260414-021-A-*.md

Each task must be:
- independently executable
- testable
- scoped to a single concern

## Step 2 — Execute Tasks Sequentially

For each task:
- implement
- add/extend tests
- ensure `pnpm test` + `typecheck` pass
- commit before moving to next

## Step 3 — End-to-End Proof

Produce one integration test that proves:

sync → work item → lease → real charter runtime → evaluation → outbound_command

This is the Phase A exit.

## Constraints

- do not redesign architecture
- do not touch Phase B/C concerns
- do not introduce new global abstractions unless required by runtime decision
- do not treat traces as control state

## Output

- completed implementation
- passing tests
- runtime decision doc
- task files showing decomposition