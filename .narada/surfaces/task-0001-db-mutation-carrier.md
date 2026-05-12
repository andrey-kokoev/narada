# narada-proper.carrier.task-0001.db-mutation.v0

Status: `admitted_descriptor_only`
Owner: Narada proper receiving-Site task DB authority
Task: `narada-proper.task-0002`
Source packet: `.narada/admission/candidates/task-0001-live-execution-admission-packet.md`

## Purpose

This carrier admits the Narada proper boundary for task DB writes through a separately admitted concrete adapter.

`@narada2/site-task-lifecycle` remains descriptor/request/result oriented. It does not execute DB writes.

## Mutation Mechanism

No DB mutation is performed by this carrier admission.

A later live execution task must name:

- the admitted concrete adapter;
- the exact schema/init write request;
- the exact task admission write request;
- idempotency evidence;
- post-write readback or equivalent confirmation;
- rollback evidence for the admitted write batch.

## Allowed Future Scope

- Execute `TaskDbAdapterExecutionRequest` and `TaskAdmissionWriteRequest` through an admitted adapter.
- Mutate only a separately admitted receiving-Site task DB root.

## Denied Scope

- Direct package-owned SQLite mutation.
- Mutating narada-andrey DBs or importing source task/inbox history.
- Mutating any DB without adapter admission, readback, idempotency, and rollback evidence.

## Verification Gate

The later DB mutation task must show adapter conformance, write request validation, post-write confirmation, and no denied source imports.

## Rollback Posture

Use adapter-owned rollback for only the admitted write batch. Preserve source evidence, `.narada` audit, and package source.
