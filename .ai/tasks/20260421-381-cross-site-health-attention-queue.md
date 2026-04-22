---
status: closed
closed: 2026-04-21
depends_on: [379]
---

# Task 381 — Cross-Site Health Aggregation & Attention Queue

## Assignment

Implement cross-Site health aggregation and the attention queue derivation.

## Context

Task 380 implements the registry. This task adds the derived observation layer that tells the operator what needs attention across all discovered Sites.

## Goal

Build a read-only aggregator that queries each Site's observation API, computes health summaries, and derives an attention queue.

## Required Work

1. Implement health aggregation:
   - For each registered Site, query its health endpoint (or read cached health)
   - Aggregate into a cross-Site summary: counts of healthy / degraded / critical / auth_failed
   - Surface per-Site health view with last cycle time, consecutive failures, message

2. Implement attention queue derivation:
   - Query each Site for stuck items:
     - `failed_retryable` work items or outbound commands
     - `critical` or `auth_failed` health status
     - Pending drafts awaiting operator approval
     - Credential-needed conditions from doctor/preflight results, Site health, effect-worker auth failures, charter runtime probe failures, or credential resolver errors
   - Aggregate into a unified queue sorted by severity and recency
   - Each queue item carries: `site_id`, `scope_id`, `item_type`, `item_id`, `severity`, `summary`, `url_or_command`
   - Credential-needed items use `item_type: "credential_required"` and must include the affected capability/tool/adapter, missing credential name or class, blocked capability, and operator remediation path
   - Credential-needed items must support subtype `interactive_auth_required` for cases such as Microsoft Graph delegated auth requiring `az login`
   - `interactive_auth_required` items must present an operator-run command or setup surface, not run interactive auth automatically
   - Example remediation: `az login --tenant <tenant-id>` followed by `narada doctor -c <config>`
   - Credential-needed items must not include secret values, raw tokens, or sensitive config material

3. Implement notification routing:
   - When a Site transitions to `critical` or `auth_failed`, emit a notification
   - Respect per-channel cooldown (default 15 minutes)
   - Log suppressed notifications as traces
   - Use the existing `OperatorNotification` envelope from `notification.ts`

4. Add focused tests with mock Site observation APIs.
   - Include a test proving missing credentials produce a `credential_required` attention item with remediation metadata and no secret material.
   - Include a test proving interactive auth failures produce `credential_required` + `interactive_auth_required` with an operator command, without invoking `az login` or any interactive subprocess.

## Non-Goals

- Do not mutate Site state.
- Do not implement the control router (Task 382).
- Do not implement the CLI surface (Task 383).
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Health aggregation produces correct cross-Site summary from mock Sites.
- [x] Attention queue derives stuck items from mock Site observation APIs.
- [x] Attention queue derives `credential_required` items from credential/auth/probe failures without exposing secret material.
- [x] Interactive auth failures surface as operator-required remediation, not automatic login attempts.
- [x] Notification respects cooldown and logs suppressions.
- [x] Removing the attention queue does not affect any Site state.
- [x] Focused tests prove aggregation and derivation without live Sites.
- [x] No derivative task-status files are created.

## Verification

```bash
pnpm --filter @narada2/windows-site exec vitest run \
  test/unit/aggregation.test.ts \
  test/unit/cross-site-notifier.test.ts
# 37 tests pass
```
