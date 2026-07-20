---
number: 2203
governed_by: unknown
status: closed
tags: execution-binding, invokable-intelligence, ontology-remediation, site-authority, task-lifecycle
creation_payload_ref: mcp_payload:invokable-intelligence-remediation-2211@v2
creation_payload_sha256: 0a620ca313a0b3da9f9dfc1e80bb4e81533ce9c788290e7f6fcaedc1972eeec7
idempotency_key: invokable-intelligence-remediation-source-2211-narada-proper-v2
execution_binding_json: {"workspace_root":"D:\\code\\narada","executor_kind":"operator","executor_profile":null,"executor_id":null,"repository_root":"D:\\code\\narada","site_root":"D:\\code\\narada","correlation_key":"user-site-task-2211-narada-proper-v2"}
criteria_proved_by: operator
criteria_proved_at: 2026-07-19T17:21:30.621Z
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


1. Materialized corrected Narada-proper tasks #2203-#2211 from User Site sources #2211-#2219 with explicit workspace_root, repository_root, and site_root D:\code\narada and stable source correlation keys.
2. Recreated the dependency graph and nine-member chapter. Deferred and marked superseded the malformed Narada-proper v1 tasks #2194-#2202 and User Site implementation tasks #2212-#2219, preserving destination observations.
3. Through mcp-surfaces Site tasks #1 and #3, fixed target-locus refusal status, allowed only a direct Git parent for repo/.narada project Sites, documented all binding fields, and exposed authoritative binding readback in show/inspect/range.
4. User Site source task #2211 remains the coordination closeout and links to this destination task. No Narada product source file was changed by this routing task.

## Verification


Authoritative task_lifecycle_chapter_show reports nine ordered Narada-proper members #2203-#2211. Authoritative task_lifecycle_inspect_range now reports execution_binding.status=bound for every member, with workspace_root/repository_root/site_root all D:\code\narada. The focused mcp-surfaces task-lifecycle package build passed; target-locus-execution-binding test passed. mcp-surfaces tasks #1 and #3 and their review dependencies closed successfully.

## Acceptance Criteria

- [x] Every active task in the invokable-intelligence chapter has an authoritative destination Site and repository binding for D:\code\narada.
- [x] No active implementation task relies on repository_root null or conversational instructions to find its repository.
- [x] Any source-Site tombstone or supersession includes a destination task/binding reference and preserves audit history.
- [x] A focused lifecycle test rejects or explicitly flags creation of an external-repository implementation task without destination/binding metadata.
- [x] Authoritative MCP readback proves the corrected routing state.
