---
number: 2194
governed_by: unknown
status: deferred
tags: execution-binding, invokable-intelligence, ontology-remediation, site-authority, superseded, task-lifecycle
creation_payload_ref: mcp_payload:invokable-intelligence-remediation-2211@v1
creation_payload_sha256: 50850f4224740b2f0b4ef9aecec634aceae199a596a0a4ec6baf8610cf657631
idempotency_key: invokable-intelligence-remediation-source-2211-narada-proper-v1
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":null,"site_root":"D:\\code\\narada","correlation_key":"user-site-task-2211"}
---

# Repair execution binding and destination authority for the intelligence chapter

## Goal

Ensure every invokable-intelligence task is governed and executed against the correct Narada Site and repository instead of defaulting ambiguously to the User Site workspace.

## Context

Destination-side materialization of User Site coordination task #2211 (20260719-2211-repair-execution-binding-and-destination). This task is authoritative in the registered Narada Site at D:\code\narada. Source tasks #2180-#2186 and #2211-#2219 were created in C:\Users\Andrey\Narada with repository_root null while targeting this repository; preserve the source audit chain while correcting destination authority.

Source authority: User Site task #2211.
Destination authority: Narada proper Site, D:\code\narada.

## Required Work

Inspect the Narada repository Site's task authority and supported cross-Site handoff or execution-binding mechanisms.
Establish destination-Site tasks with explicit D:\code\narada execution bindings and source-task audit references.
Preserve identifiers, dependencies, and payload evidence through explicit source/destination correlation.
Mark wrong-Site actionable projections superseded only after destination acceptance is proven.
Add a focused guard so future external-Site implementation task creation is rejected or explicitly flagged when destination/binding metadata is absent.

## Non-Goals

Do not edit files under .ai/do-not-open directly.
Do not treat a User-Site task record as proof that the Narada repository Site accepted the work.
Do not implement the ontology concerns owned by the other remediation tasks.

## Execution Notes


- Close-out workflow: `task_lifecycle_disposition_closeout` invoked by `operator` at 2026-07-19T17:06:21.265Z.
- Envelope: none detected in task body.
- Disposition: superseded.
- Summary: Superseded before implementation by Narada-proper task #2203 because #2194 preserved an incomplete execution binding with repository_root null. No implementation was performed under #2194.

## Verification


- Inbox index refreshed through `refreshInboxIndex`; envelope status resolved as `not_found`.
- Scoped changed-file list returned by the workflow for commit planning.
- Acceptance criteria proof not requested by this invocation.
- Finish requested after note materialization.

## Acceptance Criteria

- [ ] Every active task in the invokable-intelligence chapter has an authoritative destination Site and repository binding for D:\code\narada.
- [ ] No active implementation task relies on repository_root null or conversational instructions to find its repository.
- [ ] Any source-Site tombstone or supersession includes a destination task/binding reference and preserves audit history.
- [ ] A focused lifecycle test rejects or explicitly flags creation of an external-repository implementation task without destination/binding metadata.
- [ ] Authoritative MCP readback proves the corrected routing state.
