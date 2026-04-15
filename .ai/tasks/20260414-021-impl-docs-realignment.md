# Implementation — Documentation Realignment

## Mission

Update all repo documentation to reflect the control-plane v2 architecture: deterministic compiler, first-class work objects, bounded agent evaluation, and hard outbound boundary.

## Scope

Primary targets:
- `README.md`
- `AGENTS.md`
- `packages/exchange-fs-sync/AGENTS.md`
- `packages/exchange-fs-sync/docs/02-architecture.md`
- `packages/exchange-fs-sync/docs/04-identity.md`

## Consumes

- `20260414-011-chief-integration-control-plane-v2.md`
- `20260414-002-foreman-core-ontology-and-control-algebra.md`
- `20260414-003-identity-lattice-and-canonical-keys.md`

## Dependencies

Depends on:
- Completion of core implementation (012–019) so documentation can reference real packages/modules

Blocks:
- None — can proceed in parallel with testing

## Tasks

1. **`README.md`**
   - Ensure the five-layer architecture narrative is present.
   - Remove any remaining "daemon wakes agent on thread changes" language.
   - Mention `packages/charters` and the control-plane layers.

2. **Root `AGENTS.md`**
   - Add cross-reference to `20260414-011-chief-integration-control-plane-v2.md`.
   - Update the "Where to Find Things" table with new foreman/scheduler/charter runtime paths.
   - Add control-plane invariants to the Critical Invariants section.

3. **`packages/exchange-fs-sync/AGENTS.md`**
   - Add note: "For control plane architecture, see `20260414-011-chief-integration-control-plane-v2.md`."
   - Update package-specific guidance if any paths changed.

4. **`packages/exchange-fs-sync/docs/02-architecture.md`**
   - Add control-plane layers above the existing six compiler layers:
     - Foreman
     - Scheduler
     - Charter Runtime
     - Tool Runner
     - Outbound Worker
   - Include the end-to-end sequence diagram from 011 Task 3.

5. **`packages/exchange-fs-sync/docs/04-identity.md`**
   - Add a section on control-plane identities:
     - `conversation_id`, `work_item_id`, `execution_id`, `decision_id`, `outbound_id`
   - Explain their relationship to compiler event IDs.
   - State `thread_id === conversation_id` explicitly.

## Definition of Done

- [x] All listed docs are updated and committed
- [x] No "daemon wakes agent" phrasing remains
- [x] Architecture docs include control-plane layers
- [x] Identity docs include control-plane IDs
- [x] `pnpm typecheck` and `pnpm test` still pass (no broken links or references)
