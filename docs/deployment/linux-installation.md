# Linux Installation And First Use

This is the canonical operator contract for installing Narada on native Linux.
It is separate from the Linux Site materialization contract: installation makes
the Narada CLI/runtime available; Site bootstrap creates the authority locus
where a Site runs.

## Support Matrix

| Path | Status | Use |
| --- | --- | --- |
| Published `@narada2/cli` through npm or pnpm | Supported | Normal installation on a developer machine or server |
| Narada repository checkout with `pnpm install` and a local build | Supported for development | Working on Narada itself |
| `linux-user` Site | Supported target | Personal workstation or non-root user service |
| `linux-system` Site | Supported target | Headless machine or system service |
| WSL | Separate substrate | Use `wsl_native`/`windows-wsl` semantics; do not report it as native Linux |
| deb/rpm/pacman packages | Deferred | No package-manager-specific contract is promised yet |
| Container-hosted Site | Deferred | Requires a separate container substrate contract |

## Prerequisites

- Linux with a supported Node.js release, currently `>=22.0.0`.
- npm or pnpm for the published CLI path, or Git and pnpm for a repository checkout.
- `systemd --user` for unattended `linux-user` supervision, or system systemd
  privileges for `linux-system` supervision.
- A Site-authorized credential source for any provider or external capability
  used by the Site. Installation never stores or prints raw credentials.

Node provisioning is a host responsibility. Narada must detect an unsupported
or missing Node runtime and provide an actionable remediation; it must not
silently install a second Node runtime into a Site.

## Published CLI Installation

```bash
npm install -g @narada2/cli
# or:
pnpm add -g @narada2/cli

narada --help
narada --version
```

The published package is the canonical release artifact. A successful install
must include the CLI entrypoint, Linux Site adapter, runtime-server assets,
operator-surface assets, and all runtime dependencies. Workspace-only imports
or ignored local `dist/` directories are publication failures.

## Repository Checkout

This path is for Narada development, not ordinary operators:

```bash
git clone https://github.com/andrey-kokoev/narada.git
cd narada
corepack enable
pnpm install
pnpm --filter @narada2/cli build
pnpm exec narada --help
```

The checkout path must not be represented as a production installation. Its
result depends on the local workspace and should be reported as development
mode.

## Create A Linux Site

Choose exactly one authority mode:

```bash
# Personal user Site; no root privilege required.
narada sites init personal --substrate linux-user

# System Site; requires the permissions needed for the selected root.
narada sites init production --substrate linux-system
```

Use `--dry-run` before mutation. The resulting plan must state the substrate,
authority locus, executor runtime, target root, path policy, permission
posture, and mutation-evidence location.

Canonical roots are:

- `linux-user`: `${XDG_DATA_HOME:-$HOME/.local/share}/narada/<site-id>`
- `linux-system`: `/var/lib/narada/<site-id>`

The Site owns its config, SQLite state, traces, logs, runtime artifacts, and
supervisor declarations. Installation does not make the global npm directory
the Site root.

## Enable Unattended Operation

```bash
narada sites enable personal
systemctl --user enable narada-site-personal.timer
systemctl --user start narada-site-personal.timer

narada sites enable production
systemctl enable narada-site-production.timer
systemctl start narada-site-production.timer
```

`linux-user` uses `systemctl --user`; `linux-system` uses system
`systemctl`. If systemd is unavailable, Narada must either use the explicitly
documented fallback or refuse with a repair command. It must not claim that a
Site is enabled merely because unit files were written.

The supervisor result is explicit: unit-file registration is reported as
`planned`, activation is a separate lifecycle operation, and an unavailable
user session or insufficient system privilege is reported as `refused`. The
CLI may plan or apply these operations through the same boundary:

```bash
narada sites supervisor personal status --dry-run
narada sites supervisor personal enable --apply
narada sites supervisor personal start --apply
narada sites supervisor personal stop --apply
narada sites supervisor personal disable --apply
```

Unregistering removes only Narada supervisor declarations and preserves the
Site root, SQLite state, traces, logs, and evidence. A Linux user Site without
usable systemd falls back to a generated cron entry; a Linux system Site
refuses rather than silently installing a privileged substitute.

## Credential And Provider Readiness

Provider readiness is checked before provider execution. The readiness result
contains the provider, mode, credential kind, source provenance, and a
redacted remediation; it never contains the resolved secret. Resolution
precedence is:

- system mode: systemd credentials, environment, Site `.env`, config fallback;
- user mode: Secret Service, `pass`, environment, Site `.env`, config fallback.

The Linux adapter distinguishes `ready`, `missing`, `malformed`, and
`unavailable`. Missing or malformed credentials stop before provider execution
and identify the admitted environment variable or store to repair. Endpoint
availability is an explicit readiness check and is never inferred from the
presence of a credential.

Inspect readiness and evidence with:

```bash
narada sites doctor personal --kind linux-user
narada sites list
journalctl --user -u narada-site-personal.service
```

## First Resident Use

The Linux first-use path is CLI-owned and does not require PowerShell:

```bash
narada onboarding start --platform linux --scope user-site --interactive
```

It creates or discovers one User Site, starts one `resident` agent, and opens
the admitted operator surface. Site intelligence catalog policy owns provider,
model, endpoint, credential, and thinking-level resolution; the installer and
launcher do not select those values independently.

The default path is single Site, single resident role, and one operator
surface. Multi-Site or multi-role launch requires explicit opt-in.

## Maintenance Boundary

Upgrade, uninstall, rollback, and schema migration are separate lifecycle
operations:

- upgrading the CLI must preserve Site state and identity;
- uninstalling the package must not delete Site data by default;
- disabling a supervisor must not remove Site state;
- migrations must record version and evidence before changing durable state;
- rollback must state its data-compatibility boundary.

The Linux lifecycle coordinator exposes the plan/apply boundary explicitly:

```bash
# Inspect first; this does not change the Site.
narada install linux-lifecycle upgrade \
  --site-id personal --site-root "$HOME/.local/share/narada/personal" \
  --mode user --target-version 0.2.0 --supervisor-registered

# Persist the Site-owned receipt after the package/supervisor boundary is ready.
narada install linux-lifecycle upgrade \
  --site-id personal --site-root "$HOME/.local/share/narada/personal" \
  --mode user --target-version 0.2.0 --supervisor-registered --apply

narada install linux-lifecycle uninstall \
  --site-id personal --site-root "$HOME/.local/share/narada/personal" \
  --mode user --supervisor-registered --apply

narada install linux-lifecycle rollback \
  --site-id personal --site-root "$HOME/.local/share/narada/personal" \
  --mode user --rollback-to 0.1.0 --apply

narada install linux-lifecycle migrate \
  --site-id personal --site-root "$HOME/.local/share/narada/personal" \
  --mode user --target-schema-version 2 \
  --migration-artifact task://migration/2 --apply
```

The command records `runtime/installation/linux-installation-state.json` and
an immutable lifecycle receipt under `runtime/installation/lifecycle/`. The
package-manager operation and supervisor operation remain named handoffs in
the plan; a Site receipt never pretends that either external mutation happened.
Uninstall preserves Site data by default. A request to remove data is refused
by this path and must be implemented as a separately guarded destructive
operation; `--apply` cannot turn it into an accidental delete.

## Verification Ladder

After installation, the minimum proof is:

```bash
narada --version
narada sites init personal --substrate linux-user --dry-run
narada sites doctor personal --kind linux-user
narada onboarding start --platform linux --scope user-site --no-exec
```

The clean-environment E2E path must additionally prove package contents,
Site creation, supervisor registration, provider readiness, runtime health,
event replay, operator-surface attachment, and refusal/recovery behavior.

## Executable E2E Matrix And Release Gate

The canonical executable gate is owned by the CLI package and uses a
controlled fixture for host-sensitive Linux contracts. It never calls a real
provider or mutates an external supervisor:

```bash
pnpm --filter @narada2/cli run test:linux-installation-e2e
```

The gate composes these proofs:

| Boundary | Proof | Substrate |
| --- | --- | --- |
| Source checkout | `clean-install-onboarding.test.ts` and the Linux contract fixture | Controlled fixture; Windows-only published User Site assertions remain labeled Windows |
| Published artifact | `test:publication-boundary` and publication-admission asset checks | Tarball boundary when explicitly enabled |
| Linux user/system | Lifecycle plan/apply, Site materialization, supervisor fallback/refusal | Controlled fixture; no claim of native systemd parity |
| Provider readiness | Redacted `ready`, `missing`, `malformed`, and `unavailable` states | Controlled fixture; no provider calls |
| Runtime first use | Health, event replay, artifact access, and Web UI attachment | Synthetic authority runtime with Playwright |
| Refusal/recovery | Unsupported Node contract, missing systemd, insufficient privilege, missing credentials, stale/ambiguous sessions, partial installation | Controlled negative fixtures |

The gate emits `narada.linux.installation.e2e_gate.v1` and always labels its
execution substrate as `native_linux`, `wsl`, or `controlled_fixture`. WSL is
not accepted as native Linux. Native Linux CI must set the explicit guard:

```bash
NARADA_REQUIRE_NATIVE_LINUX_E2E=1 pnpm --filter @narada2/cli run test:linux-installation-e2e
```

The CLI `prepublishOnly` hook runs the Linux gate after publication admission;
a publish cannot proceed when the Linux package, bundled runtime/UI assets,
first-use journey, or gate contract is missing. Native Linux CI supplies the
stronger host gate without turning Windows-only or WSL-only results into a
native-Linux claim.

The repository's dispatch-only native CI entrypoint is
`.github/workflows/native-linux-installation.yml`. It runs on a GitHub-hosted
`ubuntu-24.04` machine, checks out the sibling repositories required by the
development workspace, enables `NARADA_REQUIRE_NATIVE_LINUX_E2E=1`, and uploads
host/source and post-run evidence. It does not call a real intelligence
provider or require provider credentials.

From a checkout with GitHub CLI authentication, dispatch and observe it with:

```bash
gh workflow run native-linux-installation.yml --repo andrey-kokoev/narada --ref main
gh run list --repo andrey-kokoev/narada --workflow native-linux-installation.yml --limit 1
gh run watch <run-id> --repo andrey-kokoev/narada --exit-status
gh run download <run-id> --repo andrey-kokoev/narada --name native-linux-installation-evidence-<run-id>
```

A successful run is evidence for the native Linux host gate only when the
workflow's explicit substrate guard passes; Docker, WSL, and a hosted
container are not substitutes for this proof.

## Troubleshooting And Recovery

Use the first failing evidence rather than retrying blindly:

| Symptom | Check | Recovery |
| --- | --- | --- |
| `node_engine` failure | `node --version` and `narada doctor --bootstrap --format json` | Install Node.js 22 or newer, then rerun the gate |
| Missing systemd or user session | `narada sites supervisor <site-id> status --dry-run` | Start the user systemd session or accept the documented user cron fallback; system scope requires root |
| Provider `missing`/`malformed`/`unavailable` | `narada sites doctor <site-id> --kind linux-user` | Bind the named secret through the admitted store and verify the endpoint; raw values are never evidence |
| Stale or ambiguous session | `narada agent-web-ui attach --agent <site-agent> --site-root <site-root> --diagnose` | Start a fresh runtime or pass the exact current launch binding/session; do not attach an older candidate |
| Partial lifecycle receipt | Read `runtime/installation/lifecycle/<operation-id>.json` and `runtime/installation/linux-installation-state.json` | Repair the failed handoff, then rerun the same plan; Site data remains preserved |

The same runbook governs source checkout, published installation, upgrade,
uninstall, rollback, and recovery. WSL-specific instructions may explain the
substrate boundary, but must not create a competing installation contract.
