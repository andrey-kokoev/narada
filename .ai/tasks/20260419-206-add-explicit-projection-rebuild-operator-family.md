# Task 206: Add Explicit Projection Rebuild Operator Family

## Why

Narada already has rebuildable non-authoritative surfaces:

- views
- search/index surfaces
- observation/read models

These are all instances of one pattern:

- durable truth stays fixed
- projections are discarded and recomputed

Today this exists in scattered commands and internal utilities, but it is not yet named as part of the same family as replay/recovery operators.

## Goal

Unify projection rebuilds as an explicit operator family member, with clear rules about what may be rebuilt from which durable boundaries.

## Required Outcome

- identify all current rebuildable projections
- define their authoritative inputs
- expose or normalize a coherent rebuild surface
- document projection rebuild as distinct from work replay and recovery

## Coherence Rule

Projection rebuild:

- may mutate non-authoritative derived stores
- must not mutate canonical durable truth
- must not create new work or external effects

## Execution Notes

### Implemented Changes

1. **Unified rebuild surface**: Added `ProjectionRebuildSurface` interface and `ProjectionRebuildRegistry` in `packages/layers/control-plane/src/observability/rebuild.ts`. The registry registers named projections and rebuilds them sequentially with per-projection success/failure tracking.

2. **Conformed existing projections**:
   - `FileViewStore` (`src/persistence/views.ts`): added `asProjectionRebuildSurface()` exposing `filesystem_views` with authoritative input `messages/ directory`
   - Search index (`@narada2/search`): wrapped as a `ProjectionRebuildSurface` with authoritative input `messages/ directory`

3. **CLI command**: Added `narada rebuild-projections` in `packages/layers/cli/src/commands/rebuild-projections.ts`. The deprecated `narada rebuild-views` is preserved but emits a deprecation warning.

4. **Multi-mailbox support**: `rebuild-projections` detects multi-mailbox config (`mailboxes[]`) vs single-config (`scopes[]`) and rebuilds projections for each mailbox root directory. Supports `--mailbox <id>` filter.

5. **Daemon integration**: `createScopeService` builds a `ProjectionRebuildRegistry` with views + search and passes a unified `rebuildProjections` callback to both the sync runner and dispatch context.

6. **Operator action**: Added `rebuild_projections` to `PERMITTED_OPERATOR_ACTIONS` and `OperatorActionRequest.action_type` union.

7. **Config schema**: Added `rebuild_search_after_sync` to `RuntimeConfig` (types, schema, loader, defaults, multi-mailbox config, example JSON, test fixtures).

8. **Sync runner wiring**: `SyncOnceDeps` gained `rebuildProjections` / `rebuildProjectionsAfterSync`. Legacy `rebuildViews` paths preserved with backward-compatible fallback.

9. **Documentation**:
   - SEMANTICS.md §2.8.2: Updated Projection Rebuild description
   - 00-kernel.md §8.2/8.3: Updated boundary pairs and added invariant #7
   - AGENTS.md: Added "Rebuild projections" to task lookup table, updated concept definition, added Common Modifications §7 with inventory table

### Current Inventory of Rebuildable Projections

| Projection | Store/File | Authoritative Input | Module |
|---|---|---|---|
| `filesystem_views` | `views/` directory (symlinks) | `messages/` directory | `FileViewStore` |
| `search_index` | `.search.db` (SQLite FTS5) | `messages/` directory | `SearchEngine` / `Fts5Indexer` |

Observation read models are derived SQL views/queries over the coordinator and message stores; they do not require explicit rebuild because SQLite views are recomputed on query.

### Explicit Limitations

- Projection rebuild is **scope-local**: each scope/mailbox has its own `root_dir` and its own projection set. There is no global cross-scope projection rebuild.
- The search engine CLI (`narada-search build`) exists as a standalone binary but is not integrated into the unified `ProjectionRebuildRegistry`. It is used internally by the registry's `search_index` surface.
- `rebuild_views_after_sync` and `rebuild_search_after_sync` remain separate runtime flags. Future work should generalize these into a single projection-rebuild policy.

## Definition Of Done

- [x] Narada names projection rebuild as a first-class operator family member.
- [x] Existing rebuild surfaces are inventoried and normalized/documented.
- [x] Projection rebuild is clearly separated from replay work derivation and recovery.
- [x] Docs specify authoritative inputs for each rebuildable projection.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.
