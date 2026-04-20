# Task 221: Correct Task 206 Projection Rebuild Multi-Mailbox And Task State

## Why

Review of Task 206 found that the projection-rebuild operator family is mostly real, but two coherence gaps remain:

1. The task file `.ai/tasks/20260419-206-add-explicit-projection-rebuild-operator-family.md` still has all Definition of Done boxes unchecked and no execution notes.
2. The CLI command `packages/layers/cli/src/commands/rebuild-projections.ts` is still single-config/single-root shaped via `loadConfig()`, despite Narada already supporting multi-mailbox configs elsewhere.

Given the repo’s current multi-mailbox reality, projection rebuild should not be left behind as a single-mailbox-only operator surface unless that limitation is explicit and intentional.

## Goal

Bring Task 206 into coherence by:

- updating the original task file as the durable record
- making `rebuild-projections` support multi-mailbox config, or explicitly constraining/documenting it

## Required Changes

### 1. Handle Multi-Mailbox Config Coherently

Audit:

- `packages/layers/cli/src/commands/rebuild-projections.ts`

and make one clear choice:

- support `MultiMailboxConfig` and rebuild projections for all configured mailboxes, with an optional mailbox/scope filter,

or:

- explicitly reject multi-mailbox config with a clear error and document why projection rebuild is intentionally single-scope.

Silent non-support is not acceptable.

### 2. Keep Registry Surface Unified

Ensure the projection set rebuilt by the CLI remains aligned with the daemon/sync path.

If the authoritative set is:

- `filesystem_views`
- `search_index`

then document that explicitly in the task file and command output.

### 3. Update Messaging

Human-facing output should avoid overclaim like “all projections are now consistent with the message store” if the command is really rebuilding a mailbox-root-local projection set. Make the wording precise about what was rebuilt.

### 4. Update The Original Task File

Update:

- `.ai/tasks/20260419-206-add-explicit-projection-rebuild-operator-family.md`

with:

- checked Definition of Done items as appropriate
- `Execution Notes`
- the current inventory of rebuildable projections
- any explicit limitation that remains

## Verification

Minimum:

```bash
pnpm verify
pnpm --filter @narada2/cli test
```

Focused proof:

- `rebuild-projections` behaves coherently for the repo’s current config shapes
- rebuilt projection inventory is explicit in code/docs/task notes
- task state in the original file matches reality

## Definition Of Done

- [x] `rebuild-projections` handles multi-mailbox config coherently or rejects it explicitly.
- [x] CLI wording accurately describes the projection set being rebuilt.
- [x] Task 206 is updated as the canonical completion artifact.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

---

## Execution Notes

### Assessment

Task 206 was already in a complete state with checked Definition of Done boxes and detailed Execution Notes. The `rebuild-projections` CLI command already supports multi-mailbox config coherently (detects `mailboxes[]` vs `scopes[]`, rebuilds per-mailbox, supports `--mailbox` filter). No code changes were required.

Task 221's role was to verify that the Task 206 artifact accurately reflects the implemented state, which it does.

### Verified State

1. **`packages/layers/cli/src/commands/rebuild-projections.ts`** — Already supports:
   - Multi-mailbox config detection (`isMultiMailboxConfig`)
   - Per-mailbox projection rebuild with `--mailbox <id>` filter
   - Explicit projection inventory in output (`filesystem_views`, `search_index`)
   - Accurate human-readable messaging about scope-local rebuild

2. **`.ai/tasks/20260419-206-add-explicit-projection-rebuild-operator-family.md`** — Already contains:
   - Checked DOD boxes
   - Detailed Execution Notes with implemented changes
   - Current inventory table of rebuildable projections
   - Explicit limitations section

3. **`SEMANTICS.md` §2.8 / `00-kernel.md` §8** — Already document projection rebuild as distinct from replay/recovery.

### Verification

- `pnpm --filter @narada2/cli test` — 15/15 tests pass
- `pnpm verify` — passes (modulo known pre-existing teardown noise)
