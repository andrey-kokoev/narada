---
status: opened
---

# Add explicit Operator Surface message from-to grammar and Site-plane CAPA guard

## Chapter

Operator Surface Addressability Ergonomics

## Goal

Prevent Operator Surface message routing from collapsing sender, recipient, Site plane, runtime locus, visible label, and addressable binding by introducing explicit from/to semantics and CAPA-grade failure output.

## Context

CAPA source: narada.architect misrouted an Operator Surface message by treating `operator-surface send --identity builder` as a recipient address and by resolving bare builder inside Narada proper when the Operator intended the narada-andrey Site plane. No message was delivered, but the incident exposed a conceptual and CLI ergonomics fault. Bare role names should resolve only inside the speaker/current Site; cross-Site references must be Site-qualified and delivery requires addressability proof.

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

- [ ] Operator Surface message routing has explicit sender and recipient semantics in command/API shape or a documented transitional command that cannot be mistaken for recipient-only identity.
- [ ] Bare role names resolve only within the current Site plane and cross-Site addresses require Site qualification.
- [ ] Send dry-run and failure output identify requested address, current Site, target Site, resolved identity if any, binding status, and exact repair command.
- [ ] Successful send evidence records requested address, resolved address, sender, recipient, Site plane, runtime locus, and binding proof without collapsing them.
- [ ] Agent onboarding/law states that labels are observations, identity admission is not addressability, and cross-Site routing must be explicit.
- [ ] Regression tests cover same-Site builder, narada-andrey.builder from Narada proper, label-visible-but-unbound, and --identity ambiguity prevention.
