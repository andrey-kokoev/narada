---
status: in_review
---

# Remove law receipt work-admission blocking in Narada proper

## Chapter

mcp-infrastructure

## Goal

Stop unread/expired law receipts from blocking Narada proper work-next/task construction admission while preserving law status evidence.

## Context

Operator directive: remove that functionality application in Narada proper after builder role-targeted review work was blocked by an unread/expired mandatory law receipt.

## Required Work

Identify the law admission / qualification gate that blocks work-next or task construction on unread law receipts; change Narada proper behavior so law receipts are advisory evidence, not work-admission blockers; keep law status/read surfaces intact; add focused regression coverage.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] narada work-next no longer blocks solely because law_admission has unread mandatory law changes.
- [ ] law status/unread commands still report unread receipts as evidence.
- [ ] Focused tests pass.
