# Decision 20260420-245: Product Surface Cavities Inventory

> **Scope**: User/operator-facing surface gaps after Operational Trust chapter completion.
> **Authority**: Task 245 (Product Surface Coherence chapter definition).
> **Status**: Adopted.

---

## Method

This inventory was produced by structured audit of:
1. CLI command surfaces (`packages/layers/cli/src/`)
2. Config schema and example (`packages/layers/control-plane/src/config/`, `config.example.json`)
3. Daemon service layer (`packages/layers/daemon/src/`)
4. UI shell (`packages/layers/daemon/src/ui/`)
5. Observability layer (`packages/layers/control-plane/src/observability/`)
6. Documentation (`README.md`, `QUICKSTART.md`, `AGENTS.md`, `TERMINOLOGY.md`, `docs/runbook.md`)
7. CI/workflows (`.github/workflows/`)
8. USC bridge (`packages/layers/cli/src/commands/usc-init.ts`, `types/usc.d.ts`)
9. Ops-kit library (`packages/ops-kit/src/`)

Each cavity is classified by **user-facing impact**, **implementation area**, and **chapter fit**.

---

## Cavity 1: Operation/Scope Terminology Leakage

**User-facing impact**: High. Users encounter `--scope`, `Scope ID`, `No scopes configured`, and `scope_id` in their config files despite the canonical user-facing term being **operation**.

**Implementation area**: CLI commands (`main.ts`, all command files), config generation, observation API JSON responses.

**Specific leaks**:
- CLI flags: `--scope <id>` (6 commands)
- Positional args: `audit [scope-id]`
- Error messages: `Scope not found`, `No scopes configured`
- Console output: `fmt.kv('Scope', ...)` in human-readable mode
- Config file: `scope_id`, `scopes[]` written to user's `config.json`
- Observation API: `scope_id` key in all REST responses
- Internal code is correct; leakage is at the boundary only.

**Chapter fit**: ✅ Yes. This is pure product-surface coherence.

**Deferred?**: No. This is the most visible inconsistency in the product.

---

## Cavity 2: Conflicting Init/Setup Paths

**User-facing impact**: High. Two commands (`init` and `init-repo`) produce different config shapes in different locations. `init` generates a legacy single-scope config; `init-repo` generates a modern multi-scope ops repo.

**Implementation area**: CLI (`config.ts`, `config-interactive.ts`, `init-repo.ts` in ops-kit).

**Specific gaps**:
- `narada init` writes legacy `mailbox_id`-at-root config
- `narada init --interactive` writes modern `scopes[]` but to `./config.json`, not `./config/config.json`
- `want-mailbox` CLI missing `--graph-user-id`, `--folders`, `--data-root-dir` (library supports them)
- Preflight only checks env vars, ignores config-file credentials
- `.env.example` missing `GRAPH_ACCESS_TOKEN` and `NARADA_OPENAI_API_KEY`
- Daemon defaults to `./config.json`, not ops-repo `./config/config.json`
- No `narada doctor` command for post-activation health check

**Chapter fit**: ✅ Yes. First-run experience is core product surface.

**Deferred?**: No.

---

## Cavity 3: Daemon Hardcoded to Mailbox Vertical

**User-facing impact**: High for non-mail users. The daemon's `createScopeService` requires a Graph source and crashes without one. Timer, webhook, and filesystem operations cannot actually run.

**Implementation area**: Daemon service layer (`service.ts`), UI (`index.html`), config example.

**Specific gaps**:
- `createScopeService` throws `No graph source found` if `sources` lacks `type: "graph"`
- Always builds `GraphHttpClient`, `DefaultGraphAdapter`, `ExchangeSource`
- Always registers `SendReplyWorker`, `NonSendWorker`, `OutboundReconciler`
- `SyncStats.perMailbox` instead of `perScope`
- UI `loadExecutions()` hardcodes a "Mail executions" card in the generic executions page
- `config.example.json` has only mailbox-shaped examples

**Chapter fit**: ✅ Yes. Live-service vertical neutrality is a product promise.

**Deferred?**: No. This is a correctness issue for the kernel's claimed generality.

---

## Cavity 4: Verification Policy Is Honor-System

**User-facing impact**: Medium (agent/operator friction). The verification ladder is documented but not mechanically enforced. CI references non-existent scripts.

**Implementation area**: CI workflows, test scripts, telemetry.

**Specific gaps**:
- `pnpm test:full` can be run immediately without `verify` or package-scoped tests
- No telemetry gate or cooldown for ladder skipping
- `.github/workflows/test.yml` calls `pnpm fmt --check` — no `fmt` script exists
- `.github/workflows/test-cross-platform.yml` calls `pnpm lint` — no `lint` script exists
- `task-file-guard.ts` only runs inside `pnpm verify`, not direct test commands

**Chapter fit**: ✅ Yes. Mechanical guardrails are part of operational trust surfacing.

**Deferred?**: No.

---

## Cavity 5: USC/Narada Bridge Is Soft

**User-facing impact**: Medium. The USC integration works but has no version contract, no CI coverage, and no offline resilience.

**Implementation area**: CLI bridge (`usc-init.ts`, `usc.d.ts`), external dependency.

**Specific gaps**:
- `@narada.usc/*` packages loaded dynamically at runtime; no declared dependency
- No version pinning or compatibility matrix
- Hand-maintained `usc.d.ts` can drift from actual USC exports
- No CI test for `usc-init.ts`
- No schema cache/mirror for offline use
- Governance feedback is a rolling Markdown inbox with no triage automation

**Chapter fit**: ✅ Yes. USC boundary is part of the product surface for repo generation.

**Deferred?**: Partial. Schema caching and full triage automation can be deferred; version pinning and CI coverage should not be.

---

## Cavity 6: Live-Service Residuals (Minor)

**User-facing impact**: Low. These are cosmetic or already guarded by lint.

**Specific gaps**:
- `AGENTS.md` has duplicate invariant numbers (two #18, two #38)
- Some invariant text uses mail-specific terminology ("Graph API", "outbound_commands")
- UI nav is clean, but `loadExecutions()` has a mail card in generic page (covered in Cavity 3)

**Chapter fit**: ✅ Yes. Housekeeping that fits naturally with surface coherence.

**Deferred?**: No. Trivial fixes bundled into Cavity 1 and 3 tasks.

---

## Deferral List

These cavities were considered but deferred out of this chapter:

| Cavity | Why Deferred |
|--------|--------------|
| Secure-storage CLI helpers | Requires OS-specific implementation; can be solved with docs for now |
| `narada setup-systemd` automation | Systemd install is one-time; manual steps are acceptable |
| Log shipping / centralized logging | Explicitly out of scope per Task 237 non-goals |
| Multi-folder mailbox redesign | Requires explicit redesign; not a surface coherence issue |
| `want-workflow` schedule format guidance | Minor UX polish; can be deferred |

---

## Chapter Task Mapping

| Cavity | Task | Core Deliverable |
|--------|------|------------------|
| 1 | 254 | User-facing surfaces use "operation", not "scope" |
| 2 | 255 | Unified, ops-repo-aware init path + hardened setup |
| 3 | 256 | Daemon runs non-mail verticals without Graph assumptions |
| 4 | 252 | Agent verification speed and telemetry (pre-assigned) |
| 5 | 257 | USC bridge has version contract + CI coverage |
| Closure | 258 | Integrated review, changelog, residual list |

---

## New Cavities Discovered During Chapter Execution

These issues were uncovered while implementing Tasks 252, 254–257. They are documented here for triage into future chapters.

| # | Cavity | Discovery Context | Recommended Priority | Notes |
|---|--------|-------------------|----------------------|-------|
| A | Hidden `--scope` aliases persist for backward compatibility | Task 254: rename surface | Low | Design decision; removal requires deprecation cycle and migration guide |
| B | `doctor.ts` pre-existing type errors (`"warn"` vs `"warning"`, `unknown` vs `degraded`) | Task 257: verify pass | Medium | Blocks strict typecheck; should be fixed in next CLI cleanup pass |
| C | `better-sqlite3` V8 fatal exit 133 during test teardown | Task 252: verify speed | High (infra) | Mitigated by excluding control-plane tests from `pnpm verify`; root cause still unknown |
| D | AGENTS.md invariant numbering required two-pass fix | Task 254: gap-fix | Low | First fix shifted duplicates in Control Plane section but missed downstream sections; indicates need for lint rule |
| E | Secondary "No scopes configured" occurrences in 5 files missed by initial audit | Task 254: gap-fix | Low | Files: `handled-externally.ts`, `show.ts` (second occurrence), `doctor.ts`, `mark-reviewed.ts`, `reject-draft.ts` — suggests grep-based audit needs broader patterns |
| F | Timer/webhook verticals have no projector logic beyond fact ingestion | Task 256: integration test | Medium | Non-mail scopes start and sync, but no vertical-specific projections or UI cards exist yet |
| G | Governance feedback triage script is best-effort regex parsing | Task 257: triage | Low | Could drift if Markdown format changes; consider structured JSON feedback format |
