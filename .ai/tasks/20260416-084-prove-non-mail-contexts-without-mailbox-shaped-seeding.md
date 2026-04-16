# Task 084 — Prove Non-Mail Contexts Without Mailbox-Shaped Seeding

## Objective
Strengthen Task 081 by proving non-mail vertical rendering without relying on mailbox-era context seeding patterns.

## Why
Current end-to-end proof uses timer/filesystem/webhook fixtures, but those fixtures are still inserted through mailbox-shaped durable context surfaces. That proves UI usefulness, but not full semantic closure. :contentReference[oaicite:2]{index=2}

## Required Changes
- Add fixtures/adapters that create non-mail contexts through neutral context semantics rather than mailbox-era record shapes
- Re-run generic UI/API proof for:
  - facts
  - contexts
  - work
  - timeline
  - overview
  - intents/executions
- Verify mailbox vertical view remains additive and isolated
- Remove any test-only dependence on mailbox naming for non-mail context identity

## Acceptance Criteria
- Generic pages render non-mail verticals from neutral context inputs
- Tests prove non-mail verticals do not require mailbox-shaped durable seeding
- Mailbox page remains empty/irrelevant when mailbox data is absent
- Timeline and overview remain correct across timer/filesystem/webhook without mailbox compensations

## Invariant
Vertical neutrality must hold at fixture construction time, not only at final rendering time.