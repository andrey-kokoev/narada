# Operator Directive: Rebuild Narada Proper MCP Infrastructure

```json
{
  "schema": "narada.operator_directive_packet.v0",
  "packet_id": "operator-directive-20260515-mcp-infrastructure-rebuild",
  "site_id": "narada-proper",
  "source": {
    "kind": "operator_direct_instruction",
    "principal": "operator",
    "captured_by": "narada-andrey.Kevin",
    "captured_at": "2026-05-15T13:51:37Z",
    "verbatim_intent": "proceed to blow up mcp infrastructure used in narada proper; decouple it from its own /packages; but then repopulate mcp related package with new lift. proceed to send detailed operator originating directive to narada inbox"
  },
  "authority": {
    "operator_originating": true,
    "target_locus": "narada-proper",
    "target_root": "D:/code/narada",
    "intake_status": "pending_narada_proper_review",
    "execution_authority": "requires_narada_proper_task_admission_before_code_mutation"
  }
}
```

## Directive

Replace the current Narada proper MCP infrastructure shape. Treat the existing `narada-mcp` usage in Narada proper as a temporary bootstrapping surface that has now shown the wrong coupling:

- Narada proper carrier startup currently points Codex at `node_modules/.bin/narada-mcp.cmd`.
- That command resolves into `@narada2/cli` under `packages/layers/cli/dist`.
- The MCP facade is therefore operationally coupled to Narada proper's own package build/dist state.
- This differs from the User Site MCP pattern, where agent-facing MCP servers are explicit local surfaces with clear command, args, site root, identity environment, and restart/readiness boundaries.

The Operator wants the Narada proper MCP infrastructure blown up in the engineering sense: inventory, retire, replace, and prove a clean structure. Do not merely patch around the current `narada-mcp` behavior.

## Required Work

1. Inventory every Narada proper MCP runtime path:
   - `tools/agent-start/start-agent.mjs` Codex config generation;
   - `narada.ps1 agent-start`;
   - `.narada/crew/codex-home/*/config.toml`;
   - `config.json` MCP entries;
   - `.narada/capabilities/mcp-surfaces.json`;
   - `packages/layers/cli/src/mcp-main.ts`;
   - `packages/layers/cli/src/mcp-server.ts`;
   - tests and docs that claim `narada-mcp` behavior.

2. Decouple Narada proper agent-facing MCP runtime from the monolithic `/packages` CLI build path.
   - Carrier startup must not depend on `packages/layers/cli/dist` freshness just to expose the agent-facing MCP surface.
   - Codex MCP config should point at an admitted MCP carrier/surface whose boundary is explicitly MCP-shaped, not "CLI package happens to include MCP."
   - If a package is still used, it must be an explicit MCP-related package/lift, not incidental reuse of the whole CLI layer.

3. Retire or quarantine the current coupled facade.
   - Make the old `narada-mcp` facade either a compatibility shim or a non-agent-facing internal command.
   - Prevent future Narada proper launches from silently inheriting stale or wrong MCP behavior from `@narada2/cli`.
   - Keep a compatibility path only if it is named, tested, and clearly non-authoritative for the new carrier.

4. Repopulate the MCP-related package/lift with the right shape.
   - Create or repair the MCP package boundary so it contains the proper agent-facing MCP implementation.
   - The new lift should define tool registry, transport adapter, site-root binding, identity/start-event/carrier-session binding, output/payload handling, capability policy projection, and mutation evidence behavior.
   - Tool names should be intentionally chosen. If compatibility aliases are retained, they must be explicit and tested.

5. Prove the new shape end to end.
   - Fresh `narada.architect` launch uses the new MCP command path.
   - `tools/list` shows the intended Narada proper tools.
   - `agent_context_hydrate_current` works from launch evidence.
   - Task/inbox/checkpoint first-slice tools use target-local authority only.
   - Default launch still disables native `shell_tool`; break-glass launch only omits `--disable shell_tool` with recorded authority ref.

## Acceptance Criteria

- Narada proper Codex launch no longer depends on `D:/code/narada/packages/layers/cli/dist/mcp-main.js` as the agent-facing MCP runtime path.
- The new MCP command path is named in launch result evidence and Codex config.
- The new MCP surface has focused tests for:
  - argument parsing;
  - site-root binding;
  - identity/start-event/carrier-session propagation;
  - `tools/list`;
  - `agent_context_hydrate_current`;
  - at least one read-only task/inbox/checkpoint tool;
  - refusal of source Site runtime import;
  - default native shell disablement and explicit break-glass exception reporting.
- `.narada/capabilities/mcp-surfaces.json` distinguishes live surfaces from candidates after the rebuild.
- Any removed/retired MCP paths are named in an audit artifact with replacement path and rollback note.

## Non-Goals

- Do not import `narada-andrey` runtime DBs, task history, inbox history, checkpoint memory, roster state, operator-surface bindings, PC-locus state, or secrets.
- Do not copy User Site MCP implementation wholesale as Narada proper truth.
- Do not mutate PC-locus launch shortcuts or operator-surface runtime bindings as part of this directive.
- Do not publish packages externally.
- Do not force-push or perform destructive git operations.
- Do not treat native shell break-glass as ordinary agent capability.

## Pause Triggers

Pause and ask the Operator before:

- deleting package directories or large source trees;
- force-pushing or rewriting git history;
- publishing packages;
- requiring credentials/tokens;
- mutating PC-locus runtime state;
- expanding the work into general package architecture cleanup beyond MCP infrastructure.

## Terminal Evidence Required

- Task/admission record naming this directive as source.
- Implementation audit with changed files, retired surfaces, new surfaces, and non-import proof.
- Focused test output.
- Dry-run launch evidence showing new MCP command path.
- Live or dry-run `tools/list` evidence for the new MCP surface.
- Explicit statement of remaining residuals, if any.
