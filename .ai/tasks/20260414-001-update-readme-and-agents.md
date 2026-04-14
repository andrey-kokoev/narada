# Update README And AGENTS To Reflect Current Codebase

## Mission
Bring `README.md` and both `AGENTS.md` files into alignment with the actual codebase, removing false claims and adding missing modules that have been implemented or spec'd.

## Why This Matters

README and AGENTS are the first surfaces new agents and developers read. If they describe a toolchain that does not exist (Rolldown, oxlint) or omit modules that do exist (outbound worker, charters), subsequent work will be based on false ground.

## Scope

- `/home/andrey/src/narada/README.md`
- `/home/andrey/src/narada/AGENTS.md`
- `/home/andrey/src/narada/packages/exchange-fs-sync/AGENTS.md`

## Issues Found

### 1. README.md — Missing Major Architecture

| Issue | Evidence |
|-------|----------|
| Monorepo list omits `packages/charters/` | Directory exists with `src/index.ts` and `src/types/` |
| No mention of outbound worker, coordinator, or foreman | `packages/exchange-fs-sync/src/outbound/` is fully implemented (send-reply worker, reconciler, non-send worker, store, schema) |
| Multi-mailbox claims "(coming soon)" | `packages/exchange-fs-sync/src/runner/multi-sync.ts` exists and is used |

### 2. Root AGENTS.md — Outdated Layout & Concepts

| Issue | Evidence |
|-------|----------|
| Repository layout omits `packages/charters/` | Directory exists |
| "Where to Find Things" omits outbound modules | `src/outbound/send-reply-worker.ts`, `src/outbound/store.ts`, etc. are implemented |
| "By Concept" table omits outbound concepts | `ManagedDraft`, `OutboundCommand`, `DeltaToken`, `Apply-Log` are listed but not `OutboundStore`, `SendReplyWorker`, `Reconciler` |
| Critical invariants only cover inbound sync | Outbound invariants (draft-first, no agent direct send, two-stage completion) are missing |
| Extension points don't mention outbound | Outbound is a major extension point now |

### 3. packages/exchange-fs-sync/AGENTS.md — False Toolchain Claims

| Issue | Evidence |
|-------|----------|
| Claims Ox toolchain (Rolldown, oxlint, oxfmt) is used | No `rolldown.config.js`, `.oxfmtrc.jsonc`, or `.oxlintrc.json` exists. `package.json` uses `tsc` for build. |
| Package structure omits `src/outbound/` | Directory exists with 8 files |
| "Debugging Tips" says "The system doesn't have structured logging yet" | `src/logging/types.ts` exists and outbound workers import `Logger` from it |
| Package structure omits `src/runner/multi-sync.ts` | File exists |

## Required Changes

### README.md

1. Add `packages/charters/` to monorepo structure bullet.
2. Update features: remove "(coming soon)" from Multi-Mailbox; mention outbound worker / durable command pipeline.
3. Add a brief architecture paragraph referencing the five layers (inbound sync, foreman, charters, auxiliary stores, outbound worker).
4. Add outbound worker and `packages/charters` to the monorepo structure list.

### Root AGENTS.md

1. Add `packages/charters/` to repository layout tree.
2. Add outbound entries to "Where to Find Things / By Task":
   - Change outbound command state machine → `src/outbound/types.ts`
   - Add outbound command → `src/outbound/store.ts`
   - Add send reply worker → `src/outbound/send-reply-worker.ts`
   - Add reconciler → `src/outbound/reconciler.ts`
   - Add non-send worker → `src/outbound/non-send-worker.ts`
3. Add outbound entries to "By Concept":
   - **OutboundCommand** / durable mailbox mutation intent / `src/outbound/types.ts`
   - **ManagedDraft** / Graph draft bound to a version / `src/outbound/store.ts`
   - **SendReplyWorker** / draft creation, reuse, and send / `src/outbound/send-reply-worker.ts`
   - **OutboundReconciler** / submitted → confirmed binding / `src/outbound/reconciler.ts`
4. Update invariants section to include outbound invariants (or add an outbound subsection).
5. Update extension points to mention outbound actions as allowed.

### packages/exchange-fs-sync/AGENTS.md

1. **Remove the entire "Toolchain: Full Ox Stack" section.** It is factually incorrect.
2. Replace with a "Toolchain" section that accurately reflects the current setup:
   - `tsc` for compilation
   - `vitest` for tests
   - `tsx` for script execution
3. Add `src/outbound/` to the package structure tree.
4. Add `src/runner/multi-sync.ts` to the package structure tree.
5. Fix "Debugging Tips" logging sentence to say: "The system uses structured logging. See `src/logging/types.ts` and `src/logging/structured.ts` for the interface."
6. Add outbound architecture files to the package structure list.

## Definition Of Done

- [ ] README.md mentions `packages/charters/` and outbound architecture
- [ ] README.md no longer claims multi-mailbox is "coming soon"
- [ ] Root AGENTS.md repository layout includes `packages/charters/` and `src/outbound/`
- [ ] Root AGENTS.md "Where to Find Things" covers outbound modules
- [ ] Root AGENTS.md invariants acknowledge outbound boundaries
- [ ] Package AGENTS.md removes false Ox toolchain section
- [ ] Package AGENTS.md adds outbound and multi-sync to package structure
- [ ] Package AGENTS.md fixes structured logging claim
- [ ] All three files are proof-read for consistency
