# Crew Launch/Focus/Bind Carrier Admission Packet

Task: `narada-proper.task-1257`

Carrier id: `narada-proper.carrier.crew-launch-focus-bind.v0`

Status: `candidate_not_executed`

## Authority Basis

Narada proper owns the launch intent sequence artifacts under `.narada/crew/`.
Those artifacts are durable launch requests, not substrate shortcuts or process handles.

This packet admits only the shape of a future carrier. It does not admit execution.
The carrier may be admitted later only by a Narada proper task or capability
decision that names:

- the target Site root;
- the exact launch intent sequence file;
- the operator-surface transport or supervisor that owns focus/bind execution;
- the rollback and recovery evidence path.

## Input Contract

The carrier must read a verified launch intent sequence with schema:

`narada.crew_startup_shortcut.launch_intent_sequence.v0`

The sequence must pass:

`node tools/operator-surface-carriers/crew-launch-intent-sequence-verifier.mjs --site-root <site-root>`

before any execution phase is allowed.

## Allowed Future Phases

These phases are descriptor/admission candidates only until a later task admits
execution:

1. `verify_sequence`: read-only validation of `.narada/crew/*.launch-intent-sequence.json`.
2. `resolve_operator_surface_target`: read-only target resolution from admitted descriptors.
3. `request_focus_bind`: create a governed request for an admitted operator-surface carrier.
4. `record_result`: write audit evidence and readback proof after the carrier reports success.

## Denied Forms

The carrier is not admitted to use:

- direct substrate shortcut execution;
- native shell fallback;
- Windows `.lnk` creation;
- unadmitted process launch;
- PC-locus mutation;
- operator-surface runtime mutation;
- operator-surface runtime copying;
- raw WSL crossing as mutation authority;
- source Site runtime state import;
- secrets, credentials, or implicit capability grants.

## Evidence Shape

A future execution admission must produce:

- preflight verifier output;
- carrier request id;
- target sequence path;
- target Site id and root;
- transport/supervisor id;
- execution phase log;
- result status: `carrier_restarted`, `focus_bound`, `live_verified`, or `refused`;
- refusal reason when denied;
- rollback or recovery note.

## Rollback / Recovery

Because this carrier must not create `.lnk` files, mutate PC locus, or copy
operator-surface runtime state, rollback is limited to removing or superseding
Narada proper audit/evidence artifacts created by an admitted execution.

If a future carrier creates external side effects, that carrier admission must
name the external owner and recovery command before execution.

## Terminal Criteria

This packet is terminal when Narada proper can point to a named candidate carrier
and prove the current architect launch intent sequence remains read-only,
verified, and blocked from execution without separate carrier admission.

Terminal for this task does not claim working launch/focus/bind execution.

