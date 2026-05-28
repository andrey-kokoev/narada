---
status: closed
no_continuation_needed_rationale: Continuation is already admitted as follow-on MCP coverage task 1371; no additional continuation is required for the Site awareness advisory slice.
closed_at: 2026-05-16T03:21:28.980Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Add Site probe connectivity identity and lift advisory MCP coverage

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1364-1371-narada-proper-mcp-facade-full-surface-coverage.md

## Goal

Add or specify Narada proper MCP coverage for read-only Site awareness, connectivity planning, Site identity, and advisory lift catalog behavior.

## Context

narada-andrey has site-probe, site-connectivity, site-identity, and site-lift MCP servers. These are especially relevant for federated Site work but must preserve receiving-Site admission and trust boundaries.

## Required Work

1. Define Narada proper read-only Site probe and connectivity planning surfaces with no target mutation.
2. Define Site identity materialization/sign/verify posture, including key storage outside public Site artifacts and trust-pin requirements.
3. Define advisory lift catalog behavior for Narada proper adoption packets, including stale-source detection and non-portable path refusal.
4. Add tests or specification fixtures proving unregistered roots require operator authority basis and observed identities are untrusted until pinned.

## Non-Goals

- Do not make cross-Site read awareness into mutation authority.
- Do not copy private keys, trust records, target roots, or source Site runtime state.
- Do not let advisory lift packets install or bootstrap receiving Sites by themselves.

## Execution Notes

- Added `packages/narada-proper-mcp/src/site-awareness-contracts.ts`.
- Specified read-only Site probe planning with no target mutation and unregistered-root refusal unless operator authority basis is present.
- Specified Site identity posture separating public identity docs, private key storage outside public Site artifacts, and trust-pin requirements.
- Specified advisory lift packet behavior with stale-source detection, non-portable path refusal, and receiving-Site admission requirement.
- Added tests for unregistered roots, untrusted observed identities until pinned, and advisory/refused lift packets.

## Verification

- `pnpm --filter @narada2/narada-proper-mcp test` - pass, 18 tests.
- `pnpm --filter @narada2/narada-proper-mcp build` - pass.

## Acceptance Criteria

- [x] Read-only Site probe/connectivity behavior is specified or implemented with trust residuals.
- [x] Site identity posture separates public identity documents, private key storage, and local trust pins.
- [x] Lift catalog/adoption packets remain advisory and receiving-Site-admitted.
