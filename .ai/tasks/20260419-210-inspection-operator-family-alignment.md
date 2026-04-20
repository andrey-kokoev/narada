# Task 210: Align Inspection as an Operator Family in Canonical Ontology

## Family

`inspection`

## Why

Inspection is the most frequently used operator family, yet it is not named as such in canonical docs. It is treated as a side effect of the Observation layer rather than as a first-class operator family. This causes two problems:

1. **Taxonomic drift**: Preview derivation (Task 203) is conceptually read-only inspection of charter output from facts, but it is filed under `re-derivation` because it derives from a durable boundary. The boundary between "inspecting derived state" and "deriving read-only state" is implicit.
2. **Documentation gaps**: New contributors cannot discover inspection surfaces through the ontology; they must hunt through `observability/`, CLI commands, and daemon routes.

Aligning inspection as a named operator family makes the ontology complete and makes the observation API discoverable by reading `SEMANTICS.md`.

## Specific Gap

1. **No canonical family definition**: `SEMANTICS.md` and `00-kernel.md` do not define `inspection` as an operator family.
2. **Implicit boundary with preview derivation**: Task 203 (preview derivation) sits in the re-derivation family but is read-only. The docs do not explain when an operation is "inspection" vs. "read-only derivation."
3. **Undocumented authority**: Observation routes require no authority today, but there is no explicit statement that inspection is authority-agnostic.

## Why Not Already Covered

- No existing task addresses inspection as a family.
- Tasks 064–085 and 152 cover observation API implementation but do not frame it as an operator family.
- Task 207 identified inspection as a possible gap but did not create a follow-up task.

## Required Approach

### 1. Define the Family in Canonical Docs

Add an `inspection` section to:
- `SEMANTICS.md` — define inspection as the read-only operator family, enumerate its members, and distinguish it from preview derivation
- `00-kernel.md` — define inspection invariants (read-only, authority-agnostic, projection non-authority)

The definition should state:
- **Inspection** reads durable or derived state without mutation.
- **Preview derivation** re-computes downstream state from a durable boundary without mutation; it is a *re-derivation* member because it starts from a boundary and recomputes, but its effect class is read-only.
- The distinction: inspection starts from **already-derived** state; preview derivation starts from a **durable boundary** and re-derives.

### 2. Inventory and Classify Existing Inspection Surfaces

Under the new taxonomy, classify every existing inspection surface:
- CLI: `status`, `integrity`, `inspect`, `explain`, `demo`, `backup-ls`, `backup-verify`
- Daemon: all 23 `GET /scopes/...` routes
- Control plane: all `*StoreView` interfaces, `ObservationPlane`, `ControlPlaneStatusSnapshot`
- Source-trust tags: `authoritative`, `derived`, `decorative`

### 3. Document Authority Neutrality

Explicitly state in `SEMANTICS.md` and `AGENTS.md` that inspection requires no authority class. Observation routes must remain ungated by authority checks (they are gated by scope access / authentication only).

## Required Deliverables

- [x] `SEMANTICS.md` section defining inspection operator family and its distinction from preview derivation
- [x] `00-kernel.md` section defining inspection invariants
- [x] Existing inspection surfaces classified under the inspection taxonomy (inventory in docs or comments)
- [x] Explicit statement that inspection is authority-agnostic

## Non-Goals

- Do not implement new observation routes or query functions
- Do not recategorize preview derivation out of the re-derivation family (only clarify the boundary)
- Do not add authority checks to existing observation routes
- Do not change any observation type shapes or response formats

## Definition of Done

- [x] Inspection is a named operator family in canonical docs.
- [x] The distinction between inspection and preview derivation is explicitly documented.
- [x] All major existing inspection surfaces are listed under the inspection taxonomy.
- [x] No authority requirement is added to observation routes.
- [x] The task does not regress any observation read-only invariant.

## Execution Evidence

### Canonical docs
- `SEMANTICS.md` §2.11 — Added Inspection Operator Family with:
  - Definition distinguishing inspection (reads already-derived state) from preview derivation (re-computes from durable boundary)
  - Members table listing all 9 inspection surfaces (status, integrity, explain, inspect, observation, backup-verify, backup-ls, demo, dry-run)
  - Four inspection invariants (read-only, authority-agnostic, projection non-authority, source-trust transparent)
  - Explicit relationship to preview derivation explaining why preview derivation belongs to re-derivation (§2.8) not inspection
- `00-kernel.md` §11 — Added Inspection Operators with:
  - Inspection targets table (Fact, Context, WorkItem, Execution, Observation, Backup)
  - Four kernel invariants for inspection (read-only, authority-agnostic, projection non-authority, boundary respect)
  - (Renumbered Known Gaps → §12, See Also → §13)
- `AGENTS.md` — Added `inspection operator` to concept table; updated invariant 18 to explicitly state inspection requires no authority class
- `SEMANTICS.md` document index and "How to Extend" section updated to reference §2.11

### Verification
- `pnpm verify` — daemon and control-plane typechecks pass; CLI failure is pre-existing (`confirm-replay.ts`)
- `pnpm --filter @narada2/daemon test test/unit/observation-server.test.ts` — 55/55 pass
- No observation routes or types were modified; no authority checks added
