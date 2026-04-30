---
status: opened
---
# Add first-time Operator front-door command

## Chapter

/home/andrey/src/narada/.ai/do-not-open/tasks/20260430-1105-1109-first-time-operator-ergonomics.md

## Goal

Expose a single bounded CLI entrypoint that tells a first-time Operator exactly what to do next for a Site or operation locus.

## Context

The Operator currently has to know whether to run sites doctor, inbox import, inbox work-next, operator-surface agent instantiate, agent-bootstrap, self-bind, task preflight, or docs. That creates first-use friction and repeated role-binding mistakes.

## Required Work

1. Add or extend a CLI command that acts as the first-time Operator front door, using existing services rather than duplicating authority.
2. The command must default to diagnosis/advice and require explicit flags for mutations.
3. It must detect Site readiness, inbox import posture, work-next availability, role identity registry, operator-surface binding readiness, and missing transport/script capabilities.
4. It must produce compact human output and complete JSON output without dumping giant transcripts.
5. It must return copyable next commands when action is needed.

## Non-Goals

- Do not create a second Site bootstrap implementation.
- Do not bypass Site law, lifecycle, inbox, or operator-surface authority.
- Do not require raw file inspection by the Operator.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] A documented command exists for first-time Operator guidance, with help text that names the target locus and mutation posture.
- [ ] The command reports whether the Site is absent, initialized but unready, ready without bound agents, ready with pending inbox/work, or fully idle.
- [ ] The command emits compact bounded output by default and a stable JSON shape for automation.
- [ ] The command never mutates Site state unless an explicit execution flag is supplied.
- [ ] Focused tests cover at least ready, missing Site, missing role binding, pending inbox, and missing transport cases.
