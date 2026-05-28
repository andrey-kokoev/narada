---
status: closed
depends_on: [1221, 1463]
closed_at: 2026-05-17T20:32:41.128Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Diagnose narada-andrey MCP inbox route absence

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1464-1468-cross-site-mcp-inbox-route-narada-andrey.md

## Goal

Record the exact route/capability/target-root gap that prevents Narada proper from sending a governed inbox submission to narada-andrey.

## Context

An attempted staged cross-Site inbox submission to narada-andrey failed with `No active MCP fabric route for target site:narada-andrey`. This is a Site fabric coherence miss: Narada proper has communication surfaces and an outbox request, but no admitted MCP fabric address route to narada-andrey's Canonical Inbox.

## Required Work

1. Inspect the MCP fabric route resolver and canonical routing-addressing registry shape.
2. Inspect existing route registry, capability grant posture, and available local Site roots.
3. Classify whether the blocker is missing route record, unsupported transport, missing target Site root, missing capability grant, or target unavailability.
4. Produce a bounded diagnostic artifact with exact evidence, no raw secrets, and next admissible implementation steps.
5. Do not create a fake route when the target Site root or capability grant is not actually known.

## Non-Goals

- Do not mutate narada-andrey.
- Do not infer a target Site root from memory.
- Do not bypass MCP fabric or local target admission.
- Do not mark the prior outbox item delivered.

## Execution Notes

- Inspected MCP fabric route resolution in `packages/narada-proper-mcp/src/server.ts`, `packages/layers/cli/src/mcp-server.ts`, and routing registry helper code.
- Verified no active route exists for `site:narada-andrey` in Narada proper's routing-addressing registry.
- Verified bounded local Site-root discovery under `D:\code` found only Narada proper's `.narada/site.json`, not a `narada-andrey` target root.
- Verified current admitted `narada-andrey` capability evidence is not an outbound Narada proper -> narada-andrey Canonical Inbox route/grant.
- Added diagnostic artifact `.ai/decisions/2026-05-17-narada-andrey-mcp-inbox-route-diagnostic.md`.
- Did not create a fake route, mutate `narada-andrey`, or mark the approved outbox request delivered.

## Verification

- `narada routing list --target-kind site --target-ref narada-andrey --format json` returned `count: 0`.
- `narada routing resolve --target-kind site --target-ref narada-andrey --format json` returned `status: not_found`.
- `Get-ChildItem D:\code -Recurse -Depth 3 -Filter site.json -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName` returned only `D:\code\narada\.narada\site.json`.
- `mcp narada_mcp_fabric_context target site:narada-andrey` via MCP returned `No active MCP fabric route for target site:narada-andrey`.
- `narada inbox doctor --format json` showed local inbox readiness but no message routing authority configured for this route and a dirty worktree.
- `git status --short .ai/routing-addressing-registry.json .ai/canonical-outbox.json .ai/outbox-items` showed the outbox item remains local/exported; no routing registry file was created.

## Acceptance Criteria

- [x] Diagnostic artifact names the failed route and exact missing pieces.
- [x] Evidence includes route registry status and target Site root discovery result.
- [x] The artifact distinguishes route record, capability grant, target availability, and target admission.
- [x] No fake route or direct cross-Site mutation is created.
