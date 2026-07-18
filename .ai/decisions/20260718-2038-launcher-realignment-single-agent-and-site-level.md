# Decision: Realign launcher architecture around single-agent primitive and site-level launch

- **Status**: accepted (recorded by task 2038, chapter `launcher-realignment`)
- **Date**: 2026-07-18
- **Task**: #2038; enables #2039 (site-level launch path) and #2040 (demotion of group machinery)
- **Review discipline**: `docs/governance/architectural-pruning.md` (PE-lite)

## Context

The launcher grew around the least common launch shape. `GET /console/launch`
(`packages/operator-console-ui/src/pages/OperatorConsoleLaunchPage.vue`) is a
read-only router to CLI-owned workspace-launch sessions; launch authority
deliberately stays in the CLI. Behind that page sits the workspace-launch
subsystem: 44 `workspace-launch-*` files in `packages/layers/cli/src/commands/`
(7,889 lines) plus four packages. Its execution core reduces to: read the
`.psd1` launch registry → select records → build per-agent plans → concatenate
`wt.exe` arguments → spawn.

Inventory facts (verified 2026-07-18):

- Registered CLI commands (`launcher-register.ts`): `launcher artifact check|ensure`,
  `launcher workspace-plan`, `launcher workspace-launch`, `launcher workspace-recover`,
  `launcher explain-mcp`.
- `@narada2/process-launch-posture` is a **repo-wide** governed-process-spawn
  primitive (24 consumer packages). It is not launcher-specific.
- `@narada2/launch-process-ownership` is consumed outside the launcher by
  `agent-runtime-server` and `nars-capability-gateway`. It is not launcher-specific.
- `@narada2/workspace-launch-contract` and `@narada2/workspace-launch-ui` are
  consumed only by the launcher subsystem and the console launcher page.
- `narada onboarding start` (`commands/onboarding.ts`) drives
  `workspaceLaunchCommand` programmatically — the boot-time fleet bring-up
  depends on the non-interactive launch path.
- The single-agent primitive already exists outside this subsystem:
  `Start-NaradaAgent.ps1` + `config/launch/agents.psd1` (user site), exposed
  read-only through the launcher MCP (`launcher_plan`, `launcher_registry_list`).
- Sites already carry their own lifecycle vocabulary
  (`lib/launcher-runtime-site-command.ts`: `loop pause/resume/run/drain`,
  `resident summon/recover/resolve/...`), site readiness checks, and the
  `Narada-{site}-Daemon` scheduler path. Composition by site exists and does
  not flow through workspace-launch.
- Group launch composes with nothing else: scheduler, site loops, delegated
  tasks, and worker-delegation each spawn their own way.

## Decision

**Two supported launch shapes:**

1. **Single-agent launch is the default primitive everywhere.** One agent, one
   site binding, one runtime. The PowerShell `Start-NaradaAgent.ps1` path (and
   its launcher-MCP planning projection) is the canonical primitive; the TS
   single-record path (`launcher workspace-launch --agent <id>`) remains the
   in-CLI equivalent. Anything that needs an agent launched launches one agent.
2. **Site-level launch is the composition unit.** `narada sites launch <site>`
   (task #2039) ensures the site's declared runtime posture — resident carrier,
   bound MCP surfaces, console — composed from the site manifest and existing
   primitives. No interactive flat-registry selection.

**Group/fleet launch is demoted to a thin convenience.** The legitimate niche
(boot-time or ad-hoc bring-up of several local terminal agents) survives only
as a loop over the single-agent primitive: the non-interactive multi-record
path that `narada onboarding start` already uses. The interactive grouping
*product* — selection-UI server, session/attempt/observation stores, recovery,
handoff/projection machinery, and the console sessions dashboard — is retired
(task #2040).

**Composition by other means, not by a grouping engine.** Declarative
composition lives in site manifests; boot-time composition in the scheduler /
onboarding; ephemeral work crews in delegated-task and worker-delegation.

### Keep / demote / remove verdicts

| Piece | Verdict | Reason |
|---|---|---|
| `process-launch-posture` package | **keep, untouched** | repo-wide governed-spawn primitive (24 consumers) |
| `launch-process-ownership` package | **keep, untouched** | used by `agent-runtime-server`, `nars-capability-gateway` |
| `launcher-artifact.ts`, docs/architecture/launch-artifact-integrity.md | **keep** | install/doctor integrity check, unrelated to grouping |
| `launcher-mcp-authority.ts` (`explain-mcp`) | **keep** | read-only authority explanation |
| Registry/planning core: `workspace-launch-registry`, `-resolution`, `-plan-builder`, `-executor`, `-preflight`, `-smoke`, `-command`, `-application*`, `-types`, `-contracts`, `-context`, `-process`, `-result`, `-support`, `-terminal`, `-provider-context` | **keep (core)** | carries the actual launch burden for single- and multi-record non-interactive launches; onboarding depends on it |
| Interactive selection UI: `launcher-selection-ui.ts`, `workspace-launch-ingress`, `-ui-server`, `-ui-command`, `-ui-controller`, `-ui-actions`, `-ui-attempts` | **demote → remove** | the grouping product; superseded by single-agent default and site-level composition |
| UI session/attempt/observation stores: `workspace-launch-session-store`, `-attempt-store`, `-execution-attempt-store`, `-observation`, `-projection`, `-handoff`, `-session`, `-cleanup`, `-attachment` | **demote → remove** | persistence for the grouping product; durable-attempt semantics are not carried by any other consumer |
| `workspace-launch-recovery` (`launcher workspace-recover`) | **demote → remove** | recovers grouping sessions; single-agent failures are re-launched, not recovered |
| `workspace-launch-selection`, `-selection-adapters`, `-application-selection` | **demote → remove** | interactive/filter selection for grouping; non-interactive filters (`--agent`, `--site`, `--role`, `--all`) stay in the core |
| `packages/workspace-launch-contract`, `packages/workspace-launch-ui` | **demote → remove** | consumed only by the grouping product and its console page |
| Console `/console/launch` sessions dashboard + `GET /console/launch/api/sessions` + session reverse proxy | **replace** | becomes the site runtime view (below) |
| `Start-NaradaWorkspace.ps1` installed asset | **keep, simplify later** | installed on user sites; still the onboarding entry; may shrink to single-agent loop in a later pass |

### Site-level launch contract (target for #2039)

- **Command**: `narada sites launch <site-id> [--dry-run] [--format json]`.
- **Ensure semantics** (idempotent, plan-first): (a) resolve site root from the
  site registry; (b) ensure bound MCP surfaces/config materialization is
  current (read-only check, report drift); (c) ensure resident carrier posture
  via the existing site CLI (`resident` family) when the site declares one;
  (d) ensure site loop scheduler posture per site declaration; (e) report the
  console URL.
- **Console action**: per-site "launch / ensure" action in the operator console
  (registry or site view) calling the same ensure path.
- **Non-goals**: no new selection/session/recovery subsystem; no live launch
  authority in the console beyond the agreed ensure action; no change to the
  `.psd1` registry format; no change to `Narada-{site}-Daemon` scheduler
  semantics.

### Console disposition (decided)

`/console/launch` is replaced by a **site runtime posture view**: sites with
their readiness/resident/loop posture and a per-site launch/ensure action. The
CLI-session handoff panel and launcher-session reverse proxy are removed with
the grouping product (#2040). The route path may be retained as a redirect to
avoid breaking bookmarks.

## Burden accounting (summary)

| Dimension | Before | After | Direction |
|---|---|---|---|
| Launch shapes an operator must reason about | 3+ (single, group-interactive, site-via-other-tools) | 2 (single agent; site) | improved |
| Launcher-only packages | 4 | 2 (`process-launch-posture`, `launch-process-ownership` — both repo-wide in fact) | improved |
| CLI launcher LOC (approx.) | ~7,900 in commands + ~2,200 in two launcher-only packages | planning core only (est. ~2,500–3,500) | improved |
| Boot-time fleet bring-up | onboarding → workspace-launch | unchanged (same non-interactive path) | unchanged |
| Site composition | scattered (site CLI, scheduler, manual) | one ensure entry point | improved |

## Displacement audit (summary)

- **Operation**: boot-time ritual preserved via the same onboarding path; no
  new operator memorization — single-agent and site launch are fewer concepts,
  not relocated ones. `eliminated`.
- **Runtime failure handling**: grouping-session recovery removed; failure
  handling for single-agent launches is re-launch (idempotent primitive), for
  sites the existing resident/loop recovery. No burden moved into operator
  memory. `reduced`.
- **Migration**: interactive selection-UI sessions in flight at demotion time
  are simply closed; stores are per-machine runtime state, not authority.
  `reduced`.
- **Governance / hidden policy**: this record plus AGENTS.md updates carry the
  rationale; no undocumented convention introduced. `eliminated`.

## Migration constraints

- `agent-cli` PowerShell stack and narada TS stack share one
  `config/launch/agents.psd1` registry — the format is unchanged.
- `narada onboarding start` drives `workspaceLaunchCommand`; the
  non-interactive core must keep working through the demotion.
- Removal steps land in small reviewable slices (#2040), deprecated-first:
  command help and docs mark the grouping entry points deprecated before any
  file deletion.

## Re-derivation check

From the preservation context (single-agent primitive exists; sites already
compose their own runtime; grouping composes with nothing), a future reader
should not predictably reintroduce an interactive grouping product: the two
supported shapes cover the observed needs, and any new composition requirement
attaches to the site manifest, not to a selection engine.

## Status updates

**2026-07-18 (post-implementation review, task #2042).** An honest accounting
against this record after tasks #2039/#2040 landed and were critically
reviewed:

- Task #2040 delivered the **deprecated-first labeling slice only**: CLI help
  text, docs, the `/console/launch` page rework, and (after #2042)
  `Deprecation` headers on the grouping-era endpoints. The interactive
  grouping stack itself — selection UI, session/attempt/observation stores,
  recovery, `workspace-launch-ui`/`-contract` packages, and the console
  session API + reverse proxy — is **still present and functional**. Physical
  removal is tracked as task #2041 using the verdict table above as its
  checklist.
- The **Burden accounting "After" column is target state**, achieved only when
  #2041 completes; it did not describe the repository as of #2040.
- The "Console disposition" section's removal of the sessions dashboard and
  reverse proxy is likewise deferred to #2041; until then both endpoints
  remain live and carry `Deprecation: true` / `Warning: 299` headers.
- The #2039 ensure primitive intentionally reuses the `site-loop recover`
  idiom (`loop run <id> --once --ensure-resident`): one bounded site-loop pass
  that ensures the resident, not a narrow carrier-only ensure. Callers
  (CLI text and console confirm) label it as such.
- If site ensures prove slow in practice, the console action should move to a
  202 + job-polling pattern; the current async-exec form keeps the server
  responsive but the request open for the ensure's duration.

**2026-07-18 (physical removal, task #2041).** The grouping stack was
physically removed: 24 `workspace-launch-*` grouping modules, 8 grouping unit
tests, 2 grouping e2e files, the `workspace-launch-contract` and
`workspace-launch-ui` packages, the console session API + reverse proxy, and
the interactive/grouping CLI flags (`--interactive-selection*`,
`--default-interactive-selection`, `--launcher-ui-port*`, `--launcher-output`)
plus `narada launcher workspace-recover`. Verified: CLI `tsc --noEmit` clean,
operator-console-ui `vue-tsc` clean, 87/87 focused CLI vitest, 17/17
operator-router tests, 3/3 ui consumer-contract tests, CLI full build, and a
live smoke (`/console/launch` 200, `/console/launch/api/sessions` and the
session proxy 404, registry API 200, site launch dry-run 200 plan-only,
`launcher workspace-plan --agent narada.architect --dry-run` OK).

Deviation log (where #2041 departed from the verdict table above):

- **`workspace-launch-attachment.ts` was KEPT** (table said demote → remove):
  it is the hidden-runtime session health verification used by the surviving
  executor path and imports only `@narada2/nars-session-core/session-index`
  plus launcher types — not grouping machinery.
- **Result-schema contraction deferred, then completed**: `interactive_selection` /
  `interactive_selection_surface` were initially kept in plan and failure result
  schemas as constant `false` / `null`. They were removed outright as a fast
  follow-up on 2026-07-18 after a consumer audit showed no typed, scripted, or
  test reader depended on them.
- **`Start-NaradaWorkspace.ps1` could not wait for "simplify later"**: both the
  repo asset and the installed User Site copy
  (`C:\Users\Andrey\Narada\Start-NaradaWorkspace.ps1`) passed removed CLI flags
  on every invocation (`--default-interactive-selection` unconditionally), so
  both were stripped in this change. The installed copy was edited in place
  (machine-local, outside the repo) because the launcher acceptance e2e drives
  it.
- **E2E re-anchors**: the `operator-console-ui-e2e` launcher-sessions test was
  replaced with a Site Runtime render test; the interactive-launcher segment
  (169 lines) was removed from `operator-journey-acceptance-e2e` along with its
  now-dead helpers; `operator-launch-router-e2e` and
  `workspace-selection-ui-e2e` were deleted outright;
  `operator-launch-journey` (non-interactive, drives the installed ps1) is the
  surviving launcher acceptance layer.
- **No contract-type relocation was needed**: after surgery zero kept files
  imported `@narada2/workspace-launch-contract`, so the package was deleted
  outright. `packages/ui/test/consumer-contract.test.mjs` dropped its
  `workspace-launch-ui` consumer entry.
- **Unrelated build repair in the same change**: `operator-router/src/server.ts`
  had a pre-existing TS1016 at HEAD (optional `activeSockets?` before required
  parameters, introduced by f85a3616 and masked by incremental build state).
  Fixed minimally (parameter made required; its only caller always passes it)
  because it blocked the CLI prebuild chain.
