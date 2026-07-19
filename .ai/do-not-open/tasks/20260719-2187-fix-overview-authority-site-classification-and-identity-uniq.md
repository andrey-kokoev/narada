---
status: opened
---

# Fix overview authority, Site classification, and identity uniqueness

## Goal

Overview reads work posture from the canonical Site authority locus, classifies Sites honestly, and keeps canonical agent identities unique

## Context

Covers findings 1, 3, 5 from the Site-and-Agent overview review. F1: defaultReadPrincipalStates in packages/layers/cli/src/commands/site-agent-overview-read-model.ts (lines 84-90) reads workspace_root/.principal-runtimes.json, while production writers resolve principal state via resolvePrincipalStateDir (packages/layers/cli/src/lib/principal-bridge.ts line 38) at the Site authority locus (site_root/.ai). Wrong root and missing .ai segment, so work posture reads empty or foreign state. F3: agentMatches (lines 111-120) treats bare local_agent_id and legacy_agent_id as sufficient; workState (line 151) matches principal records by bare id with no site scoping, so a bare architect can bind principal state from another Site (bare ids exist, e.g. sonar launch records). F5: defaultReadSiteMetadata silently falls back to site_kind site on metadata failure (line 81); registry-only Sites are silently classified site (lines 257-267); canonicalAgentId (site + local id) may duplicate across colliding records with no detection.

## Required Work

1) Resolve principal runtime state from the canonical Site authority locus (resolvePrincipalStateDir semantics with the site root, consistent with principal-bridge) instead of workspace_root; keep per-site read failure mapped to refusals. 2) Site-scope principal matching: bind principals by canonical site-qualified agent id only; bare or legacy ids may match only inside the site own registry and never cross-site; cross-site collision yields ambiguous or unavailable, never a silent bind. 3) Honest classification: surface the classification source (declared metadata vs fallback vs registry_only) instead of silently labeling ordinary site; metadata failure produces a diagnostic. 4) Identity uniqueness: detect duplicate canonical agent_ids and duplicate site_ids across launch records and registry rows; surface explicit diagnostics, never render silent duplicates.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Unit test: work posture is read from the site authority locus fixture; a workspace_root principal file is ignored
- [ ] Bare-id cross-site collision yields ambiguous or unavailable, not a bind
- [ ] Metadata failure and registry-only sites carry explicit classification-source diagnostics
- [ ] Duplicate canonical ids produce diagnostics and are not silently rendered
- [ ] Overview tests updated and green; tsc clean
