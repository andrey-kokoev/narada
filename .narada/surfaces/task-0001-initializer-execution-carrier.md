# narada-proper.carrier.task-0001.initializer-execution.v0

Status: `admitted_descriptor_only`
Owner: Narada proper receiving-Site setup authority
Task: `narada-proper.task-0002`
Source packet: `.narada/admission/candidates/task-0001-live-execution-admission-packet.md`

## Purpose

This carrier admits the shape of a future initializer execution for task-0001. It is the Narada proper surface that can later own an admitted call to `initializeSiteTaskLifecycle(options)` from `@narada2/site-task-lifecycle`.

## Mutation Mechanism

No live mutation is performed by this carrier admission.

A later live execution task must name:

- the receiving Site write root;
- the exact command/tool/harness that invokes `initializeSiteTaskLifecycle(options)`;
- the approved `ReceivingSiteSetupPlan.initializerOptions`;
- before/after file evidence;
- rollback evidence for initializer-created directories and manifests.

## Allowed Future Scope

- Create task-lifecycle directories and a local admission manifest under a separately admitted receiving Site root.
- Use only neutral initializer options produced by `@narada2/site-task-lifecycle`.

## Denied Scope

- Mutating a root that has not been explicitly admitted for receiving-Site writes.
- Copying narada-andrey runtime DBs, task history, inbox history, roster, checkpoint, operator-surface, PC-locus, secret, identity-specific data, or source history.
- Treating source packet material as Narada proper truth without local admission.

## Verification Gate

Before live use, the execution task must prove package-local initializer tests pass and the concrete initializer options contain no denied source imports.

## Rollback Posture

Remove only initializer-created directories/manifests if no later admitted DB mutation depends on them. Preserve `.narada` admission, audit, and OSM evidence.
