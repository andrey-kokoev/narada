---
status: opened
---

# Resolve role-shaped agent addresses by exact-one roster cardinality

## Chapter

Operator Surface Addressability Ergonomics

## Goal

Let task and Operator Surface command paths resolve role-shaped agent addresses to a concrete agent only when the target Site roster has exactly one active agent with that role, while recording both requested and resolved identities.

## Context

Inbox envelope env_46558519-ea7d-4330-80fd-bf4ae3a38e0d reports that narada-andrey.Bob is the concrete builder-role agent in the User Site roster, while narada-andrey.builder is the role-address the Operator naturally expects. Command paths currently fail when given the role-shaped address even when exactly one roster agent has that role.

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

- [ ] A canonical agent-address resolver runs before task command admission and Operator Surface sends.
- [ ] Concrete agent ids remain authoritative when present in the target roster.
- [ ] Role-shaped addresses resolve only when exactly one active target-Site roster agent has that role.
- [ ] Zero-match and multi-match cases fail closed with concrete repair guidance and competing agent ids when applicable.
- [ ] Command output and mutation evidence record requested_agent and resolved_agent where resolution occurs.
- [ ] Tests cover exact-one, zero-match, multi-match, and cross-Site ambiguity cases.
