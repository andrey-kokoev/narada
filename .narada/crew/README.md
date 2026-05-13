# Narada Proper Crew Startup Descriptors

This directory contains repo-local launch intent descriptors for Narada proper crew startup.

These are not Windows `.lnk` files and do not start processes. They are durable requests/templates and launch intent sequences that a separately admitted local carrier may read when preparing an agent role session.

## Current Posture

- Exposure: `descriptor_only`.
- Default execution posture: MCP-only.
- Target locus: Narada proper.
- Startup requests must preserve identity doctrine: named agent identity, role assignment, and mechanical verification basis are separate fields.
- Missing MCP or hydration capability is a blocker to report, not a reason to fall back to shell startup.

## Not Admitted

- Direct substrate shortcut execution.
- Native shell fallback.
- PC-locus mutation.
- Operator-surface runtime copying.
- Process launch side effects.
- Windows shortcut creation.
- Source Site runtime state import.
- Workboard state import from another Site.
- Checkpoint history import from another Site.
- Secrets, credentials, or implicit capability grants.

## Files

- `architect.startup-request.json`: Narada proper architect startup request descriptor.
- `architect.launch-intent-sequence.json`: Narada proper architect launch intent sequence. It composes live MCP readiness/readback with a launch handoff intent, but does not execute launch.
- `templates/agent-startup-request.template.json`: reusable template for future role/agent startup descriptors.
- `templates/agent-launch-intent-sequence.template.json`: reusable template for future role/agent launch intent sequences.

Local execution still requires a separate admitted carrier/surface for operator-surface launch/focus/bind and role session start.

## Carrier Candidate

The next carrier candidate is recorded at:

- `.narada/admission/candidates/task-1257-crew-launch-focus-bind-carrier-admission-packet.md`
- `.narada/capabilities/crew-launch-focus-bind-carrier.json`

It is descriptor-only. It admits no `.lnk` creation, process launch, direct substrate shortcut execution, native shell fallback, PC-locus mutation, operator-surface runtime mutation, or operator-surface runtime copying.

## Launch Request Planner

Verified sequences can be turned into carrier request artifacts with:

`node tools/operator-surface-carriers/crew-launch-focus-bind-request-planner.mjs --site-root D:\code\narada --mode apply --mutation-authorized`

The request artifact is local evidence under `.narada/crew/launch-requests/` with status `awaiting_admitted_carrier`. It is not a launch command and does not grant focus/bind authority.
