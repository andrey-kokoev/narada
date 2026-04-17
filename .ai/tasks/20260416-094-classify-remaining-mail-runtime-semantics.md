# Task 094 — Classify Remaining Mail Runtime Semantics

## Objective
Separate **essential mail-vertical semantics** from **historical mailbox-default residue** in runtime/control modules.

## Classification Summary

### 1. `foreman/facade.ts`

| Concept | Classification | Rationale | Movability |
|---------|---------------|-----------|------------|
| `MailboxContextStrategy` as constructor default | **historical residue** | Generic foreman should not default to any vertical strategy; caller should inject the correct strategy. | Can be removed once all callers (daemon, tests) explicitly pass `contextFormationStrategy`. |
| `buildContextRecord()` | **kernel-generic** | Produces a vertical-agnostic `ContextRecord` using `context_id` / `scope_id`. | Already correct. |
| `toThreadRecord()` | **historical residue** | Exists solely to map neutral `ContextRecord` into legacy `ThreadRecord` for FK compliance with the old `thread_records` SQLite table. | Must remain until the schema migration removes `thread_records` entirely. Then delete. |
| `upsertThread()` calls in `onContextsAdmitted` and `resolveWorkItem` | **historical residue** | Same as `toThreadRecord`: keeps the legacy table in sync so that downstream mail-compat queries and FK constraints do not break. | Must remain until `thread_records` is dropped. |
| `MailCompatCoordinatorStore` dependency type | **transitional mail-vertical essential** | Needed only for `upsertThread` and conversation-record wrapper methods. Once `thread_records` and conversation compat wrappers are removed, this can narrow to plain `CoordinatorStore`. | Move inward to mail-boundary module after schema cleanup. |
| `getDecisionsByContext` + `outbound_id` recovery in `resolveWorkItem` | **kernel-generic** | Operates on neutral `context_id`/`scope_id` and `work_item_id`. | Already correct. |

### 2. `foreman/context.ts`

| Concept | Classification | Rationale | Movability |
|---------|---------------|-----------|------------|
| `PolicyContext` interface | **kernel-generic** | Fully neutral: `context_id`, `scope_id`, `revision_id`, `change_kinds`, `facts`. | Already correct. |
| `ContextFormationStrategy` interface | **kernel-generic** | Vertical-agnostic contract. | Already correct. |
| `MailboxContextStrategy` | **mail-vertical essential** | Explicitly parses mail-shaped facts (`conversation_id`, `thread_id`) and maps them into neutral `PolicyContext`. This is exactly what a vertical strategy should do. | Keep as-is. It is the canonical mail strategy. |
| `TimerContextStrategy` / `WebhookContextStrategy` / `FilesystemContextStrategy` | **kernel-generic** | First-class peer strategies using neutral fact types. | Already correct. |
| `conversation_id` / `thread_id` inside `MailboxContextStrategy` | **mail-vertical essential** | These identifiers are intrinsic to the Exchange/Graph mailbox vertical; extracting them is the strategy's whole purpose. | Keep inside `MailboxContextStrategy`. |

### 3. `charter/envelope.ts`

| Concept | Classification | Rationale | Movability |
|---------|---------------|-----------|------------|
| `MailboxContextMaterializer` | **mail-vertical essential** | Reads the compiler's mail-specific filesystem views (`views/by-thread/{context_id}/members`) and `messages/{id}/record.json` to produce the envelope's `context_materialization`. This is the normative boundary between compiler state and charter runtime for the mail vertical. | Keep as-is. Future verticals will add their own materializers. |
| `normalizeMessageForEnvelope()` | **mail-vertical essential** | Canonical projection from `NormalizedMessage` (compiler type) into the charter-facing message shape. It is deterministic, explicit, and stable. | Keep as-is. Only relevant to mail vertical. |
| `getThreadMessageIds()` | **mail-vertical essential** | Walks `views/by-thread`, a mail-vertical derived view. | Keep as-is. |
| `NormalizedMessage` import | **mail-vertical essential** | Only consumed by mail-specific materializer and normalizer. | Acceptable because this file is a hybrid envelope builder that hosts both generic and mail-specific code. |
| `FileMessageStore` import | **mail-vertical essential** | Only used by `MailboxContextMaterializer`. | Acceptable for same reason. |
| `selectMaterializer()` fallback to `MailboxContextMaterializer` | **historical residue** | Defaulting to mail when prefix does not match `timer:`, `webhook:`, or `fs:` is acceptable vertical detection, but it encodes a mail-default assumption. | Can be made explicit by requiring the caller to provide a materializer, or by registering vertical materializers in a map rather than a prefix fallback. |
| `resolveVertical()` mail fallback | **kernel-generic with mail-default residue** | The function itself is neutral, but the `"mail"` fallback is a vestige of mailbox-as-default. | Acceptable for now because it is only a hint in the envelope; can be replaced with explicit vertical registration later. |
| `buildInvocationEnvelope()` | **kernel-generic** | Constructs the envelope from neutral store types and `PolicyContext`. | Already correct. |
| `TimerContextMaterializer` / `WebhookContextMaterializer` / `FilesystemContextMaterializer` | **kernel-generic** | Peer vertical materializers. | Already correct. |

### 4. `foreman/handoff.ts`

| Concept | Classification | Rationale | Movability |
|---------|---------------|-----------|------------|
| `OutboundHandoff` class | **kernel-generic** | The handoff pattern (decision → durable command → worker execution) is vertical-agnostic. | Already correct. |
| `createCommandFromDecision` using `conversation_id` / `mailbox_id` columns | **mail-vertical essential** | The *current* outbound command schema is mail-shaped because the only mature effect vertical is mail. The handoff correctly bridges neutral `context_id`/`scope_id` into mail-specific storage columns. | Keep as-is. When a second effect vertical (e.g., API call, ticket creation) matures, this module will need either a generalized intent schema or a vertical-specific handoff subclass. |
| `reply_to_message_id`, `to`, `cc`, `bcc`, `subject`, `body_text`, `body_html` in `OutboundVersion` | **mail-vertical essential** | These fields model a mail message. They belong to the mail effect schema. | Keep as-is. |
| `recoverWorkItemIfCommandExists()` | **kernel-generic** | Operates on neutral IDs (`workItemId`, `contextId`, `scopeId`). | Already correct. |
| `cancelUnsentCommandsForContext()` | **kernel-generic** | Same: neutral `contextId`. | Already correct. |

### 5. `coordinator/thread-context.ts`

| Concept | Classification | Rationale | Movability |
|---------|---------------|-----------|------------|
| `ThreadContextHydrator` | **mail-vertical essential** | Reads `views/by-thread` (a mail-specific compiler projection) and returns `NormalizedThreadContext` containing `NormalizedMessage[]`. This is inherently mail-local. | Keep as-is. Should not be used by generic kernel code; only by mail-vertical observation or charter materialization paths. |
| `NormalizedThreadContext` import from `mail-compat-types` | **mail-vertical essential** | Expected for a mail-vertical hydrator. | Keep as-is. |

### 6. `coordinator/thread-id.ts`

| Concept | Classification | Rationale | Movability |
|---------|---------------|-----------|------------|
| `deriveThreadId()` | **mail-vertical essential** | Pure mail-vertical identity rule: `thread_id === conversation_id` for Exchange messages. | Keep as-is. Only relevant to mail vertical. |

### 7. `coordinator/mail-compat-types.ts`

| Concept | Classification | Rationale | Movability |
|---------|---------------|-----------|------------|
| `ThreadRecord` | **historical residue** | Legacy row shape for `thread_records` table. | Remove when `thread_records` table is dropped. |
| `ConversationRecord` / `ConversationRevision` | **historical residue** | Mail-era naming retained for backward compatibility with observation queries and older store wrappers. | Can be renamed/removed once observation and store consumers migrate to `ContextRecord` / `ContextRevision`. |
| `NormalizedThreadContext` | **mail-vertical essential** | Output type of `ThreadContextHydrator`. It is correctly scoped to mail vertical. | Keep as-is. |
| `MailCompatCoordinatorStore` | **transitional mail-vertical essential** | Extends `CoordinatorStore` with mail-compat wrappers (`upsertThread`, `upsertConversationRecord`). | Collapse back into plain `CoordinatorStore` once legacy wrappers are deleted. |
| `contextRecordToConversationRecord()` | **historical residue** | Adapter from neutral `ContextRecord` to legacy `ConversationRecord`. | Remove once compat wrappers are no longer needed. |

---

## What Can Be Moved Outward Immediately

1. **None of the *essential* mail-vertical concepts should move** — they are already at the correct boundary (`MailboxContextStrategy`, `MailboxContextMaterializer`, `ThreadContextHydrator`, `deriveThreadId`, mail-compat types file).

2. **Historical residue that *can* be removed immediately** (with schema changes):
   - `thread_records` table and all `upsertThread` / `toThreadRecord` logic.
   - `ConversationRecord` and `ConversationRevision` aliases/wrappers.
   - `MailCompatCoordinatorStore` interface can collapse to `CoordinatorStore`.

3. **Historical residue that requires caller updates first**:
   - `MailboxContextStrategy` default in `DefaultForemanFacade` constructor.
   - `MailboxContextMaterializer` fallback in `selectMaterializer()`.

## Follow-on Cleanup Tasks

| # | Task | Estimated Effort | Blocker |
|---|------|------------------|---------|
| 1 | Remove `thread_records` from SQLite schema and drop `toThreadRecord` / `upsertThread` | Small | Need to confirm no observation query depends on `thread_records` FK. |
| 2 | Remove `MailCompatCoordinatorStore` and `ConversationRecord` wrappers | Small | Task 1 + verify observation queries use `context_records` directly. |
| 3 | Make `contextFormationStrategy` required in `ForemanFacadeDeps` | Small | Update all callers (daemon, tests). |
| 4 | Replace `selectMaterializer` prefix fallback with explicit materializer registry | Small | Design a `Map<vertical, ContextMaterializer>` injection pattern. |

## Invariant Preserved

Mail-specific behavior remains only where it is **explicitly justified as vertical-local**. No unclassified residue remains in generic runtime/control surfaces.
