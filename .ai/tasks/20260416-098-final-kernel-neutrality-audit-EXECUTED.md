# Task 098 — Final Kernel Neutrality Audit (EXECUTED)

**Auditor:** Kimi Code CLI  
**Date:** 2026-04-17  
**Scope:** Code, public API, docs, runtime/control modules, observability, lint allowlists  

---

## Verdict

**closed with minor exceptions**

The generalized kernel is now the default reading of the repo. The control plane, scheduler, foreman facade (generic), coordinator store (generic), intent system, and generic observability queries all speak in neutral terms (`context_id`, `scope_id`, `work_item`, `intent`, `execution_attempt`). Mailbox-specific concepts are explicitly scoped to named vertical modules or legacy compatibility surfaces.

---

## Audit Method

1. **Public API audit** — reviewed `packages/exchange-fs-sync/src/index.ts`, CLI exports, daemon exports.
2. **README audit** — reviewed root and all package READMEs.
3. **Runtime/control audit** — grep for `conversation_id`, `thread_id`, `mailbox_id` in `src/foreman`, `src/scheduler`, `src/coordinator`, `src/intent`, `src/executors`, `src/sources`, `src/facts`.
4. **Observability audit** — reviewed `src/observability/queries.ts`, `src/observability/mailbox.ts`, `src/observability/mailbox-types.ts`.
5. **Lint audit** — ran `pnpm kernel-lint` and `tsx scripts/kernel-lint.ts --stale --stats --wildcards`.
6. **Type-check & test verification** — `pnpm typecheck` clean; `exchange-fs-sync` 847 passed, `charters` 64 passed, `cli` 15 passed, `daemon` 111 passed.

---

## Findings

### ✅ Clean — Kernel-First Surfaces

| Surface | Finding |
|---------|---------|
| **Public exports** (`src/index.ts`) | Kernel-agnostic types exported first. Mail-vertical utilities are explicitly named (`MailboxContextStrategy`, `MailboxContextMaterializer`, `deriveThreadId`, `MailLifecycleAdapter`, `MailConfirmationResolver`, `getMailExecutionDetails`). No hidden defaults. |
| **Control plane** | `ForemanFacade`, `Scheduler`, `CoordinatorStore`, `IntentStore`, `ExecutionCoordinator` all use `context_id` / `scope_id`. |
| **Generic observability** | `queries.ts` is fully neutral. Mail-specific observation is confined to `observability/mailbox.ts` and `observability/mailbox-types.ts`. |
| **Sources** | `TimerSource`, `WebhookSource`, `FilesystemSource` are first-class peers. `ExchangeSource` is explicitly mail-branded. |
| **Docs / READMEs** | Root README and package READMEs all frame the system as a generalized kernel with mailbox as the *first vertical*. |
| **Kernel lint** | Zero violations. Allowlist: 9 files, 19 patterns. Zero stale entries. Zero wildcards. |

### ⚠️ Minor Exceptions — Intentional or Legacy

| Exception | Location | Rationale / Impact |
|-----------|----------|-------------------|
| **Outbound command types** | `src/outbound/types.ts` — `OutboundCommand` fields `conversation_id` and `mailbox_id` | The physical DB table already uses neutral columns (`context_id`, `scope_id`) with SQL aliases for compatibility, but the canonical TypeScript interface still carries mail-shaped names. This is the largest remaining neutralization debt, but it is surfaced explicitly in outbound-specific APIs only. |
| **Health file API** | `src/health.ts` — `HealthFileData.mailboxId`, `HealthWriterOptions.mailboxId` | Generic health infrastructure still branded to `mailboxId`. This is a legacy naming artifact in a generic utility module. |
| **Multi-mailbox health** | `src/health-multi.ts` — `MailboxHealth`, `MailboxSyncResult`, `totalMailboxes`, `changedConversations` | This module is the multi-*mailbox* orchestration layer, not the kernel itself. It is acceptably mail-branded because it sits above the kernel and is not reused by peer verticals (timer, webhook, filesystem). |
| **Agent trace navigation** | `src/agent/traces/types.ts` — `AgentTrace.conversation_id` | Traces are commentary (non-authoritative). The field is used for navigational correlation only, as documented in the file header. |
| **Config legacy alias** | `src/config/types.ts`, `schema.ts`, `load.ts` — `ScopeConfig.mailbox_id` | Explicitly documented as backward-compatibility bridge. The canonical field is `scope_id`. |

---

## Conclusion

No *major hidden mailbox-default surfaces* remain. The exceptions above are either:

1. **Explicitly mail-local modules** (`health-multi.ts`, `observability/mailbox.ts`), or
2. **Legacy compatibility aliases** (`ScopeConfig.mailbox_id`), or
3. **Non-authoritative commentary** (`AgentTrace.conversation_id`), or
4. **Minor type-level debt** (`OutboundCommand` fields, `health.ts` naming) that does not leak mailbox semantics into the kernel runtime.

The architectural closure criterion is met: a reader opening the repo today will encounter the generalized kernel first, and the mailbox vertical second.

---

## Signed

Kimi Code CLI — 2026-04-17
