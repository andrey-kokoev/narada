---
number: 2201
governed_by: unknown
status: deferred
tags: acknowledgment, evidence, invokable-intelligence, ontology-remediation, result-envelope, retention, superseded
creation_payload_ref: mcp_payload:invokable-intelligence-remediation-2218@v1
creation_payload_sha256: cc4ce78a32c9d72cbe62cd17eb7c292bef5a50e08621f99947e5803110876e9b
idempotency_key: invokable-intelligence-remediation-source-2218-narada-proper-v1
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":null,"site_root":"D:\\code\\narada","correlation_key":"user-site-task-2218"}
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

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Schemas distinguish result payload, attempt terminal outcome, evidence observation, and telemetry.
- [ ] Success, failure, refusal, cancellation, timeout, and unknown-admission states have unambiguous transitions.
- [ ] Retention/deletion of sensitive payloads preserves non-sensitive audit lineage and digests as policy permits.
- [ ] Retry and replay cannot overwrite or duplicate prior attempts/results.
- [ ] Tests cover acknowledgment uncertainty and prove that evidence does not imply more than it establishes.
