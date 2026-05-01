---
status: opened
---

# Resolve scoped role aliases to unique active admitted identities

## Chapter

operator-surface-address-resolution

## Goal

Make Narada address resolution distinguish exact identities from scoped role aliases, preserve both requested and resolved addresses, and fail deterministically on unresolved or ambiguous role aliases.

## Context

Inbox envelope env_08410800-08da-492f-9000-eebb90dd0b0f from narada-andrey reports that messages or tasks addressed to exact identities such as narada-andrey.Kevin should resolve exactly, while scoped role aliases such as narada-andrey.architect should resolve only when there is exactly one active admitted architect identity in that Site. This affects canonical inbox routing, operator-surface messages, task assignment, review requests, next nudges, and workboard addressed-work discovery.

## Required Work

Define and implement a canonical address resolution path for exact operator-surface identities and scoped role aliases. Preserve requested_to, resolved_to, resolution, and resolution_evidence in relevant envelopes or routing records. Supported outcomes must include exact_identity, unique_role_alias, role_alias_unresolved, and role_alias_ambiguous. Ambiguous outcomes must expose candidate identities and require explicit sender/operator choice or an admitted routing policy; no caller may silently guess. Update the user-facing commands or projections that route addressed work so they report both the requested address and resolved identity when resolution occurs.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Exact identity addresses resolve only to the named admitted identity and do not pass through role-alias matching.
- [ ] Scoped role aliases resolve only when exactly one active admitted identity in the requested Site has the requested role.
- [ ] Zero-match and multiple-match role aliases fail with explicit machine-readable outcomes and bounded human-readable diagnostics.
- [ ] Routing artifacts preserve requested_to, resolved_to, resolution, and resolution_evidence where an addressed crossing is recorded.
- [ ] Regression coverage proves exact identity, unique role alias, unresolved alias, and ambiguous alias behavior.
