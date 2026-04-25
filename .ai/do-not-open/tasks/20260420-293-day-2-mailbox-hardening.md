# Task 293: Day-2 Mailbox Hardening

## Chapter

Mailbox Saturation

## Context

The mailbox vertical is structurally coherent, but still light on operational stress cases. Day-2 confidence requires focused hardening around auth expiry, Graph drift, attachment-heavy flows, and recovery drills under realistic mailbox conditions.

## Goal

Harden the mailbox vertical against real operational drift without reopening core design.

## Required Work

### 1. Auth-expiry and degraded-state drills

Document and, where appropriate, tighten the operator/runtime behavior for:

- expired credentials
- revoked credentials
- transient token acquisition failure
- degraded draft-only mode

### 2. Graph edge-case inventory

Identify and classify the highest-value live Graph edge cases still insufficiently covered, such as:

- draft recreation after remote loss
- remote mutation or partial mismatch
- missing sent confirmation timing
- attachment-bearing replies

### 3. Recovery drill shape

Define the minimum coherent recovery drills for mailbox operations:

- recover after daemon interruption
- recover after outbound ambiguity
- recover after auth restoration

### 4. Close the highest-value hardening gaps

Implement or document the bounded hardening changes that most directly improve operational trust.

## Non-Goals

- Do not attempt exhaustive Graph compatibility coverage.
- Do not broaden into CRM or ticket integrations.
- Do not replace focused verification with blanket full-suite runs.

## Acceptance Criteria

- [x] Day-2 mailbox failure modes are explicitly enumerated and classified.
- [x] Auth/degraded-state operator behavior is coherent and documented.
- [x] Mailbox recovery drills are defined against current runtime surfaces.
- [x] Focused hardening closes the highest-value live-operational gaps.

## Completed Work

1. **Auto token cache invalidation on 401/403**: `GraphHttpClient` calls `tokenProvider.invalidateAccessToken()` when receiving auth errors. `SharedTokenProvider` and `ClientCredentialsTokenProvider` both implement cache clearing.
2. **`retry_auth_failed` operator action**: New CLI command (`narada retry-auth-failed`) and operator action surface (available to the daemon UI and any executor caller) to bulk-retry commands that failed due to auth errors after credentials are restored.
3. **State machine relaxation**: `failed_terminal` can now transition to `approved_for_send` and `draft_ready` to support auth recovery. The transition is only exercised through the `retry_auth_failed` operator action path; there is no dedicated API boundary enforcing this, so callers must respect the convention.
4. **Auth error test coverage**: Added unit tests for auth failure during draft recreation, verification, and send in `SendExecutionWorker`.
5. **`getCommandsByScope` store method**: Added to `OutboundStore` interface and `SqliteOutboundStore` to support scope-scanned recovery actions.
6. **Documentation**: `docs/day-2-mailbox-hardening.md` enumerates failure modes, recovery drills, and operational runbook snippets.
