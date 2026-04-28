---
status: closed
amended_by: architect
amended_at: 2026-04-28T00:24:19.110Z
criteria_proved_by: architect
criteria_proved_at: 2026-04-28T00:26:39.591Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-04-28T00:26:40.079Z
closed_by: architect
governed_by: task_close:architect
closure_mode: agent_finish
---

# Implement mailbox predicate admission v0

## Chapter

Mailbox Predicate Admission

## Goal

Introduce a composable mailbox admission predicate model and implement participant-domain matching across sender and recipient fields so client correspondence can be admitted by any participant domain, not sender-only shortcuts.

## Context

Inbox envelope env_391173e5-d88b-4ca2-95a3-50f1f568afae reported that Staccato mailbox sync needs principled filtering: correspondence from andrey@kokoev.name should admit messages where any sender or receiver belongs to staccato2011.com. Existing admission only supports sender allowlists, which under-admits sent/copied client correspondence and tempts unsafe one-off patches.

## Required Work

1. Add a v0 mailbox predicate model under admission.mail.predicates with include/exclude composition. 2. Implement participant predicates over from, sender, to, cc, bcc, and any_participant fields with address and domain matching. 3. Preserve legacy allowed_sender_addresses and allowed_sender_domains as sender-only backward-compatible admission. 4. Add explicit unknown_participant_behavior while preserving unknown_sender_behavior fallback. 5. Validate config schema/load behavior and context admission behavior with focused tests. 6. Document participant-domain admission for client correspondence.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->
- Amended by architect at 2026-04-28T00:24:19.110Z: context, required work

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Mail admission config accepts a predicate model with participant address/domain predicates and include/exclude composition v0
- [x] Legacy allowed_sender_addresses and allowed_sender_domains remain backward-compatible
- [x] AdmittedMailContextStrategy admits mail when any configured participant field from from sender to cc bcc matches the allowed participant domain
- [x] Unknown participant behavior is explicit and preserves existing unknown_sender_behavior semantics
- [x] Focused config and context tests pass
- [x] pnpm verify passes
