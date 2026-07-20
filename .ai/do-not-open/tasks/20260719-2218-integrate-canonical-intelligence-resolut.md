---
number: 2218
governed_by: dependencies
status: awaiting_dependencies
tags: cloudflare, invokable-intelligence, live-e2e, runtime
creation_payload_ref: mcp_payload:invokable-intelligence-cloudflare-runtime-v2@v1
creation_payload_sha256: d3f108c6b00b787312830d907ef906bf3fcec14fa37a39f39b7359805023f6c2
idempotency_key: invokable-intelligence-cloudflare-runtime-v2
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":"D:\\code\\narada","site_root":"D:\\code\\narada","correlation_key":"invokable-intelligence-cloudflare-runtime-v2"}
---

# Integrate canonical intelligence resolution into the Cloudflare carrier

## Goal

Make each Cloudflare invocation acquire D1/request-scoped inputs, resolve and revalidate an explicit offering/route, and persist conformant result/outcome/evidence.

## Context

Depends on canonical migration and materialization adapters. This task is the sole owner of authenticated Cloudflare live E2E; it keeps operator-session authentication separate from intelligence selection and provider execution.

## Required Work

Use D1-backed canonical catalog/materializations and verified request-scoped context as resolver inputs.
Represent the Worker carrier, runtime, Workers AI binding or remote adapter, account/grants, service, endpoint, and boundaries in the selected topology.
Remove CLOUDFLARE_CARRIER_AI_MODEL and hardcoded default-model authority while retaining secret/auth transport bindings.
Persist conformant v2 snapshots, attempts, results/outcomes, observations/evidence, telemetry, and unknown-admission states.
Own Worker tests and one authenticated live E2E covering success, resolver refusal, provider failure, acknowledgment uncertainty, retry, and evidence readback.

## Non-Goals

Do not treat Wrangler login as operator-session or invocation authorization.
Do not create a Cloudflare-specific ontology/resolver fork.
Do not own local runtime behavior or E2E.
Do not retain model-selection environment fallback.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Deployed carrier resolves offering and route from D1/admitted request context without CLOUDFLARE_CARRIER_AI_MODEL.
- [ ] Authentication, resolver, access, topology, adapter, provider, timeout, and acknowledgment uncertainty have distinct reason codes.
- [ ] Equivalent canonical inputs have conformant semantics while preserving structurally different Cloudflare topology.
- [ ] Retry/replay cannot duplicate or overwrite prior attempts/results.
- [ ] The single owned authenticated Cloudflare live E2E emits linked canonical records and readback evidence.
