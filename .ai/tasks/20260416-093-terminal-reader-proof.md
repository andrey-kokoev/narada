# Task 093 — Terminal Reader Proof

## Objective
Make the repository hard to misread as “really an email system with abstractions.”

## Why
The remaining proof burden is now interpretive rather than structural. A strong fresh reader should infer generalized kernel first, mailbox vertical second.

## Required Changes
- Perform a fresh-reader audit over:
  - top-level docs
  - package surfaces
  - module names
  - public types
  - UI framing
- Fix any places where mailbox appears architecturally primary
- Add a short canonical “how to read this repo” note at the top-level architecture surface
- Add a small review checklist for future architecture changes

## Acceptance Criteria
- A fresh technical reader can infer:
  - generalized deterministic kernel
  - mailbox as one vertical
- No top-level surface frames mailbox as the essence of the system
- Docs/module naming/public API framing align

## Invariant
The repository should naturally communicate the architecture it actually implements.