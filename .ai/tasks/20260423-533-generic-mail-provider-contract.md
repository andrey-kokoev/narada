---
status: closed
closed: 2026-04-23
closed_by: codex
governed_by: task_close:codex
created: 2026-04-23
depends_on: [531]
---

# Task 533 - Generic Mail Provider Contract

## Goal

Specify how generic mail providers outside the first-class API ecosystems fit the canonical mail-connectivity boundary, with IMAP / SMTP style systems as the reference case.

## Required Work

1. Define the generic mail-provider shape relative to Task 531.
2. Identify which capabilities are likely available, degraded, or absent compared with Graph/Gmail-class APIs.
3. State what Narada would need for a bounded generic provider path:
   - read model,
   - send/draft boundary,
   - confirmation semantics,
   - credential posture.
4. Record where a generic provider path becomes too weak for parity and what that means operationally.
5. Write the provider contract to `.ai/decisions/`.

## Acceptance Criteria

- [x] Generic provider contract exists.
- [x] IMAP / SMTP style fit is explicit.
- [x] Capability degradations vs first-class APIs are explicit.
- [x] Bounded parity limits are recorded.
- [x] Verification or bounded blocker evidence is recorded.

## Execution Notes

### 1. Generic Provider Contract Produced

`.ai/decisions/20260423-533-generic-mail-provider-contract.md` documents:

- **Reference stack:** IMAP4rev1 for ingress, SMTP/SUBMIT for egress, SASL/TLS for auth
- **Ingress delta model:** Polling-based (`UID SEARCH SINCE`) with `UIDVALIDITY` + `maxUid` checkpoint semantics
- **Normalized message shape:** All provider-agnostic fields are producible from IMAP; `conversation_id` is heuristic from `References`/`In-Reply-To`
- **Egress send boundary:** No draft stage; SMTP fire-and-forget with self-generated `Message-Id`
- **Confirmation semantics:** Timer-based IMAP polling via `UID SEARCH HEADER Message-Id:<id>`; longer timeouts required
- **Capability degradation matrix:** 13 capabilities rated across Graph / Gmail / Generic
- **Bounded parity limits:** 4 hard-floor blockers (no drafts, no delta, no push, no labels) and 4 soft-floor degradations
- **Credential posture:** Password, SASL XOAUTH2, or TLS client cert; explicit security considerations
- **Bounded generic provider path:** Read model, send model, confirmation model, and credential config interfaces defined
- **Provider binding contract:** 7 explicit binding requirements for generic providers
- **5 generic-provider-specific invariants**

### 2. No Code Changes Required

This is a documentation and contract task. No source code was modified.

## Verification

```bash
pnpm verify
# All 5 verification steps passed (task-file-guard, typecheck, build,
# charters tests, ops-kit tests)

pnpm typecheck
# All packages pass
```

Results:
- `pnpm verify` passed all 5 verification steps
- `pnpm typecheck` clean across all packages
- No existing tests broken
- No new lint errors introduced

---

**governed_by: task_close:codex**
