---
number: 2219
governed_by: dependencies
status: awaiting_dependencies
tags: acceptance, cutover, e2e-aggregation, invokable-intelligence
creation_payload_ref: mcp_payload:invokable-intelligence-final-cutover-v2@v1
creation_payload_sha256: 9ab2514e47dc66d64602345abc60941a5464dd8c80aaf4927a49e40341d36a6e
idempotency_key: invokable-intelligence-final-cutover-v2
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":"D:\\code\\narada","site_root":"D:\\code\\narada","correlation_key":"invokable-intelligence-final-cutover-v2"}
---

# Complete canonical intelligence cutover and aggregate acceptance

## Goal

Remove all authoritative legacy selection paths after split owners finish and aggregate, rather than duplicate, local and Cloudflare acceptance evidence.

## Context

Terminal task for the Narada-proper implementation graph. It waits on management, compatibility inventory, local runtime, and Cloudflare runtime outcomes and consumes each platform task's sole live-E2E evidence.

## Required Work

Read all dependency outcomes and reconcile any blocked/failed findings before mutation.
Use the compatibility zero-consumer inventory to migrate residual consumers and remove the projection.
Remove obsolete provider/model environment variables, hardcoded defaults, duplicate schemas, and stale operator docs/examples.
Run repository-wide contract, registry, resolver, materialization, management, runtime, restart/replay, and consumer-inventory verification.
Aggregate local and Cloudflare live-E2E evidence refs without re-running or owning duplicate platform journeys.
Publish an acyclic chapter/readback audit with remaining compatibility boundaries or explicit zero residuals.

## Non-Goals

Do not duplicate platform live E2E ownership.
Do not remove secret transport mechanisms merely because selection environment variables are removed.
Do not claim cutover with undocumented legacy readers or unresolved dependency findings.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Repository inventory reports zero authoritative reads of legacy provider/model selection state outside migration fixtures.
- [ ] Compatibility projection is removed only after admitted zero-consumer evidence.
- [ ] Local and Cloudflare platform tasks have satisfying outcomes and their sole live-E2E evidence is aggregated.
- [ ] All canonical contract/storage/resolver/materialization/management/runtime suites pass.
- [ ] Documentation and diagnostics expose authority, offering/route, topology, access, temporal, and result/outcome semantics.
- [ ] Final chapter audit is acyclic, fully routed to D:\code\narada, and records zero unresolved acceptance residuals or opens explicit remediation.
