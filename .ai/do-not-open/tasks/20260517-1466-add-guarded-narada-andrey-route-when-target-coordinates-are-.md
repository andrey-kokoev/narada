---
status: deferred
depends_on: [1221, 1463]
deferred_by: narada.architect
deferred_at: 2026-05-17T01:58:25.896Z
defer_reason: Blocked: no admitted target coordinates or outbound cross_site_inbox.submit capability evidence exists for narada-andrey. Diagnostic task 1464 found no route record and no local narada-andrey Site root.
unblock_condition: Obtain admitted narada-andrey target Site root/address and capability consent evidence, then run narada routing add per docs/product/narada-andrey-mcp-inbox-route.v0.md.
continuation_packet:
  kind: task_defer
  deferred_by: narada.architect
  deferred_at: 2026-05-17T01:58:25.896Z
  reason: Blocked: no admitted target coordinates or outbound cross_site_inbox.submit capability evidence exists for narada-andrey. Diagnostic task 1464 found no route record and no local narada-andrey Site root.
  unblock_condition: Obtain admitted narada-andrey target Site root/address and capability consent evidence, then run narada routing add per docs/product/narada-andrey-mcp-inbox-route.v0.md.
  residuals: [Do not guess target root, Do not create route before capability/coordinate evidence, Outbox item out_216c869d-5781-4539-a3d6-8ec21cd6b7c5 remains undelivered]
---

# Add guarded narada-andrey route when target coordinates are admitted

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1464-1468-cross-site-mcp-inbox-route-narada-andrey.md

## Goal

Create the actual routing-addressing record only after target root/address and capability evidence are available.

## Context

The routing registry can support filesystem-backed MCP traversal, but the target Site root is not present in this workspace. This task should remain blocked until narada-andrey provides or admits address coordinates.

## Required Work

1. Verify target Site coordinates from admitted evidence, not memory.
2. Add route through `narada routing add` with `target-kind site`, `target-ref narada-andrey`, supported `address-kind`, `transport filesystem`, and appropriate capability kind when applicable.
3. Add or reference capability grant evidence if mutation submission is admitted.
4. Resolve route and run MCP fabric context readback.
5. Record mutation evidence and no-secret posture.

## Non-Goals

- Do not guess or hardcode a root path.
- Do not create route if target coordinates are absent.
- Do not submit messages in this task.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Route is added only with admitted target coordinates.
- [ ] Route resolves through canonical routing operator.
- [ ] MCP fabric context can resolve `site:narada-andrey`.
- [ ] Capability status is reported accurately.
