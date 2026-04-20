# Task 257: USC/Narada Boundary Hardening

## Chapter

Product Surface Coherence

## Context

The USC bridge (`narada init usc`) works but has no version contract, no CI coverage in Narada, and no offline resilience. The governance feedback channel is a rolling Markdown inbox with no triage.

## Goal

Harden the USC/Narada boundary with version awareness, CI coverage, and minimal automation.

## Required Work

### 1. Version Pinning

In `packages/layers/cli/src/commands/usc-init.ts`:
- Read a `uscCompatibility` field from Narada's root `package.json` or a dedicated `.usc-version` file.
- Before calling USC functions, check the installed `@narada.usc/compiler` version against the expected range.
- If incompatible, print a clear error: "USC compiler version X is installed; Narada requires Y. Run `pnpm add @narada.usc/compiler@Y`."

In `package.json` (root):
- Add an `engines` or `config.uscVersion` field documenting the supported USC version range.

### 2. CI Coverage for USC Init

Create `packages/layers/cli/test/commands/usc-init.test.ts`:
- Mock the dynamic USC import.
- Verify that `uscInitCommand` calls the expected USC functions with the correct arguments.
- Verify version-mismatch handling.
- Skip the test if USC packages are not installed (graceful degradation).

In `.github/workflows/test.yml`:
- Add a step that installs USC packages and runs the USC init test.

### 3. Schema Cache

In `packages/layers/cli/src/commands/usc-init.ts` or a new `packages/layers/cli/src/lib/usc-schema-cache.ts`:
- On successful USC init, copy resolved schemas into `.ai/usc-schema-cache/`.
- If USC packages are missing at runtime, fall back to the cached schemas for validation/read-only operations.
- Document the cache in `AGENTS.md`.

### 4. Governance Feedback Triage

In `.ai/feedback/governance.md`:
- Add a triage section at the bottom with a checklist format for human review.
- Create a simple script (`scripts/triage-governance-feedback.ts`) that:
  - Parses `.ai/feedback/governance.md`
  - Counts entries by severity
  - Prints a summary: "N high, M medium, L low severity items awaiting review"
  - Suggests which USC schema areas may need updates based on feedback scope tags

## Non-Goals

- Do not vendor USC packages into the Narada repo.
- Do not implement full automated triage with ticket creation.
- Do not change USC protocol definitions (those live in `narada.usc`).

## Acceptance Criteria

- [x] USC version mismatch produces a clear, actionable error.
- [x] `package.json` documents the supported USC version range.
- [x] USC init test exists and runs in CI (or skips gracefully if USC absent).
- [x] Schema cache directory exists and is populated on USC init.
- [x] Governance feedback triage script prints a severity summary.
- [x] `pnpm verify` passes.

## Execution Notes

### Version Pinning
- Added `config.uscVersion: "^1.0.0"` to root `package.json`.
- Added `getExpectedUscVersion()`, `getInstalledUscVersion()`, `satisfiesVersionRange()`, and `checkUscVersion()` to `usc-init.ts` (all exported for testing).
- Version check runs before any USC module is loaded. On mismatch, throws: `"USC compiler version X is installed; Narada requires Y. Run \`pnpm add @narada.usc/compiler@Y\`"`.
- Supports exact versions and caret (`^`) ranges with correct `0.x.y` semantics.

### CI Coverage
- Created `packages/layers/cli/test/commands/usc-init.test.ts` with 10 tests.
- Uses `vi.mock()` for `@narada.usc/compiler`, `refine-intent.js`, and `validator.js` — works without USC packages installed.
- Mocks `node:module.createRequire` to resolve fake USC package paths in temp directories.
- Tests cover: version mismatch, missing USC (install hint), happy path init, schema caching, intent refinement path.
- Added `Run USC init tests` step to `.github/workflows/test.yml` in the `test-cli` job.
  - **Note:** This step runs the mocked tests only; USC packages are **not installed in CI**. The tests mock all USC imports and do not require the actual packages.
- Also fixed pre-existing type error in `doctor.ts` (`'unknown'` comparison with `'degraded'` type) that was blocking `pnpm verify`.

### Schema Cache
- Created `packages/layers/cli/src/lib/usc-schema-cache.ts` with cache helpers and fallback validation.
- `uscInitCommand` calls `populateSchemaCache()` after successful validation and prints cache count.
- Cache directory: `.ai/usc-schema-cache/` inside the target repo.
- Best-effort discovery: looks in `packages/compiler/schemas`, `packages/core/schemas`, and `schemas/` relative to USC root.
- **Fallback validation** (`validateUscRepo`): Added in corrective follow-up Task 279. When USC packages are unavailable, `narada init usc-validate <path>` falls back to cached schemas for lightweight structural validation (required keys, JSON validity). Uses full USC validator when packages are installed.
- Documented in AGENTS.md under new "Common Modifications §7: Work with the USC Schema Cache".

### Governance Feedback Triage
- Added triage section to `.ai/feedback/governance.md` with human review checklist and automated summary instructions.
- Created `scripts/triage-governance-feedback.ts` that parses entries, counts by severity and scope, prints summary, and suggests schema areas based on scope tags.
- Tested with empty inbox and with sample entries.

### Verification
- `pnpm verify` — passes (5/5 steps)
- `pnpm --filter @narada2/cli typecheck` — passes
- `pnpm --filter @narada2/cli test` — 175/175 passes (includes 15 USC-related tests: 10 usc-init + 5 usc-validate)
- `pnpm control-plane-lint` — passes

## Dependencies

- Task 255 (Init & Setup Path Hardening) — ops-repo shape must be stable before pinning USC contract.
- Task 252 (Agent Verification Speed & Telemetry) — verification commands must be stable before adding new tests.
