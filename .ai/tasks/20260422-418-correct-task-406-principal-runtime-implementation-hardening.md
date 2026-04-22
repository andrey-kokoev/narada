---
status: closed
closed: 2026-04-22
depends_on: [406, 409]
---

# Task 418 — Correct Task 406 PrincipalRuntime Implementation Hardening

## Assignment

Review and harden the PrincipalRuntime implementation that was added during Task 406 execution, even though Task 406 was originally design-only.

The goal is not to expand PrincipalRuntime behavior. The goal is to make the existing implementation honest, typed, bounded, and aligned with Narada's authority invariants.

## Required Reading

- `.ai/tasks/20260422-406-principal-runtime-state-machine-design.md`
- `.ai/tasks/20260422-409-implicit-state-machine-inventory.md`
- `.ai/decisions/20260422-406-principal-runtime-state-machine.md`
- `.ai/decisions/20260422-409-implicit-state-machine-inventory.md`
- `SEMANTICS.md`
- `packages/layers/control-plane/src/principal-runtime/types.ts`
- `packages/layers/control-plane/src/principal-runtime/state-machine.ts`
- `packages/layers/control-plane/src/principal-runtime/registry.ts`
- `packages/layers/cli/src/commands/principal.ts`
- `packages/layers/cli/src/main.ts`
- `packages/layers/cli/src/commands/doctor.ts`

## Context

Task 406 requested a design for `PrincipalRuntime`. Implementation code was added during execution and later acknowledged in Task 406 closure notes. That implementation must now be reviewed as code, not merely as design residue.

Known suspected issues:

| Area | Suspicion | Why It Matters |
|------|-----------|----------------|
| State count | `types.ts` says "12 canonical states" while the union appears to define 11 | Documentation/type mismatch creates false confidence |
| JSON registry hydration | `JsonPrincipalRuntimeRegistry` reaches into `InMemoryPrincipalRuntimeRegistry` private `principals` map through an unsafe cast | Breaks encapsulation and can hide persistence bugs |
| Registry root selection | CLI `getRegistry(configPath)` appears to ignore `configPath` and uses `resolve(".")` | Runtime state may be stored in the wrong repo/directory |
| Identity/runtime smear | `principal attach` uses the same value for `runtime_id` and `principal_id` | Collapses stable identity with runtime instance |
| Persistence semantics | JSON registry persistence is queued/best-effort without explicit flush for CLI commands | CLI may exit before state is written |
| Authority boundary | PrincipalRuntime must remain advisory/ephemeral and must not grant lease, foreman, or Site authority | Preserves intelligence-authority separation |

## Required Work

1. Audit the current implementation.

   Inspect all PrincipalRuntime source and tests. Produce an execution-note table with:

   - issue;
   - file;
   - severity;
   - fix applied or explicit deferral;
   - invariant protected.

2. Fix documentation/type drift.

   - Correct the canonical state count or state list.
   - Ensure comments, decision artifact, and task closure notes agree.

3. Remove unsafe registry hydration.

   Replace the private-map cast with one of:

   - a typed `hydrate()` / `load()` method on `InMemoryPrincipalRuntimeRegistry`;
   - a constructor option for initial records;
   - another explicit typed path.

   The fix must not weaken transition validation for normal runtime mutations.

4. Fix registry path semantics.

   Decide and implement where CLI PrincipalRuntime state lives:

   - operation repo root;
   - configured Site root;
   - config-adjacent state file;
   - explicit CLI `--state-dir`.

   The chosen rule must be deterministic and documented. Do not silently store state in whichever directory the process happens to run from unless that is explicitly chosen and justified.

5. Separate `principal_id` from `runtime_id`.

   `principal_id` is stable identity. `runtime_id` is a runtime attachment instance. The CLI must not force them to be identical.

   Required behavior:

   - allow explicit `--principal <principal-id>`;
   - allow explicit `--runtime <runtime-id>` or generate a runtime id;
   - preserve compatibility only if it does not reintroduce semantic smear.

6. Ensure CLI persistence is reliable.

   If JSON persistence remains queued/best-effort, add a public flush/close method and call it before CLI command return. Alternatively make CLI writes synchronous enough that command exit cannot lose state.

7. Add focused tests.

   Cover at minimum:

   - JSON registry loads records without private casts;
   - CLI attach stores separate principal/runtime ids;
   - CLI state path is deterministic;
   - attach/detach changes persist across registry reload;
   - PrincipalRuntime state does not create or mutate work leases.

8. Preserve boundaries.

   PrincipalRuntime must remain:

   - ephemeral/advisory;
   - not authority-bearing by itself;
   - not a substitute for scheduler leases;
   - not a substitute for foreman decisions;
   - not a Site health source of truth.

## Non-Goals

- Do not add a durable SQL table for PrincipalRuntime.
- Do not make PrincipalRuntime required for daemon execution.
- Do not connect PrincipalRuntime to automatic task assignment in this task.
- Do not change scheduler lease semantics.
- Do not create a generic IAM system.
- Do not create derivative task-status files.
- Do not run broad test suites unless focused tests reveal a package-level reason.

## Acceptance Criteria

- [x] PrincipalRuntime state count/list/comments are consistent.
- [x] JSON registry hydration no longer uses an unsafe private-map cast.
- [x] CLI registry path semantics are deterministic and documented.
- [x] `principal_id` and `runtime_id` are represented separately in CLI attach behavior.
- [x] CLI writes cannot be silently lost due to queued persistence at process exit.
- [x] Focused tests cover registry hydration, CLI attach identity/runtime separation, deterministic state path, reload persistence, and no lease mutation.
- [x] Task 406 closure notes remain honest about implementation deviation.
- [x] No PrincipalRuntime code grants authority, leases, foreman decisions, Site truth, or outbound permission.

## Execution Notes

### Audit Table

| # | Issue | File | Severity | Fix Applied | Invariant Protected |
|---|-------|------|----------|-------------|---------------------|
| 1 | State count comment says "12" but union defines 11 states | `types.ts` | Low | Changed comment to "11 canonical states" | Type/documentation consistency |
| 2 | JSON registry hydration casts through `unknown` to reach private `principals` map | `registry.ts` | High | Added `initialRecords` constructor option to `InMemoryPrincipalRuntimeRegistry`; `JsonPrincipalRuntimeRegistry` hydrates through public constructor path | Encapsulation, transition validation integrity |
| 3 | CLI `getRegistry()` ignores `configPath` and uses `resolve(".")` | `principal.ts` | High | `getRegistry()` now derives state dir from `dirname(configPath)` | Deterministic persistence |
| 4 | `principal attach` sets `principal_id = runtime_id` | `principal.ts` | High | Added `--runtime`; `principal_id` and `runtime_id` are separate; fallback generates distinct values | Identity/runtime separation |
| 5 | JSON persistence is queued/best-effort; CLI may exit before flush | `registry.ts` | Medium | Added public `flush()` and CLI commands await it before returning | Reliable persistence |
| 6 | `doctor.ts` used different registry-root semantics | `doctor.ts` | Medium | Principal runtime check now uses explicit `stateDir ?? rootDir` rather than arbitrary process cwd | Deterministic persistence |
| 7 | No tests for PrincipalRuntime registry behavior | `test/unit/principal-runtime/registry.test.ts` | Medium | Added focused registry tests for hydration, persistence, identity/runtime separation, and boundaries | Correctness, boundary preservation |
| 8 | `active_session_id` is not persisted in snapshot | `registry.ts` | Low | Documented as intentional; `active_session_id` remains ephemeral | Ephemeral semantics |
| 9 | `created_at` reconstructed from `state_changed_at` on hydration | `registry.ts` | Low | Accepted as advisory for ephemeral registry | Ephemeral semantics |

### Boundary Verification

| Boundary | Check | Result |
|----------|-------|--------|
| No lease creation | `principal-runtime/` has no scheduler import and no `work_item_leases` reference | Pass |
| No foreman decision authority | `principal-runtime/` has no foreman import and no decision writes | Pass |
| No outbound command mutation | `principal-runtime/` has no outbound import and no outbound writes | Pass |
| No Site truth claims | `principal-runtime/` does not write Site health, cursor, or trace state | Pass |
| Advisory only | `canClaimWork` and `canExecute` remain pure predicates | Pass |
| Ephemeral by design | Stored in JSON outside coordinator SQLite | Pass |

### Verification

Focused verification reported by implementer:

```bash
pnpm --filter @narada2/control-plane exec vitest run test/unit/principal-runtime/registry.test.ts
```

The derivative file `.ai/tasks/20260422-418-execution-notes.md` was created during execution and removed during review because task execution evidence belongs in the canonical task file.
