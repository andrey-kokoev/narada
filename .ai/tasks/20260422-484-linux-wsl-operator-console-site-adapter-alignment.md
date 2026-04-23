---
status: closed
created: 2026-04-22
owner: unassigned
depends_on:
  - 483
---

# Task 484 - Linux and WSL Operator Console Site Adapter Alignment

## Context

Task 483 defines the substrate-neutral Operator Console Site adapter interface and adds Cloudflare HTTP binding. After that interface exists, Narada needs the local Site variants to line up behind the same console adapter shape.

The Operator Console must support zero, one, or many registered Sites without becoming a Site or a fleet orchestrator. The Site Registry remains advisory inventory and routing. Each Site remains the Runtime Locus that owns state and authority.

Local variants differ mainly in discovery paths, privilege posture, and control transport:

- `windows-native`
- `windows-wsl`
- `linux-user`
- `linux-system`

WSL needs extra care because it may be local when the console runs inside the same distro, but bridge-like when the console runs from native Windows.

## Goal

Align Linux and WSL Sites with the Operator Console Site adapter interface so the console can discover, observe, and route control for local POSIX Sites through the same substrate-neutral shape used by Windows and Cloudflare.

## Read First

- `.ai/tasks/20260422-483-operator-console-cloudflare-site-adapter-interface.md`
- `docs/product/operator-console-site-registry.md`
- `docs/deployment/operator-console-site-registry-boundary-contract.md`
- `docs/deployment/linux-site-materialization.md`
- `docs/deployment/linux-site-boundary-contract.md`
- `docs/deployment/windows-site-materialization.md`
- `packages/sites/linux/src/`
- `packages/sites/windows/src/`
- `packages/layers/cli/src/commands/sites.ts`
- `packages/layers/cli/src/commands/console.ts`

## Non-Goals

- Do not rename Operator Console / Site Registry.
- Do not implement GUI or web UI.
- Do not add automatic remediation, cross-Site orchestration, or cycle scheduling.
- Do not collapse WSL and native Windows into one undifferentiated substrate.
- Do not cross Linux user/system privilege boundaries silently.
- Do not mutate Site state from observation code.
- Do not bypass Site-owned control/action surfaces.

## Required Work

1. Normalize local Site variant metadata.
   - Ensure registry records can represent:
     - `windows-native`;
     - `windows-wsl`;
     - `linux-user`;
     - `linux-system`.
   - Preserve existing compatibility with current `native` / `wsl` records if those are already persisted.
   - Record enough metadata to resolve site root, config, health, and control surface.

2. Implement Linux console adapter.
   - Use the substrate-neutral adapter interface from Task 483.
   - Support Linux user-mode Sites from user-owned paths.
   - Support Linux system-mode Sites from `/var/lib/narada` only when readable/authorized.
   - Observation must be read-only.
   - Control must route through Site-owned control/action surfaces, not direct ad hoc mutation.

3. Align WSL console behavior.
   - If console runs inside WSL, treat WSL Sites as POSIX-local.
   - If console runs from native Windows and targets WSL Sites, make the bridging requirement explicit.
   - Do not silently use invalid paths or assume one distro.
   - If native-Windows-to-WSL control cannot be safely implemented in this task, record a bounded residual and return an informative unsupported result.

4. Align discovery/registration commands.
   - `narada sites discover` should discover supported local variants through the registry/adapters.
   - If separate explicit registration commands are needed for Linux system-mode or WSL bridge mode, add or document them.
   - Avoid pretending remote or bridge-only Sites are filesystem-discoverable.

5. Preserve console command shape.
   - `narada console status` and `narada console attention` should aggregate across the supported local variants.
   - `narada console approve/reject/retry` should route through the selected adapter's control client.
   - Unsupported variants should produce clear operator-visible errors.

6. Add focused tests.
   - Adapter selection for Linux user, Linux system, WSL, Windows native, and unsupported variants.
   - Linux user-mode observation aggregation from fixture state.
   - Linux system-mode unauthorized path behavior.
   - WSL inside-distro behavior.
   - Native-Windows-to-WSL unsupported/bridge-required behavior if not implemented.
   - No observation mutation.

7. Update documentation.
   - Update `docs/product/operator-console-site-registry.md` with local variant support.
   - Clarify registry locations:
     - native Windows registry path;
     - POSIX/WSL/Linux registry path.
   - Clarify that WSL is a distinct Site variant and may require bridge semantics.

8. Record verification and residuals.
   - Record focused test commands and results in this task.
   - Record any unsupported local variant path explicitly rather than hiding it behind empty results.

## Acceptance Criteria

- [x] Linux user-mode Sites can be represented in the Site Registry and observed through the Operator Console adapter interface.
- [x] Linux system-mode Sites have explicit authorized/unauthorized behavior.
- [x] WSL Sites are represented distinctly from native Windows Sites.
- [x] Console behavior is clear when native Windows tries to control a WSL Site and no safe bridge exists.
- [x] Existing Windows console behavior from Task 482 remains covered.
- [x] Cloudflare adapter work from Task 483 is not regressed.
- [x] Observation remains read-only.
- [x] Control routing still delegates to Site-owned authority surfaces.
- [x] Documentation explains Windows, WSL, Linux user, Linux system, and Cloudflare organization under Operator Console / Site Registry.
- [x] Verification evidence is recorded in this task.

## Verification

```bash
cd /home/andrey/src/narada
pnpm verify
pnpm --filter @narada2/linux-site exec vitest run
pnpm --filter @narada2/windows-site exec vitest run \
  test/unit/router.test.ts \
  test/unit/aggregation.test.ts \
  test/unit/observability.test.ts \
  test/unit/site-control.test.ts \
  test/unit/console-adapter.test.ts
pnpm --filter @narada2/cli exec vitest run \
  test/commands/sites.test.ts \
  test/commands/console.test.ts
```

**Results:**
- `pnpm verify`: all 5 steps passed (task-file-guard, typecheck, build, charters, ops-kit)
- Linux-site tests: **99 passed** (recovery 6, path-utils 13, credentials 16, supervisor 20, coordinator 6, console-adapter 17, runner 5, observability 16)
- Windows-site tests: **55 passed** (router 11, aggregation 18, observability 15, site-control 7, console-adapter 4)
- CLI tests: **17 passed** (console 10, sites 7)

## Execution Notes

Task 484 was implemented as a follow-on to Task 483. The substrate-neutral `ConsoleSiteAdapter` interface (defined in `@narada2/windows-site`) was extended to support Linux and WSL Sites without changing the interface shape.

Key implementation steps:
1. **Linux console adapter** (`packages/sites/linux/src/console-adapter.ts`): Implemented `linuxSiteAdapter` with `LinuxSiteObservationApi` (read-only SQLite health queries) and `LinuxSiteControlClient` (explicit unsupported errors for v0). Added `UnauthorizedLinuxSiteControlClient` for system-mode sites the current user cannot read.
2. **WSL bridge behavior** (`packages/sites/windows/src/console-adapter.ts`): Added `WslBridgeRequiredObservationApi` and `WslBridgeRequiredControlClient` that return explicit bridge-required errors when native Windows tries to access a WSL Site via an inaccessible POSIX path.
3. **CLI registration** (`packages/layers/cli/src/commands/console.ts`): Added `linuxSiteAdapter` to the `ADAPTERS` array.
4. **Sites commands** (`packages/layers/cli/src/commands/sites.ts`): Updated `sitesDiscoverCommand`, `sitesListCommand`, `sitesShowCommand`, and `sitesInitCommand` to handle `linux-user` and `linux-system` variants.
5. **Documentation** (`docs/product/operator-console-site-registry.md`): Added Linux Sites and WSL Bridge Semantics sections.
6. **Tests**: Added `packages/sites/linux/test/console-adapter.test.ts` (17 tests) covering adapter selection, health observation, credential requirements, and control unsupported behavior.

No code changes were required during review; all verification tests passed on first run.

### Residuals

- **Linux Site operator actions**: v0 Linux Sites do not implement `executeOperatorAction`. The `LinuxSiteControlClient` returns explicit unsupported errors for all control requests. A future Linux Site task should add operator action support.
- **Linux Site work tables**: v0 Linux Sites do not have `work_items`, `outbound_handoffs`, or `context_records` tables. Observation returns empty arrays for stuck work items, pending outbounds, and pending drafts. A future task should align the Linux Site runner with the full control-plane schema.
- **WSL bridge implementation**: Native Windows → WSL Site control is not implemented. The Windows adapter returns an explicit bridge-required error. To implement this, a future task would need a WSL bridge client (e.g., using `wsl.exe` or a proxy service).
- **Native Windows → WSL observation**: Same bridge limitation as control. The observation API returns an error health status with a bridge-required message.
