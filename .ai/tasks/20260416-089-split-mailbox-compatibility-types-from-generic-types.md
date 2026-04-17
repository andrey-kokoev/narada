# Task 089 — Split Mailbox Compatibility Types from Generic Types

## Objective
Separate mailbox-era compatibility types from generic/kernel-facing types so the boundary is structural, not just conventional.

## Why
Task 087 added docs and lint guardrails, but mailbox-era types still coexist near generic types:
- `ConversationRecord`
- mailbox-shaped field names used for compatibility mapping
- mixed neutral + mail compatibility in shared store/type files

That means the boundary still depends too much on discipline and allowlists.

## Required Changes

### 1. Create explicit mail-compatibility type surface
Move mailbox-era compatibility types into clearly mail-scoped files/modules.

Examples:
- `mail-compat-types.ts`
- `mailbox/store-compat.ts`
- or equivalent structure

### 2. Keep generic types neutral only
Generic type files should expose only:
- `ContextRecord`
- neutral revision types
- neutral handoff types
- neutral scope/context naming

### 3. Update imports
Ensure generic modules import only generic types.
Ensure mailbox modules import compatibility types where needed.

### 4. Add lint/test guardrails
Fail CI if generic modules import mail-compatibility type files.

## Acceptance Criteria
- Generic type modules contain no mailbox-era compatibility types
- Mailbox compatibility types live in explicitly mail-scoped files
- Generic modules do not import mailbox compatibility types
- Tests/lints pass

## Invariant
Mailbox compatibility must be structurally isolated, not merely tolerated in shared files.