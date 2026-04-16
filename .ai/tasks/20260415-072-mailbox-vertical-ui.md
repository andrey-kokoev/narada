# Task 072 — Mailbox Vertical UI Layer

## Objective
Add mailbox-specific operator views on top of the generalized shell.

## Required Changes
- Mailbox-specific pages may show:
  - conversation/thread detail
  - charter outputs for mail
  - outbound mail-specific state
- Keep these as vertical-specific tabs/components, not shell assumptions

## Acceptance Criteria
- Mailbox gets rich inspection without contaminating kernel-neutral shell
- Non-mail verticals still make sense in the product

## Invariant
Vertical richness must sit above, not inside, the kernel UI shell