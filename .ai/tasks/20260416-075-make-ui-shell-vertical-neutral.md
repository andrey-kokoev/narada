.ai/tasks/20260416-075-make-ui-shell-vertical-neutral.md
# Task 075 — Make UI Shell Vertical-Neutral

## Objective
Refactor the operator console shell so the shell itself is kernel-first and vertical-neutral.

## Why
Current shell hardcodes a mailbox page in primary navigation and includes mutation controls that should not belong to the minimal neutral shell.

## Required Changes
- Redefine primary shell navigation around kernel layers:
  - Overview
  - Timeline
  - Facts
  - Contexts
  - Work
  - Intents
  - Executions
  - Workers
  - Failures
  - Verticals
- Move `Mailbox` out of core shell into a vertical-specific section/page
- Remove mutation buttons from the neutral shell toolbar
- Keep only:
  - scope select
  - refresh
  - filter/search
- Ensure shell labels and helper text do not imply mailbox-first ontology

## Acceptance Criteria
- Shell works without mailbox assumptions
- No mutation controls appear in the neutral shell
- Vertical pages are subordinate to the shell, not embedded into its ontology
- UI smoke test verifies navigation without mailbox page being required

## Invariant
Shell shows the kernel, not one vertical masquerading as the kernel.