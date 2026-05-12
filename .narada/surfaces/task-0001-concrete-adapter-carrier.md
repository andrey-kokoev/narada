# narada-proper.carrier.task-0001.concrete-adapter.v0

Status: `admitted_descriptor_only`
Owner: Narada proper receiving-Site storage authority
Task: `narada-proper.task-0002`
Source packet: `.narada/admission/candidates/task-0001-live-execution-admission-packet.md`

## Purpose

This carrier admits the Narada proper boundary for a concrete task DB adapter outside `@narada2/site-task-lifecycle`.

The package remains adapter-interface-only. It owns no SQLite dependency and performs no SQLite mutation.

## Mutation Mechanism

No concrete adapter is executed or installed by this carrier admission.

A later live execution task must name:

- the concrete adapter implementation id and path;
- its dependency/driver owner;
- its conformance evidence against `TaskDbAdapterConformanceContract`;
- the command/tool used to activate it;
- rollback evidence for disabling or removing the adapter binding.

## Allowed Future Scope

- Admit a concrete adapter outside `@narada2/site-task-lifecycle`.
- Bind that adapter only after conformance evidence and dependency ownership are recorded.

## Denied Scope

- Adding a SQLite dependency to `@narada2/site-task-lifecycle`.
- Importing source Site DB/history/state.
- Binding narada-andrey task, inbox, roster, checkpoint, operator-surface, PC-locus, secret, identity-specific, or source-history state.
- Treating the neutral in-memory test fixture as a live runtime adapter.

## Verification Gate

The later concrete adapter task must pass package-local adapter conformance tests and include adapter-owned rollback/closeout evidence.

## Rollback Posture

Disable or remove only the admitted concrete adapter binding. Preserve package descriptor evidence and conformance records.
