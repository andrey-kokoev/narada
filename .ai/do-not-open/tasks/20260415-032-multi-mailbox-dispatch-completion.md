# Multi-Mailbox Dispatch Completion

## Context

Single-mailbox daemon dispatch is now real.

Multi-mailbox operation remains structurally incomplete because sync and dispatch are not yet fully joined per mailbox.

## Goal

Enable one daemon process to:

> sync multiple mailboxes, derive changed conversations per mailbox, and run independent foreman/scheduler dispatch loops without cross-mailbox state leakage.

## Required Work

### 1. Define Multi-Mailbox Change Signal

Extend the multi-mailbox sync path so dispatch receives, per mailbox:

- changed conversations
- revision information or equivalent
- sync completion metadata

### 2. Run Per-Mailbox Dispatch

For each configured mailbox:

- open/supersede work
- schedule runnable work
- execute runtime
- materialize outbound commands
- reach quiescence independently

### 3. Preserve Isolation

Ensure:

- coordinator state is mailbox-scoped
- tool/action policy is mailbox-scoped
