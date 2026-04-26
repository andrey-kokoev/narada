---
status: accepted
date: 2026-04-26
closed_tasks: [594]
task_range: 594-594
owner: codex
---

# Decision - Close Windows Site Root Policy By Authority Locus

## Basis

Task 594 added authority-locus-aware Windows Site root and registry helpers, documented the User Site telos, named ProgramData as the native PC-locus root, and preserved legacy `%LOCALAPPDATA%` compatibility paths.

## Verification

- `pnpm --filter @narada2/windows-site build`
- `pnpm --filter @narada2/windows-site exec vitest run test/unit/path-utils.test.ts test/unit/registry.test.ts`
- `pnpm --filter @narada2/windows-site test`
- `pnpm exec tsx scripts/task-file-guard.ts`

## Residuals

- Registry discovery can later be migrated to prefer the new authority-locus roots while continuing to scan legacy roots during an explicit compatibility period.
- Narada runtime materialization can later consume the locus-aware root helpers when bootstrap commands grow first-class Windows Site creation flows.
