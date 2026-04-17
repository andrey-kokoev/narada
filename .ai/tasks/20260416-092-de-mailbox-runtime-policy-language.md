# Task 092 — De-Mailbox Runtime and Policy Language

## Objective
Remove remaining mailbox-default semantics from upper-layer runtime/policy surfaces.

## Why
The substrate is now neutral, but some higher-layer reasoning still tends to default to thread/conversation/message-history mental models. This is the deepest remaining residue.

## Required Changes
- Audit runtime/policy surfaces for mailbox-default assumptions in:
  - context interpretation
  - policy language
  - charter/runtime contracts
  - evaluation/resolution semantics
- Replace mailbox-default vocabulary with neutral context/scope/fact-neighborhood language where generic
- Keep mailbox-specific semantics only inside mailbox vertical adapters and charter materializers
- Add tests/fixtures proving timer/webhook/filesystem contexts pass through runtime/policy surfaces without mailbox-shaped assumptions

## Acceptance Criteria
- Generic runtime/policy surfaces no longer assume message/thread semantics
- Non-mail verticals traverse policy/runtime without semantic distortion
- Mailbox-specific reasoning remains confined to mailbox vertical components

## Invariant
The kernel may host mailbox reasoning, but generic runtime semantics must not default to it.