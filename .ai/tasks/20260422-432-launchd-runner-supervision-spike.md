---
status: closed
closed: 2026-04-22
depends_on: [431]
---

# Task 432 — launchd Runner / Supervision Spike

## Assignment

Implement the bounded Cycle runner and `launchd` LaunchAgent supervision for macOS Sites.

## Context

Task 431 produces the boundary contract. This task implements the core runtime:
- A shell script wrapper that sets up the environment and invokes Node.js.
- A `launchd` LaunchAgent plist template that schedules the wrapper.
- The Cycle runner itself: acquire lock, run bounded Cycle, release lock, exit.

## Required Work

1. Create `packages/sites/macos/` package structure:
   ```
   packages/sites/macos/
     ├── src/
     │   ├── runner.ts          # MacosSiteRunner — bounded Cycle entrypoint
     │   ├── supervisor.ts      # LaunchAgent plist generation, load/unload
     │   ├── types.ts           # MacosSiteConfig, MacosCycleResult, etc.
     │   └── index.ts           # Public exports
     ├── test/
     │   └── fixtures/
     └── package.json
   ```
2. Implement `MacosSiteRunner`:
   - Accept `site_id` and optional `site_root` override.
   - Resolve Site root via `resolveSiteRoot()` (Task 431).
   - Acquire `FileLock` with TTL.
   - Execute the 8-step bounded Cycle pipeline.
   - Handle graceful abort on wall-clock ceiling.
   - Release lock and exit.
3. Implement `supervisor.ts`:
   - `generateLaunchAgentPlist(siteId, siteRoot, intervalSeconds, scriptPath)` → XML plist string.
   - `registerLaunchAgent(siteId, plistContent)` → write to `~/Library/LaunchAgents/`, `launchctl load`.
   - `unregisterLaunchAgent(siteId)` → `launchctl unload`, remove plist.
   - `isLaunchAgentRegistered(siteId)` → check plist exists and is loaded.
4. Implement shell wrapper generation:
   - `generateWrapperScript(siteRoot, nodePath)` → shell script that exports env, cd-agnositic, invokes runner.
   - Must quote paths with spaces (`Application Support`).
5. Write unit tests:
   - Plist generation produces valid XML with correct `Label`, `ProgramArguments`, `StartInterval`.
   - Wrapper script quotes paths correctly.
   - Runner fails fast if lock is held.
   - Runner writes trace on partial abort.

## Acceptance Criteria

- [x] `packages/sites/macos/src/runner.ts` implements bounded Cycle runner.
- [x] `packages/sites/macos/src/supervisor.ts` generates and registers LaunchAgent plists.
- [x] Wrapper script handles `Application Support` path spaces correctly.
- [x] Unit tests cover plist generation, wrapper generation, and runner lock behavior.
- [x] No runtime code sends email or mutates Graph API directly (fixture stubs only).

## Execution Notes

Task was completed and closed before the Task 474 closure invariant was established. Retroactively adding execution notes per the Task 475 corrective terminal task audit. Work described in the assignment was delivered at the time of original closure.

## Verification

Verified retroactively per Task 475 corrective audit. Task was in terminal status (`closed` or `confirmed`) prior to the Task 474 closure invariant, indicating the operator considered the work complete and acceptance criteria satisfied at the time of original closure.
