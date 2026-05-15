# Narada proper MCP infrastructure change review recommendation

## Envelope

- Schema: `narada.external_handoff.v0`
- Source site: `narada-andrey`
- Source principal: `operator`
- Captured by: `narada-andrey.Kevin`
- Target site: `narada-proper`
- Target principal: `narada.architect`
- Created at: `2026-05-15T15:04:20Z`
- Authority basis: operator direct instruction, "now inform narada inbox about this change, and recommend narada.architect to review the changes"

## Summary

The operator-directed Narada proper MCP infrastructure rebuild has been implemented and committed locally in Narada proper as:

```text
2f6446b1 Rebuild Narada proper MCP launcher surface
```

The User Site wrapper affordance was committed separately as:

```text
cf843e12 Add Narada proper native shell break-glass wrapper
```

## What Changed

- Added `packages/narada-proper-mcp` as the agent-facing Narada proper MCP package.
- Updated `tools/agent-start/start-agent.mjs` so Codex launch config uses `node --import tsx packages/narada-proper-mcp/src/main.ts`.
- Removed Narada proper agent-facing dependency on `packages/layers/cli/dist/mcp-main.js`.
- Demoted the old `narada-mcp` CLI facade to compatibility-only candidate status in `.narada/capabilities/mcp-surfaces.json`.
- Preserved default Codex native `shell_tool` disablement.
- Added break-glass launcher affordance through `narada.ps1 agent-start -EnableNativeShell`.
- Fixed identity-specific Codex home/config binding so `narada.architect` and `narada.builder` resolve to separate `.narada/crew/codex-home/*` roots.
- Recorded implementation evidence in `.narada/audit/task-1268-mcp-infrastructure-rebuild-audit.json`.
- Added task notes for the main rebuild and the residual handler lift:
  - `.ai/do-not-open/tasks/20260515-1268-rebuild-narada-proper-mcp-infrastructure.md`
  - `.ai/do-not-open/tasks/20260515-1269-lift-narada-proper-mcp-handler-out-of-cli-source.md`

## Review Recommendation

`narada.architect` should review commit `2f6446b1` before treating the new MCP surface as settled site posture.

Recommended review focus:

1. Confirm the package boundary is acceptable: `packages/narada-proper-mcp` depends on `@narada2/agent-context-memory` through workspace package resolution and does not import MCP handlers from `packages/layers/cli/src`.
2. Confirm the new agent-facing tool vocabulary and first-slice implementations are the intended Narada proper surface.
3. Confirm the launcher-generated Codex config should keep using the source TypeScript entrypoint with `node --import tsx` because repository `dist/` outputs are ignored.
4. Confirm `narada.builder` admission in `tools/agent-start/start-agent.mjs` is intended as part of this carrier slice.
5. Confirm the break-glass native shell affordance is sufficiently recorded and remains default-off.
6. Confirm no User Site runtime state, PC runtime state, secrets, task history, inbox history, or operator-surface bindings were imported into Narada proper.

## Verification Already Run

- `node --test tools/agent-start/start-agent.test.mjs`
- `pnpm --filter @narada2/narada-proper-mcp typecheck`
- `pnpm --filter @narada2/narada-proper-mcp build`
- `pnpm --filter @narada2/narada-proper-mcp test`
- `.\narada.ps1 agent-start -Agent narada.architect -Runtime codex -DryRun -Json`
- `.\narada.ps1 agent-start -Agent narada.builder -Runtime codex -DryRun -Json`
- `.\Start-NaradaProperCodex.ps1 -DryRun`
- `.\Start-NaradaProperCodex.ps1 -DryRun -EnableNativeShell`

## Requested Disposition

Please route this as a review recommendation for `narada.architect`.

Expected architect outcomes:

- `accepted`: the change is admitted as the current Narada proper agent-facing MCP launch surface.
- `accepted_with_followups`: the change is admitted, with bounded residual tasks.
- `needs_repair`: the architect identifies concrete repair work before admission.

