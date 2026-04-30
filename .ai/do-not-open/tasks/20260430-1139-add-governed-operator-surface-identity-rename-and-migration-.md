---
status: opened
---

# Add governed Operator Surface identity rename and migration command

## Chapter

Operator Surface Addressability Ergonomics

## Goal

Provide a sanctioned way to rename or migrate an Operator Surface identity, preserving role metadata and authority/evidence boundaries across aliases, labels, bindings, roster references, and task ownership surfaces.

## Context

Inbox envelope env_09bc9fa6-68c8-4754-99f7-3be5a7dccc99 reports the User Site wants to rename its architect surface from role-shaped narada-andrey.architect to personal identity narada-andrey.Kevin while preserving role=architect. Existing identity add/update paths do not provide a governed migration; a plain add would split aliases, runtime bindings, labels, roster ownership, task assignment references, and immutable historical evidence.

## Required Work

1. TBD

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] A sanctioned identity rename/migration command or command stub exists for Operator Surface identities.
- [ ] The command preserves role metadata and records old_identity -> new_identity migration evidence.
- [ ] Aliases, labels, bindings, capability announcements, and input strategies are updated or explicitly deferred with exact follow-up commands.
- [ ] Task roster/lifecycle references are migrated safely or the command fails closed with exact sanctioned repair commands.
- [ ] Historical immutable evidence remains attributable to the old identity while current addressability resolves to the new identity.
- [ ] Tests cover simple rename, active assignment, multi-locus refusal, immutable evidence preservation, and role-alias preservation.
