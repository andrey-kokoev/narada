---
status: opened
---

# Create canonical operator-surface agent fork orchestration

## Goal

Provide one governed front door for starting/adopting an operator-surface agent from an architect work package without manual UI paste or identity drift.

## Context

Source inbox envelope env_31d1d128-c453-4a20-a1bf-d70484b4ddc4 reports that User/PC Site tooling has identity admission, handoff packets, terminal carrier materialization, binding, and input sending, but no single governed command that composes them into a safe architect-to-builder fork/start path.

## Required Work

1. Inventory existing operator-surface agent instantiate, fork handoff packet, adoption confirmation, Windows Terminal carrier materialization, binding, input, task dispatch, and work-next/start-task surfaces. 2. Design the canonical command shape, likely narada operator-surface agent fork or narada agent start, with dry-run default and explicit --exec for process launch. 3. Define durable evidence artifacts for fork_handoff and fork_adoption, including identity, Site plane, runtime locus, task authority, prompt/handoff source, and adoption confirmation. 4. Implement or specify readiness/preflight checks that fail closed when identity, Site, runtime locus, carrier projection, submit strategy, or task authority is ambiguous. 5. Support task-backed launch: from a task number or work packet, generate the child-agent prompt and acceptance criteria automatically. 6. Add focused tests or fixtures covering a client-Site builder fork from architect work package through adoption evidence.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] There is a canonical command path for operator-surface agent fork/start or a fully specified executable surface if implementation is split.
- [ ] Dry-run is default; process launch requires explicit --exec or equivalent confirmation.
- [ ] Fork handoff and adoption evidence are durable and inspectable.
- [ ] Ambiguous identity, Site, runtime locus, carrier projection, submit strategy, or task authority fails closed with repair guidance.
- [ ] Task-backed launch can derive a builder prompt from a task/work packet without manual prompt copying as the authority boundary.
