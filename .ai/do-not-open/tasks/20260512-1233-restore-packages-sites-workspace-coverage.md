---
status: closed
closed_at: 2026-05-12T23:27:18.536Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Restore packages/sites workspace coverage

## Goal

Restore packages/sites/* to the pnpm workspace after review found Site packages dropped from workspace discovery.

## Context

Doctrine-grounded review found pnpm-workspace.yaml no longer includes packages/sites/* while packages/sites/windows, cloudflare, linux, and macos remain real packages. This violates build graph coherence.

## Required Work

1. Restore packages/sites/* in pnpm-workspace.yaml. 2. Verify pnpm workspace discovery includes @narada2/windows-site and @narada2/cloudflare-site. 3. Record task evidence and close.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

- Restored `packages/sites/*` to `pnpm-workspace.yaml`.
- This brings `@narada2/windows-site`, `@narada2/cloudflare-site`, `@narada2/linux-site`, and `@narada2/macos-site` back into workspace discovery.

## Verification

- `pnpm -r --depth -1 list --json | Select-String -Pattern '"name": "@narada2/(windows-site|cloudflare-site|linux-site|macos-site)"'`
  - Result: all four Site packages found.

## Acceptance Criteria

- [x] pnpm-workspace.yaml includes packages/sites/*
- [x] pnpm workspace discovery includes Site packages
