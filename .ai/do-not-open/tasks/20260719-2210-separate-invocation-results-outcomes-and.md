---
number: 2210
governed_by: unknown
status: closed
tags: acknowledgment, evidence, invokable-intelligence, ontology-remediation, result-envelope, retention
creation_payload_ref: mcp_payload:invokable-intelligence-remediation-2218@v2
creation_payload_sha256: 3599de455dfe67de3b432411aa741dfbdd40d7e5369b855916c0a092acb1d540
idempotency_key: invokable-intelligence-remediation-source-2218-narada-proper-v2
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":"D:\\code\\narada","site_root":"D:\\code\\narada","correlation_key":"user-site-task-2218-narada-proper-v2"}
criteria_proved_by: operator
criteria_proved_at: 2026-07-19T17:41:08.239Z
---

# Separate invocation results, outcomes, and evidence

## Goal

Prevent InvocationEvidence from becoming an unbounded catch-all by defining distinct result, terminal outcome, observation, audit evidence, and retained-payload contracts.

## Context

Destination-side materialization of User Site task #2218. The current Intent -> Plan -> Attempt -> Evidence chain omits a clear result/outcome boundary. Provider output, usage, failure state, transport acknowledgment, audit proof, prompt/output retention, and evidence references have different semantics and data-governance requirements.

Source authority: User Site task #2218.
Destination authority: Narada proper Site, D:\code\narada.

## Required Work

Define InvocationResult or ResultEnvelope separately from InvocationAttempt terminal outcome and InvocationEvidence observations.
Define attempt states and terminal outcomes for success, provider failure, cancellation, timeout, acknowledgment uncertainty, and typed pre-invocation refusal.
Define evidence types, provenance, integrity/digest references, and relationships to intent, plan, attempt, and result.
Define payload storage by reference, redaction, retention, deletion/tombstone, residency, and access-control semantics.
Separate operational telemetry/usage from potentially sensitive request and response payloads.
Add restart, replay, retry, acknowledgment-timeout, and no-retention fixtures.

## Non-Goals

Do not store full prompts or outputs merely to make evidence convenient.
Do not treat an acknowledgment event as proof of inference success.
Do not erase historical audit facts when sensitive payload content expires.

## Execution Notes


Implemented immutable execution attempts and retry/replay lineage; distinct result envelope and terminal outcome contracts; success, provider failure, cancellation, timeout, admission-unknown, and pre-invocation-refusal transitions; non-authoritative observations versus admitted audit evidence; payload-by-reference retention/redaction/deletion/tombstones/residency/access controls; and payload-free operational telemetry.

## Verification


Package typecheck passed (structured_command_execution:e_079d2e9b2d454c7b8e795adb). Six focused outcome tests passed (structured_command_execution:e_5f832ab115c448c883724830), including acknowledgment uncertainty, no-retention, deletion tombstones, explicit failure transitions, and immutable retry/replay history.

## Acceptance Criteria

- [x] Schemas distinguish result payload, attempt terminal outcome, evidence observation, and telemetry.
- [x] Success, failure, refusal, cancellation, timeout, and unknown-admission states have unambiguous transitions.
- [x] Retention/deletion of sensitive payloads preserves non-sensitive audit lineage and digests as policy permits.
- [x] Retry and replay cannot overwrite or duplicate prior attempts/results.
- [x] Tests cover acknowledgment uncertainty and prove that evidence does not imply more than it establishes.
