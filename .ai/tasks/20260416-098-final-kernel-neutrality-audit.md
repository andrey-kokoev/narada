.ai/tasks/20260416-098-final-kernel-neutrality-audit.md

# Task 098 — Final Kernel Neutrality Audit

## Objective
Run one final audit across code, docs, API, UI, and module topology to confirm that the generalized kernel is now the default reading of the repo.

## Why
The remaining work is no longer invention. It is closure. This audit is the proof step before declaring the de-mailboxing program substantially complete.

## Required Changes
- Audit:
  - public APIs
  - shared types
  - runtime/control modules
  - observability modules
  - README/package READMEs
  - UI shell framing
  - lint allowlists
- Produce a short verdict:
  - closed
  - closed with minor exceptions
  - still open
- List any final exceptions that remain intentionally mail-local

## Acceptance Criteria
- A compact audit note exists
- Remaining exceptions, if any, are explicit and justified
- No major hidden mailbox-default surfaces remain

## Invariant
Architectural closure must be demonstrated, not assumed.