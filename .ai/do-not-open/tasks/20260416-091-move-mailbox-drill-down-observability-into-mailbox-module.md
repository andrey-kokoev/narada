# Task 091 — Move Mailbox Drill-Down Observability into Mailbox Module

## Objective
Isolate mailbox-specific drill-down queries and types from generic observability modules.

## Why
Generic observability is now mostly neutral, but mail-specific drill-down still lives in shared observability surfaces:
- mailbox vertical view
- mail execution detail
- mail-specific compatibility mappings

That is understandable historically, but it weakens the structural clarity of the mailbox boundary.

## Required Changes

### 1. Extract mailbox-specific observability
Move mail-specific query functions and types into explicitly mail-scoped observability files/modules.

Examples:
- `observability/mailbox.ts`
- `observability/mailbox-types.ts`

### 2. Keep generic observability purely neutral
Shared observability modules should contain only:
- neutral summaries
- generic timelines
- scope/context/work/intent/execution over neutral naming

### 3. Update UI/API imports
Mailbox vertical pages/routes may import mailbox observability modules directly.
Generic pages/routes must not.

### 4. Add guardrails
Add lint/tests to prevent generic modules from importing mailbox observability modules.

## Acceptance Criteria
- Mailbox drill-down logic is extracted from generic observability files
- Generic observability remains neutral
- UI/API continue to function
- Guardrails pass

## Invariant
Mailbox-specific observability belongs to the mailbox vertical, not the shared kernel read model.