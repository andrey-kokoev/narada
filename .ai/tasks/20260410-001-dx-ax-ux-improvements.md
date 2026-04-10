# DX / AX / UX Improvement Task List

**Created**: 2026-04-10  
**Scope**: exchange-fs-sync monorepo  
**Status**: Analysis Complete | Implementation Pending

---

## Executive Summary

| Category | Score | Status | Critical Issues |
|----------|-------|--------|-----------------|
| **DX** (Developer Experience) | 7/10 | Good docs/tooling, blocked by install | 1 P0, 3 P1 |
| **AX** (Agent Experience) | 6/10 | Excellent docs, phantom files trap agents | 2 P0, 2 P1 |
| **UX** (User Experience) | 4/10 | Functional but unfriendly | 2 P0, 3 P1 |

**Total Issues**: 5 P0, 8 P1, 4 P2

---

## 🔷 DX (Developer Experience) Analysis

### ✅ Strengths

| Aspect | Evidence |
|--------|----------|
| Documentation | 9 numbered docs (~80KB), 2 AGENTS.md files with navigation tables |
| Tooling | Full Ox stack: Rolldown, oxlint, oxfmt, Vitest |
| Type Safety | Strict TS, explicit return types, comprehensive interfaces |
| Monorepo | pnpm workspaces, clean package boundaries |
| Architecture | Clear layering, interfaces, dependency injection pattern |

### 🔴 P0 - Critical

#### DX-001: pnpm install hangs/times out
- **Impact**: Blocks all development, can't install dependencies
- **Evidence**: `pnpm install` gets stuck at "resolved 1, reused 0, downloaded 0"
- **Root Cause**: Network/registry timeout or configuration issue
- **Fix**: 
  - Check `.npmrc` or pnpm registry config
  - Try `pnpm install --registry https://registry.npmjs.org`
  - Check for lockfile corruption
  - Consider offline mode: `pnpm install --prefer-offline`
- **Files**: `pnpm-workspace.yaml`, root `package.json`

### 🟡 P1 - High

#### DX-002: Quickstart requires 90-line manual script
- **Impact**: High barrier to first sync
- **Evidence**: User must copy/paste code from docs into `test-sync.ts`
- **Fix**: Create `packages/exchange-fs-sync/scripts/first-sync.ts` that exists in repo
- **Files to create**: `scripts/first-sync.ts`, `scripts/README.md`

#### DX-003: Test script in docs doesn't exist in repo
- **Impact**: Documentation is misleading
- **Evidence**: `08-quickstart.md` shows `test-sync.ts` but file doesn't exist
- **Fix**: Either add the file or change docs to use CLI
- **Files**: `packages/exchange-fs-sync/docs/08-quickstart.md`

#### DX-004: CLI binary not linked after build
- **Impact**: Can't use `exchange-sync` command after installation
- **Evidence**: `bin` field exists in package.json but no actual binary workflow
- **Fix**: 
  - Add proper bin linking in package.json
  - Document `npm link` or global install process
  - Or use `npx` workflow
- **Files**: `packages/exchange-fs-sync-cli/package.json`

### 🟢 P2 - Medium

#### DX-005: No devcontainer/codespaces configuration
- **Impact**: Modern DX expectation for reproducible environments
- **Fix**: Add `.devcontainer/devcontainer.json` with Node.js + pnpm
- **Files to create**: `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile`

---

## 🔶 AX (Agent Experience) Analysis

### ✅ Strengths

| Aspect | Evidence |
|--------|----------|
| AGENTS.md files | Purpose-built for agents, clear navigation hub |
| "Where to Find Things" | Direct file mappings for common tasks |
| Explicit constraints | "Never violate" invariants clearly listed |
| Type-first design | Types guide implementation, good for LLM reasoning |
| Deterministic code | No randomness, predictable outputs |

### 🔴 P0 - Critical

#### AX-001: Phantom files referenced in AGENTS.md
- **Impact**: Agents will try to edit non-existent files
- **Evidence**: 
  - `packages/exchange-fs-sync/src/cli/main.ts` referenced but not implemented
  - `packages/exchange-fs-sync/src/cli/` shows files that don't exist
- **Fix**: 
  - Option A: Implement the files
  - Option B: Remove references and update docs
  - Option C: Add `@ai-note: Not implemented` comments
- **Files**: `packages/exchange-fs-sync/AGENTS.md`

#### AX-002: Inconsistent dependency protocols
- **Impact**: Runtime failures despite clean compile
- **Evidence**: 
  - Some packages use `file:../exchange-fs-sync`
  - Others use `workspace:*`
  - Mixed in same monorepo
- **Fix**: Standardize all to `workspace:*`
- **Files**: 
  - `packages/exchange-fs-sync-cli/package.json`
  - `packages/exchange-fs-sync-daemon/package.json`
  - `packages/exchange-fs-sync-search/package.json`

### 🟡 P1 - High

#### AX-003: Two CLI implementations cause confusion
- **Impact**: Agents don't know which CLI to modify
- **Evidence**: 
  - Core has `packages/exchange-fs-sync/src/cli/` (empty/partial)
  - Separate `packages/exchange-fs-sync-cli/` package (full implementation)
- **Fix**: 
  - Remove core `src/cli/` entirely
  - Update AGENTS.md to point only to `-cli` package
  - Mark as "deprecated" if must keep
- **Files**: `packages/exchange-fs-sync/src/cli/`

#### AX-004: Missing exports from core package
- **Impact**: CLI imports may fail at runtime
- **Evidence**: CLI imports things like `normalizeFolderRef` from core, but not all are exported
- **Fix**: Audit and complete exports in `packages/exchange-fs-sync/src/index.ts`
- **Files**: `packages/exchange-fs-sync/src/index.ts`

### 🟢 P2 - Medium

#### AX-005: No mock Graph adapter for development
- **Impact**: Can't develop/test without real Graph API credentials
- **Fix**: Create `MockGraphAdapter` that returns fixture data
- **Files to create**: `packages/exchange-fs-sync/src/adapter/graph/mock-adapter.ts`

#### AX-006: No `@ai-warning` comments on experimental code
- **Impact**: Agents may rely on unstable APIs
- **Fix**: Add JSDoc comments marking experimental/unstable code
- **Files**: Various across codebase

---

## 🔴 UX (User Experience) Analysis

### ✅ Strengths

| Aspect | Evidence |
|--------|----------|
| JSON output | Machine-parseable, good for scripting |
| Exit codes | Standardized (0=success, 1=error, 2=config, 3=retryable, etc.) |
| Config validation | Clear error messages with full paths |
| Dry-run support | Added to sync command |

### 🔴 P0 - Critical

#### UX-001: No human-readable output format
- **Impact**: Everything is JSON or silence - unfriendly for interactive use
- **Evidence**: All commands output JSON, even simple confirmations
- **Fix**: 
  - Add `--format human|json` flag (default: human for TTY, json for pipe)
  - Use tables, colors, progress indicators
  - Reserve JSON for `--format json` or when stdout is not TTY
- **Files**: 
  - `packages/exchange-fs-sync-cli/src/lib/logger.ts`
  - All command files in `packages/exchange-fs-sync-cli/src/commands/`

#### UX-002: No progress indication for long operations
- **Impact**: Users think process is hung
- **Evidence**: 
  - Sync can take minutes with no output
  - View rebuild is completely silent
  - Search index building gives no feedback
- **Fix**: 
  - Add progress bars using `cli-progress` or native equivalent
  - Show "Processing message X of Y" updates
  - Spinner for indeterminate operations
- **Files**: 
  - `packages/exchange-fs-sync-cli/src/commands/sync.ts`
  - `packages/exchange-fs-sync-cli/src/commands/rebuild-views.ts`
  - `packages/exchange-fs-sync-search/src/index.ts`

### 🟡 P1 - High

#### UX-003: `init` command not interactive
- **Impact**: Creates template but doesn't guide user
- **Evidence**: Just writes JSON file, doesn't prompt for values
- **Fix**: 
  - Use `inquirer` or `@clack/prompts` for interactive prompts
  - Validate each field as user enters it
  - Test connection before saving
- **Files**: `packages/exchange-fs-sync-cli/src/commands/config.ts`

#### UX-004: No `status` command
- **Impact**: Can't easily see "what's happening"
- **Evidence**: No way to check last sync time, message count, health
- **Fix**: Create `status` command showing:
  - Last sync time and result
  - Total messages count
  - Index status (if search enabled)
  - Cursor position
  - Health check summary
- **Files to create**: `packages/exchange-fs-sync-cli/src/commands/status.ts`

#### UX-005: Search not integrated into main CLI
- **Impact**: Separate package feels disconnected
- **Evidence**: `exchange-fs-sync-search` is separate binary
- **Fix**: 
  - Add `search` subcommand to main CLI
  - Or ensure `exchange-sync search` works via workspace dependency
- **Files**: `packages/exchange-fs-sync-cli/src/main.ts`

### 🟢 P2 - Medium

#### UX-006: Error messages are either too terse or too verbose
- **Impact**: Hard to understand what went wrong
- **Evidence**: 
  - Normal mode: just "error" with no context
  - Verbose mode: full stack traces
  - No middle ground
- **Fix**: 
  - Add structured error messages with:
    - What went wrong (human description)
    - Why it happened (likely causes)
    - How to fix (suggested actions)
- **Files**: `packages/exchange-fs-sync-cli/src/lib/command-wrapper.ts`

#### UX-007: No unified dashboard/tui
- **Impact**: Hard to get overview of system state
- **Fix**: Consider `ink` (React for CLI) or `blessed` for dashboard
- **Files**: Would be new package or major addition

---

## Priority Matrix

| ID | Issue | DX | AX | UX | Effort | Priority |
|----|-------|----|----|----|--------|----------|
| DX-001 | Fix pnpm install | 🔴 | 🔴 | - | 30m | **P0** |
| AX-001 | Remove phantom file refs | - | 🔴 | - | 15m | **P0** |
| UX-001 | Add human output format | - | - | 🔴 | 2h | **P0** |
| UX-002 | Add progress bars | - | - | 🔴 | 2h | **P0** |
| DX-002 | Create first-sync script | 🔴 | - | - | 30m | **P1** |
| AX-002 | Standardize deps to workspace:* | 🔴 | 🔴 | - | 30m | **P1** |
| AX-003 | Unify CLI implementations | 🟡 | 🔴 | 🟡 | 2h | **P1** |
| AX-004 | Complete core exports | 🟡 | 🔴 | - | 1h | **P1** |
| UX-003 | Interactive init | - | - | 🟡 | 2h | **P1** |
| UX-004 | Add status command | - | - | 🟡 | 1h | **P1** |
| DX-003 | Fix docs/test-sync.ts | 🔴 | - | - | 15m | **P1** |
| DX-004 | Link CLI binary | 🔴 | - | 🟡 | 30m | **P1** |
| DX-005 | Add devcontainer | 🟢 | 🟢 | - | 1h | **P2** |
| AX-005 | Create mock adapter | 🟢 | 🔴 | - | 2h | **P2** |
| UX-005 | Integrate search CLI | - | - | 🟡 | 1h | **P2** |
| UX-006 | Structured error messages | - | - | 🟡 | 2h | **P2** |

---

## Implementation Order Recommendation

### Phase 1: Unblock (P0 Issues)
```
1. DX-001: Fix pnpm install
2. AX-001: Remove phantom file references
3. UX-001: Add human output format
4. UX-002: Add progress indication
```

### Phase 2: Consistency (P1 Issues)
```
5. AX-002: Standardize dependencies
6. AX-003: Unify CLI implementations
7. DX-002: Create first-sync script
8. UX-004: Add status command
9. UX-003: Interactive init
```

### Phase 3: Polish (P2 Issues)
```
10. DX-005: Devcontainer
11. AX-005: Mock adapter
12. UX-006: Better error messages
```

---

## Files to Create

```
.ai/
  tasks/
    20260410-001-dx-ax-ux-improvements.md  (this file)
    
packages/exchange-fs-sync/
  scripts/
    first-sync.ts                          (DX-002)
    
packages/exchange-fs-sync-cli/
  src/
    commands/
      status.ts                            (UX-004)
    lib/
      formatter.ts                         (UX-001 - human format)
      progress.ts                          (UX-002 - progress bars)
      
packages/exchange-fs-sync/
  src/
    adapter/
      graph/
        mock-adapter.ts                    (AX-005)
        
.devcontainer/
  devcontainer.json                        (DX-005)
  Dockerfile                               (DX-005)
```

---

## Key Decisions Needed

1. **Output format default**: Human for TTY, JSON for pipes? Or explicit `--format`?
2. **Progress library**: `cli-progress`, `ora`, or native?
3. **Interactive prompts**: `inquirer`, `@clack/prompts`, or native `readline`?
4. **CLI unification**: Remove core `src/cli/` entirely or deprecate gradually?
5. **Human output style**: Tables (compact) or formatted text (readable)?

---

## Success Criteria

- [ ] New developer can `git clone && pnpm install && pnpm build` in <5 minutes
- [ ] `exchange-sync init` guides user through configuration
- [ ] `exchange-sync sync` shows progress bar and human-readable summary
- [ ] `exchange-sync status` shows system health at a glance
- [ ] All AGENTS.md references exist and are accurate
- [ ] No phantom files or broken imports
- [ ] Errors explain what happened and how to fix

---

## Related Documentation

- Root AGENTS.md: `/home/andrey/src/narada/AGENTS.md`
- Package AGENTS.md: `/home/andrey/src/narada/packages/exchange-fs-sync/AGENTS.md`
- Quickstart: `/home/andrey/src/narada/packages/exchange-fs-sync/docs/08-quickstart.md`
- Troubleshooting: `/home/andrey/src/narada/packages/exchange-fs-sync/docs/09-troubleshooting.md`
