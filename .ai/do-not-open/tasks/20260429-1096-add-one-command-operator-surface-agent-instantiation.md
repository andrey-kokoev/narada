---
status: claimed
---

# Add one-command Operator Surface agent instantiation

## Chapter

Operator Surface Agent Instantiation

## Goal

Provide a single Operator-facing command that commissions or instantiates a Site role agent surface, starting with architect, without collapsing Narada proper identity authority into volatile User/PC runtime-handle mutation authority.

## Context

Operator Surface work now has durable identity primitives:

- `narada operator-surface identity add ...`
- `narada operator-surface labels build ...`
- `narada operator-surface bind-focused --as self`
- runtime-locus deferral for volatile handle mutation
- Site `agent-bootstrap` for role bootstrap text

These primitives are coherent, but they are not ergonomic for the Operator. Starting a fresh Site Architect should not require remembering the lower-level identity, label, bootstrap, and self-bind sequence. The missing surface is a single Operator-facing command that commissions or instantiates the role agent surface while preserving the authority split:

```text
durable Site/role/surface identity -> Narada proper or target Site governance
volatile runtime/window/session binding -> owning User/PC/runtime Site
actual agent process launch -> runtime-locus adapter or explicit deferred handoff
```

The first supported role should be `architect`; the design should not hardcode Architect-only assumptions that would block Builder or Observer later.

## Required Work

1. Add a high-level CLI command for Operator use, tentatively:

   ```bash
   narada operator-surface agent instantiate --site <site-id-or-root> --role architect --agent-kind codex_cli --by <principal>
   ```

   If a better verb is already established in the command tree, use it, but keep the command single-invocation and Operator-facing.

2. The command must admit or reuse the durable Operator Surface identity for the requested Site and role through the existing identity registry. It must not require direct JSON edits.
3. The command must produce a compact human result and structured JSON result that include:
   - site id/root;
   - role;
   - identity id;
   - agent kind;
   - whether identity was created or reused;
   - copyable bootstrap text or a reference to the Site `agent-bootstrap` output;
   - the self-bind command: `narada operator-surface bind-focused --as self`;
   - any runtime-locus deferred command needed for focused window/session binding.
4. Add `--dry-run` or equivalent preview mode that performs no identity mutation and still reports the exact planned downstream actions.
5. Preserve authority boundaries:
   - Narada proper may create or reuse durable identity records.
   - Narada proper must not directly mutate HWNDs, process ids, terminal tabs, API thread ids, MCP client ids, or other volatile runtime handles.
   - If focused runtime binding or launch/focus is requested, return a deferral packet for the owning User/PC/runtime Site with an exact command.
6. Use existing Site role bootstrap machinery when available instead of duplicating role text. If the Site lacks a compatible generated `AGENTS.md`, return a bounded blocker with the repair command or fallback posture.
7. Update help text so the high-level command is discoverable from `narada operator-surface --help` and does not force the Operator through the primitive sequence.
8. Update docs:
   - `docs/concepts/operator-surface.md`;
   - `docs/product/site-bootstrap-contract.md`;
   - any generated Site AGENTS template if bootstrap text changes.
9. Add focused tests for the command behavior.
10. Verify with typecheck and the focused CLI tests that cover the new command.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Expose one ergonomic CLI command for Operator use, e.g. `narada operator-surface agent instantiate --site <site-id-or-root> --role architect --agent-kind codex_cli --by <principal>`, with help text shorter and clearer than the lower-level identity/bind sequence.
- [ ] The command must admit or reuse the durable Operator Surface identity for the requested Site and role through the existing identity registry instead of requiring direct JSON edits.
- [ ] The command must emit copyable bootstrap text or a launch/handoff packet for the requested role using the Site `agent-bootstrap` contract when available, and must include the self-bind instruction `narada operator-surface bind-focused --as self`.
- [ ] The command must not directly mutate volatile runtime handles from Narada proper; when a focused runtime/window/session binding is requested, it must return a runtime-locus deferral with the exact command for the owning User/PC/runtime Site.
- [ ] The command must support dry-run/preview semantics and JSON output so Operator surfaces can call it safely before any identity mutation.
- [ ] Add focused tests covering architect happy path, unknown role rejection, dry-run no mutation, existing identity reuse, runtime-locus deferral, and compact human output.
- [ ] Update Operator Surface and Site bootstrap documentation to name this as the canonical high-level Operator path, while keeping lower-level identity add and bind-focused commands as primitives.
