# Seed Example Fixtures — EXECUTED

**Date**: 2026-04-17
**Status**: Complete
**Depends on**: 108 (ContextCase schema), 109 (MailboxCase specialization)

---

## Deliverables

All seed fixtures rewritten to conform to the `ContextCase` / `MailboxCase` / `Sequence` schemas.

### Context Cases (`examples/context-cases/`)

| File | Status | Assertable |
|------|--------|------------|
| `direct-support-resolution.yaml` | active | ✓ routing + classification |
| `support-with-commitment-extraction.yaml` | active | ✓ routing + classification + obligation |
| `conflicting-charter-recommendations.yaml` | draft | Skipped by runner (foreman arbitration not yet wired) |
| `obligation-centric-follow-up.yaml` | draft | Skipped by runner (synthetic trigger path not yet wired) |

Each fixture includes:
- `case_id`, `title`, `description`, `status`, `vertical`
- `context_input` with `context_id`, `scope_id`, and mail-specific fields
- `expected_primary_charter`
- `expected_outputs` with matchers
- `forbidden_outputs` where applicable

### Sequence (`examples/sequences/`)

| File | Status | Assertable |
|------|--------|------------|
| `support-escalation.yaml` | active | ✓ 3-step sequence |

Structure:
- `sequence_id`, `title`, `description`, `status`, `vertical`
- `base_context` with shared properties
- `steps` array with `trigger`, `context_input`, `expected_outputs`, `forbidden_outputs`

### Mailbox Scenario (`examples/mailbox-scenarios/`)

| File | Status | Assertable |
|------|--------|------------|
| `morning-queue.yaml` | active | ✓ routing + classification |

Structure:
- `case_id`, `title`, `description`, `status`, `vertical`
- `context_input.state` carries multi-thread queue data
- `expected_outputs` with queue-level matchers

---

## Definition of Done

- [x] seed example files exist (4 context-cases, 1 sequence, 1 mailbox-scenario)
- [x] at least one example is fully assertable (4 active fixtures pass validation)
- [x] mailbox-specialized examples are represented (all 6 fixtures are `vertical: mailbox`)
- [x] conflicting-charter example is included (`conflicting-charter-recommendations.yaml`)
