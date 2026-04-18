# Task 112: ops-kit v1 Intent-to-Operationalization — EXECUTED

**Date**: 2026-04-17
**Status**: Complete

---

## Deliverables

### 1. Package Scaffold (`packages/ops-kit/`)

Created new package with:
- `package.json` — `@narada2/ops-kit`, depends on `@narada2/exchange-fs-sync`, `@narada2/charters`, `commander`
- `tsconfig.json` — strict TypeScript, ESM, NodeNext resolution
- `vitest.config.ts` — test runner config
- Added to `pnpm-workspace.yaml`

### 2. Core Types

**`src/intents/posture.ts`**
- `MailboxPosturePreset`: `draft-only` | `draft-and-review` | `send-allowed`
- `WorkflowPosturePreset`: `observe-only` | `draft-alert` | `act-with-approval`
- `POSTURE_ACTIONS`: maps each preset to concrete `AllowedAction[]`
- `POSTURE_DESCRIPTIONS`: human-readable descriptions
- `resolvePostureActions()`, `listPosturePresets()`

**`src/intents/mailbox.ts`**
- `WantMailboxIntent` — user voice for mailbox creation
- `ShapedMailbox` — result of shaping

**`src/intents/workflow.ts`**
- `WantWorkflowIntent` — user voice for workflow creation
- `ShapedWorkflow` — result of shaping

**`src/readiness/types.ts`**
- `ReadinessCheck`, `ReadinessReport`, `ActivationState`

### 3. Commands

| Command | File | Purpose |
|---------|------|---------|
| `want mailbox` | `commands/want-mailbox.ts` | Shape mailbox intent into config + directory scaffold |
| `want workflow` | `commands/want-workflow.ts` | Shape workflow intent into config + schedule declaration |
| `want posture` | `commands/want-posture.ts` | Apply posture preset to existing scope |
| `setup` | `commands/setup.ts` | Materialize safe local structure |
| `preflight` | `commands/preflight.ts` | Validate readiness (config, dirs, activation) |
| `inspect` | `commands/inspect.ts` | Show effective Narada object model |
| `explain` | `commands/explain.ts` | Answer "what will this do?" / "why not ready?" |
| `activate` | `commands/activate.ts` | Mark target operationally ready (config transition only) |

### 4. CLI Entry Point (`src/main.ts`)

`narada-ops` binary with all commands wired via Commander:
```bash
narada-ops want mailbox help@example.com --posture draft-only
narada-ops want workflow health-check --schedule "*/5 * * * *"
narada-ops setup help@example.com
narada-ops preflight help@example.com
narada-ops explain help@example.com
narada-ops activate help@example.com
```

### 5. Supporting Libraries

**`src/lib/config-io.ts`**
- `readConfig()`, `writeConfig()`, `ensureConfig()`
- `findScope()`, `upsertScope()`
- `resolveConfigPath()`, `getOpsRepoRoot()`

**`src/lib/scaffold.ts`**
- `scaffoldMailbox()`, `scaffoldWorkflow()`, `scaffoldGlobal()`

**`src/lib/scope-builder.ts`**
- `buildMailboxScope()` — generates `ScopeConfig` for mail vertical
- `buildWorkflowScope()` — generates `ScopeConfig` for timer vertical

**`src/render/`**
- `renderPreflight()`, `renderExplain()`, `renderScopeInspect()`

### 6. Tests

| Test File | Coverage |
|-----------|----------|
| `test/unit/want-mailbox.test.ts` | Create mailbox, update existing, posture preset |
| `test/unit/want-workflow.test.ts` | Create workflow, schedule file, posture preset |
| `test/unit/preflight.test.ts` | Missing target, pre-setup warnings, full pass after setup+activate |
| `test/unit/ops-kit.test.ts` | End-to-end mailbox journey, workflow journey, scope inspection |

All 11 tests pass.

---

## Key Design Decisions

1. **Operates on `ScopeConfig`, not legacy `CoordinatorConfig`** — forward-compatible with the vertical-neutral config model
2. **Posture presets map to concrete `AllowedAction[]`** — no new action types invented
3. **Relative path resolution** — `root_dir` is resolved relative to config file location consistently across setup, preflight, and activate
4. **Safe scaffolding** — `setup` only creates directories and harmless files; never runs daemons or performs irreversible side effects
5. **Structured declarations only** — no prose scraping or inference; all requirements come from explicit config/tool definitions

---

## Verification

- `pnpm typecheck` — clean
- `pnpm build` — clean
- `pnpm test` — 11 passed
- `pnpm build` (monorepo) — clean
- `pnpm kernel-lint` — zero leakage

---

## Definition of Done

- [x] `packages/ops-kit` exists with documented CLI surface
- [x] mailbox intent can be shaped into config + file layout
- [x] workflow intent can be shaped into config + file layout
- [x] `setup` materializes safe local structure
- [x] `preflight` validates declared readiness against structured requirements
- [x] `explain` produces user-facing reasons and next actions
- [x] `activate` marks targets operationally ready without auto-running long-lived processes
- [x] all flows operate on structured declarations, not charter prose
- [x] tests cover at least one mailbox journey and one workflow journey
