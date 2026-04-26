---
status: closed
closed_at: 2026-04-26T15:42:28.7858563-05:00
closed_by: codex
depends_on: []
---

# Task 596 — Validate Windows User Site root posture and lifecycle

## Context

Part of the Windows User Site Doctor chapter (Tasks 596–596). The current User Site at `C:\Users\Andrey\Narada` should be checkable as a first-class Windows User locus, including its registry and task lifecycle substrate.

## Goal

Add a CLI doctor that validates whether a materialized Windows User Site root is coherent enough to trust as a durable operator surface.

## Acceptance Criteria

- [x] `narada sites doctor <site-id>` exists.
- [x] The doctor validates root existence, `config.json`, `site_id`, `locus.authority_locus`, User-locus root policy, `sync.posture`, registry DB, registry entry/root match, and `.ai/tasks/task-lifecycle.db`.
- [x] The doctor returns non-zero when hard validation checks fail.
- [x] The docs name the doctor as the validation surface for Windows User Sites.
- [x] Verification passes against `andrey-user` at `C:\Users\Andrey\Narada`.

## Execution Mode

Direct implementation.

## Verification

```powershell
@'
import { sitesDoctorCommand } from './packages/layers/cli/src/commands/sites.ts';
const logger = { debug(){}, info(){}, warn(){}, error(){}, trace(){} };
const result = await sitesDoctorCommand('andrey-user', { root: 'C:\\Users\\Andrey\\Narada', authorityLocus: 'user', format: 'json' }, { configPath: './config.json', verbose: false, logger });
console.log(JSON.stringify(result, null, 2));
if (result.exitCode !== 0) process.exit(result.exitCode);
'@ | pnpm exec tsx -
```

Result: `exitCode: 0`, `status: "passed"`, with all checks passing.

CLI entrypoint smoke also passed after building workspace dependencies:

```powershell
pnpm exec tsx packages/layers/cli/src/main.ts sites doctor andrey-user --root C:\Users\Andrey\Narada --authority-locus user --format json
```

A negative CLI smoke against a missing root returned exit code 1 while still printing JSON checks.

Additional verification:

- `pnpm --filter @narada2/windows-site build`
- `pnpm --filter @narada2/cli typecheck`
- `pnpm --filter @narada2/cli exec vitest run test/commands/sites.test.ts`
- `pnpm exec tsx scripts/task-file-guard.ts`
- `git diff --check`
