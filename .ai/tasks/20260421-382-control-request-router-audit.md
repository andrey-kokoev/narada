---
status: closed
closed: 2026-04-20
depends_on: [379]
---

# Task 382 — Safe Control Request Routing & Audit

## Assignment

Implement the control request router that forwards operator actions to Site-owned control APIs and logs every routing event.

## Context

Task 381 implements observation. This task implements the mutation boundary: the only path through which the console can affect a Site.

## Goal

Build an audited router that receives operator control requests, forwards them to the correct Site's control API, and logs the outcome.

## Required Work

1. Define control request envelope:
   ```typescript
   interface ConsoleControlRequest {
     requestId: string;
     siteId: string;
     scopeId?: string;
     actionType: "approve" | "reject" | "retry" | "cancel";
     targetId: string;
     targetKind: "work_item" | "outbound_command";
     payload?: Record<string, unknown>;
     requestedAt: string;
   }
   ```

2. Implement router:
   - Look up target Site's control endpoint from registry
   - Transform request into Site-native format
   - Forward to Site control API (HTTP for Cloudflare, function call or IPC for local)
   - Return Site's response verbatim to the operator

3. Implement audit logging:
   - Log every routed request to `registry_audit_log`
   - Record: request ID, site ID, action, target, timestamp, response status, response detail
   - Audit log is append-only

4. Enforce safety rules:
   - Router may only call known Site control endpoints
   - Router may not retry failed requests automatically
   - Router may not cache or assume success
   - Router must validate that the target Site exists in the registry

5. Add focused tests with mock Site control APIs.

## Non-Goals

- Do not implement Site-side control API validation (the Site owns that).
- Do not implement automatic retry or escalation.
- Do not implement the CLI surface (Task 383).
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] Router forwards requests to mock Site control APIs.
- [x] Audit log records every routed request with response status.
- [x] Router rejects requests for unknown Sites.
- [x] Router does not retry failed requests.
- [x] Focused tests prove routing and audit without live Sites (11 tests, all pass).
- [x] No derivative task-status files are created.
