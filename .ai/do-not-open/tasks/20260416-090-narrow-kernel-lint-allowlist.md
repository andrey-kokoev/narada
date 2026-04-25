# Task 090 — Narrow Kernel Lint Allowlist

## Objective
Reduce the current mailbox-era leakage allowlist to the minimum truly necessary surface.

## Why
Task 087 introduced the right lint patterns, but the allowlist is still fairly broad. That is acceptable immediately after migration, but it leaves too much room for quiet re-expansion of mailbox semantics.

## Required Changes

### 1. Review every allowlisted mailbox-era pattern
For each allowlisted file/pattern pair, classify it as:
- truly required
- transitional and removable now
- transitional and removable after Task 088/089

### 2. Remove unnecessary allowances
Tighten the allowlist wherever generic code no longer requires:
- `conversation_id`
- `mailbox_id`
- `conversation_records`
- `conversation_revisions`
- `outbound_commands`

### 3. Add comments for every remaining exception
Each remaining exception must state:
- why it exists
- why it is mail-specific
- what would remove it later, if applicable

### 4. Add regression test for allowlist shrinkage
Ensure CI can fail if new broad exceptions are introduced casually.

## Acceptance Criteria
- Allowlist is smaller and more justified
- Every remaining exception has an explicit rationale
- No generic module is tolerated without a precise reason
- CI passes

## Invariant
Exceptions must be scarce, explicit, and shrinking over time.