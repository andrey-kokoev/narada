---
status: opened
---

# Define Site qualification and requalification policy

## Chapter

site-qualification-policy

## Goal

Model role/principal qualification as a Site-level governed state, not as ad hoc prompt reminders.

## Context

Operator identified the CFR 820 / QMSR-style analogue: agents should periodically requalify against current Site law, role contracts, capability policy, and safety posture. The Narada inversion is from text injection/reminder to SiteQualificationPolicy with competence records, triggers, effectiveness checks, nonconforming work handling, and release gates.

## Required Work

Define SiteQualificationPolicy doctrine and product shape; specify qualification records, affected roles, work classes, required law/context surfaces, triggers, expiry, receipt/absorption evidence, effectiveness checks, nonconforming work/CAPA posture, and release gates; link to law propagation, role duty loops, and Site governance coordinates.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Defines qualification as an authority object distinct from injected text or reminder messages.
- [ ] Includes competence record, requalification trigger, effectiveness check, nonconforming work, training matrix, change impact assessment, and release gate concepts.
- [ ] Specifies triggers including law change, role change, inactivity, repeated defect, new capability class, sensitive work, and N completed tasks.
- [ ] Explains how qualification state blocks only governed work classes, not all agent activity.
- [ ] Links to LawPropagationReceipt, AgentWorkDutyLoop, and Site governance docs.
