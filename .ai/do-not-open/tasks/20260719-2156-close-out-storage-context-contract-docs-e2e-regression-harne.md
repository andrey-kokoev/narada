---
status: opened
depends_on: [2155]
---

# Close out storage-context contract: docs, e2e regression, harness provenance

## Goal

Publish the storage-context model and lock the regression end to end

## Context

Principled site-storage resolution, stage 5 (closeout). Docs, narada e2e regression, mcp-surfaces harness provenance assertions, final verification and checkpoint.

## Required Work

Document the storage-context model in sites/windows README and docs/concepts; narada e2e regression: list creates nothing, init writes under temp, guard refuses without ephemeral context; mcp-surfaces harness provenance assertions plus real-registry-untouched verification; final suites and checkpoint.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Storage model documented
- [ ] Regression e2e green in both repos
- [ ] Real registry.db byte/mtime-identical after mcp-surfaces e2e run
