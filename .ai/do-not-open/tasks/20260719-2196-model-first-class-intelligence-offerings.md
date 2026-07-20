---
number: 2196
governed_by: unknown
status: deferred
tags: capabilities, deployment, invocation-route, invokable-intelligence, offering, ontology-remediation, superseded
creation_payload_ref: mcp_payload:invokable-intelligence-remediation-2213@v1
creation_payload_sha256: 2a418ded93666773fd357234b713576888a34d1d028df7b67d77243cebab5104
idempotency_key: invokable-intelligence-remediation-source-2213-narada-proper-v1
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":null,"site_root":"D:\\code\\narada","correlation_key":"user-site-task-2213"}
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

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] The ontology distinguishes model identity, model provider, inference provider/service, offering/deployment, endpoint/binding, adapter, and executable route.
- [ ] A capability can be scoped to the exact offering or route composition for which it is true.
- [ ] Resolver candidates are offerings/routes rather than bare model names.
- [ ] Fixtures prove that the same model can support thinking or batch through one route and not another.
- [ ] Schemas and validators reject incomplete, cyclic, or role-confused route definitions.
