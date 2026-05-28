---
status: closed
no_continuation_needed_rationale: Continuation exists as follow-on tasks 1365-1371 in the same MCP facade coverage chapter; no additional continuation task is needed.
closed_at: 2026-05-16T01:15:52.428Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Audit narada-andrey MCP lift evidence freshness

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1364-1371-narada-proper-mcp-facade-full-surface-coverage.md

## Goal

Determine which MCP registry, lift catalog, client config, and server patterns in C:/Users/Andrey/Narada are current enough to use as source evidence for Narada proper.

## Context

Source evidence is C:/Users/Andrey/Narada, especially AGENTS.md, config.json, .narada/capabilities/mcp-surfaces.json, .ai/mcp/*.json, site-lift/lift-catalog.json, tools/mcp-payload-file.mjs, tools/typed-mcp, tools/task-lifecycle, tools/mcp-servers, tools/operator-surface, tools/capability-lifecycle, tools/site-lift, tools/site-probe, tools/site-connectivity, and tools/site-identity. The lift catalog may be stale and must not be trusted without verification against current source files and tests.

## Required Work

1. Read the source registry, lift catalog, generated MCP client snippets, and relevant server/test mtimes or Git state under C:/Users/Andrey/Narada without mutating that Site.
2. Compare declared surfaces and tool contracts against the actual server tool lists and tests.
3. Classify each source artifact as current, stale-but-instructive, non-portable, or rejected for Narada proper adoption.
4. Record explicit non-portable boundaries: narada-andrey identities, local PC runtime paths, SQLite DBs, task histories, inbox histories, checkpoints, secrets, and generated runtime projections.

## Non-Goals

- Do not copy narada-andrey runtime state into Narada proper.
- Do not mutate C:/Users/Andrey/Narada.
- Do not treat source registry or lift catalog claims as receiving-Site authority.

## Execution Notes

- Inspected `C:/Users/Andrey/Narada` read-only; no source Site mutation was performed.
- Recorded the audit artifact at `kb/operations/narada-andrey-mcp-lift-evidence-freshness-audit-20260516.md`.
- Classified current adoption evidence as actual MCP server/test files and `tools/mcp-payload-file.mjs` / `.test.mjs`, subject to Narada proper admission.
- Classified `.narada/capabilities/mcp-surfaces.json` as stale-but-instructive: it is useful for declared authority posture but not fresh enough as an exact exposed-tool contract.
- Classified `site-lift/lift-catalog.json` as stale-but-instructive: advisory adoption manifest, not complete current lift authority.
- Classified `.ai/mcp/*.json` as non-portable generated client transport projections.
- Rejected source Site runtime state, SQLite DBs, task histories, inbox histories, checkpoints, secrets, local PC paths, generated runtime projections, and `narada-andrey` identities as Narada proper adoption material.

## Verification

- `Get-ChildItem -Force C:\Users\Andrey\Narada` inspected top-level source Site mtimes.
- `git -C C:\Users\Andrey\Narada status --short` observed source worktree dirtiness without mutation.
- `Get-Item` inspected registry/catalog/payload helper mtimes.
- `Get-ChildItem C:\Users\Andrey\Narada\.ai\mcp -File` inspected generated client config mtimes.
- `Get-ChildItem C:\Users\Andrey\Narada\tools -Recurse -File -Include *mcp-server*.mjs,*mcp*.test.mjs,*server*.test.mjs` inspected server/test evidence refs and mtimes.
- `git -C C:\Users\Andrey\Narada log -1 --format="%H %cI %s" -- <audited paths>` identified latest relevant commit `7e9794b6ffb07f4154550ea1afdec16023f43445`.
- Node JSON reads extracted registry and lift-catalog declared surfaces/artifacts for comparison against actual server tool declarations.

## Acceptance Criteria

- [x] Freshness audit identifies the source evidence refs used for every follow-on task.
- [x] Stale or unverifiable source lift claims are excluded or marked as advisory only.
- [x] Narada proper adoption candidates are separated from non-portable User Site state.
