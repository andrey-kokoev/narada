---
status: deferred
depends_on: [1432, 1440]
deferred_by: narada.builder
deferred_at: 2026-05-17T00:11:30.249Z
defer_reason: Static dashboard CLI depends on Narada proper row providers from task 1450. Task 1450 is currently claimed by narada.builder2 and has not reported provider functions yet, so implementing 1451 now would either duplicate 1450 provider ownership or build against an unstable/missing interface.
unblock_condition: Resume after task 1450 reports/lands Narada proper provider functions, then add the static report CLI using the common renderer and landed providers.
continuation_packet:
  kind: task_defer
  deferred_by: narada.builder
  deferred_at: 2026-05-17T00:11:30.249Z
  reason: Static dashboard CLI depends on Narada proper row providers from task 1450. Task 1450 is currently claimed by narada.builder2 and has not reported provider functions yet, so implementing 1451 now would either duplicate 1450 provider ownership or build against an unstable/missing interface.
  unblock_condition: Resume after task 1450 reports/lands Narada proper provider functions, then add the static report CLI using the common renderer and landed providers.
  residuals: [No 1451 code changes made after claim., Core renderer package from task 1449 is closed; provider layer from task 1450 is still pending.]
---

# Add dashboard generator CLI for static Site report

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1448-1455-common-site-operational-dashboard-generator.md

## Goal

Add a CLI/script that generates a static Site operational dashboard HTML report from configured providers.

## Context

Operators need a simple command to produce a local report, similar to Staccato's generated HTML, but backed by the common package and Narada providers.

## Required Work

1. Add a CLI/script entrypoint for generating a Site dashboard report with `--site-root`, `--output`, and optional provider selection.
2. Use the common renderer and Narada proper providers.
3. Default output should be under a local report/artifact path without overwriting unrelated files.
4. Add dry-run or print-summary mode.
5. Add tests for command invocation against fixtures and safe output.

## Non-Goals

- Do not start a long-running server in this task.
- Do not publish the dashboard remotely.
- Do not add dashboard mutation buttons.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Static dashboard generation command works against fixtures.
- [ ] Generated HTML contains generic sections and bounded payload.
- [ ] Dry-run/summary mode avoids file mutation.
- [ ] Tests cover output path and no-secret guarantees.
