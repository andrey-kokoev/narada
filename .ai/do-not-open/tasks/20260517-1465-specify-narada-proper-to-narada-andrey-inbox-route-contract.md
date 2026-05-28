---
status: closed
depends_on: [1221, 1463]
closed_at: 2026-05-17T20:32:41.127Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Specify narada-proper to narada-andrey inbox route contract

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1464-1468-cross-site-mcp-inbox-route-narada-andrey.md

## Goal

Define the route and capability contract for Narada proper to submit inert Canonical Inbox envelopes to narada-andrey through MCP fabric.

## Context

A durable route should be an addressability record plus a capability/consent posture, not an assumption that knowing a Site name grants delivery or admission.

## Required Work

1. Define route record fields for `site:narada-andrey`: target kind/ref, authority locus, address kind/ref, transport, capability kind/action, priority, evidence ref, active state.
2. Define required capability grant shape for `inbox_stage_submission_workflow`, `inbox_submit_observation`, and typed envelope submission if admitted.
3. Define target Site local admission/refusal responsibilities and receipt expectations.
4. Define repair commands and refusal messages for missing route, missing grant, missing target root, unsupported transport, and unavailable target.
5. Produce a versioned product artifact or decision note.

## Non-Goals

- Do not implement the route before the target root/capability evidence exists.
- Do not grant task/config/secret authority.
- Do not require live narada-andrey mutation in tests.

## Execution Notes

- Added `docs/product/narada-andrey-mcp-inbox-route.v0.md`.
- Defined the required `site:narada-andrey` route record shape for current MCP fabric: `site_root`/`narada_site_root` address, `filesystem` transport, `cross_site_inbox.submit` capability posture, evidence ref, and active-state rules.
- Defined a minimum capability grant shape for staged submission, observation submission, and typed envelope submission.
- Specified refusal/repair cases for missing route, unsupported address/transport, missing target root, missing capability grant, target unavailability, and target local rejection.
- Preserved the distinction between route, capability, delivery receipt, and target Site local admission.
- Recorded current posture: no active route, no admitted target root, no outbound capability grant, and the approved registration-request outbox item remains undelivered.

## Verification

- `rg -n "Site name is not addressability|Required Route Record|Capability Grant|Delivery is not target admission|No route record|Current Posture|out_216c869d" docs/product/narada-andrey-mcp-inbox-route.v0.md` passed.
- `git diff --check -- docs/product/narada-andrey-mcp-inbox-route.v0.md .ai/decisions/2026-05-17-narada-andrey-mcp-inbox-route-diagnostic.md .ai/do-not-open/tasks/20260517-1464-diagnose-narada-andrey-mcp-inbox-route-absence.md` passed.
- `narada routing resolve --target-kind site --target-ref narada-andrey --format json` still returns `status: not_found`, proving the contract task did not create a route prematurely.

## Acceptance Criteria

- [x] Route contract artifact exists.
- [x] Capability and consent requirements are explicit.
- [x] Refusal and repair cases are specified.
- [x] Delivery remains distinct from local target admission.
