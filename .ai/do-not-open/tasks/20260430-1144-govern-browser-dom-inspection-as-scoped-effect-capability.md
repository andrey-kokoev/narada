---
status: opened
---

# Govern browser DOM inspection as scoped effect capability

## Chapter

Canonical Inbox Promotions

## Goal

Add a governed capability model for browser DOM inspection so agents can request live UI inspection without receiving ambient browser authority.

## Context

Source inbox envelope: env_fa18b567-c790-4a6e-afd6-6689e54a58c5

Source: agent_report:narada-cpy.architect-chat

Envelope kind: proposal

Summary: Browser DOM inspection is useful for diagnosing live UI/data-flow behavior, but it must not become ambient browsing authority. Any role may request it, but use must be admitted by Operator approval or explicit Site capability grants scoped to principal/role/origin/path/interaction/evidence.

## Required Work

0. Source summary: Browser DOM inspection is useful for diagnosing live UI/data-flow behavior, but it must not become ambient browsing authority. Any role may request it, but use must be admitted by Operator approval or explicit Site capability grants scoped to principal/role/origin/path/interaction/evidence.
1. Read source inbox envelope env_fa18b567-c790-4a6e-afd6-6689e54a58c5 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Browser DOM inspection is default-denied unless admitted by Operator approval or explicit Site capability grant.
- [ ] Capability grants are scoped by principal or role, Site, origin, path, allowed interaction mode, evidence sink, redaction policy, and expiry or revocation posture.
- [ ] Readonly DOM/network/screenshot evidence modes are separated from mutation-like browser actions.
- [ ] CLI or documented command shape lets agents request the capability and receive admitted, deferred, or rejected status with repair guidance.
- [ ] Evidence redacts cookies, tokens, signed URLs, secrets, and sensitive query strings by default.
