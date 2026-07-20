---
number: 2205
governed_by: dependencies
status: closed
tags: capabilities, deployment, invocation-route, invokable-intelligence, offering, ontology-remediation
creation_payload_ref: mcp_payload:invokable-intelligence-remediation-2213@v2
creation_payload_sha256: 8f0be07c6cc70490e1f5043b70b460a7a92cb13546794f0e40e0b18eec30e23b
idempotency_key: invokable-intelligence-remediation-source-2213-narada-proper-v2
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":"D:\\code\\narada","site_root":"D:\\code\\narada","correlation_key":"user-site-task-2213-narada-proper-v2"}
criteria_proved_by: operator
criteria_proved_at: 2026-07-19T17:49:39.651Z
---

# Model first-class intelligence offerings and invocation routes

## Goal

Represent capabilities that belong to a model-as-offered-through-a-specific-service, endpoint, adapter, account, or execution path rather than incorrectly attaching them to one provider or model identity.

## Context

Destination-side materialization of User Site task #2213. Thinking controls, streaming, structured output, pricing, batch support, and availability can differ for the same model across inference providers and endpoints. Unary provider/model assertions are insufficient. The ontology needs a minimally sufficient first-class offering/deployment and candidate-route shape within the typed resource graph.

Source authority: User Site task #2213.
Destination authority: Narada proper Site, D:\code\narada.

## Required Work

Define model offering/deployment identity relating model, model provider, inference service/provider, endpoint or binding, service class, and version/region where relevant.
Define an invocation route/candidate as the executable composition of offering, adapter, execution locus, account/grant, and credential reference.
Specify whether capabilities attach to model identity, offering, route component, route composition, or an explicitly scoped relation.
Define capability intersection/override rules without generic untyped n-ary EAV records.
Update plan and refusal contracts to reference the selected offering and route.
Add fixtures showing one model with materially different capabilities through two inference paths.

## Non-Goals

Do not turn every invocation into a permanently catalogued resource.
Do not treat an adapter implementation as the inference provider or model provider.
Do not add provider-specific fields to the top-level contract.

## Execution Notes


Added model-offering as a first-class resource relating model/model-provider/inference-provider/endpoint/service-class/version/region. Added ephemeral route candidates composing offering, endpoint, adapter, topology, execution loci, account/grants, and credential reference. Added typed model/offering/component/composition capability subjects and deterministic intersection/narrow-scope descriptor rules. Added selected-route/refusal contracts and bundle validation for offering graph references.

## Verification


Contract typecheck passed (structured_command_execution:e_c3d54a362c2f4fabb3d62660). Four focused offering/route tests passed (structured_command_execution:e_9dd5b6010b5b48d9a7119243). Existing contract tests passed (structured_command_execution:e_69cc12a42d1f4280a3860aff) and existing resolver tests passed (structured_command_execution:e_6569863b0c0e4b3481688281).

## Acceptance Criteria

- [x] The ontology distinguishes model identity, model provider, inference provider/service, offering/deployment, endpoint/binding, adapter, and executable route.
- [x] A capability can be scoped to the exact offering or route composition for which it is true.
- [x] Resolver candidates are offerings/routes rather than bare model names.
- [x] Fixtures prove that the same model can support thinking or batch through one route and not another.
- [x] Schemas and validators reject incomplete, cyclic, or role-confused route definitions.
