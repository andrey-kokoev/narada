# Narada Shim Posture

The installed `narada` shim is a CLI embodiment readiness gate, not just a shell convenience:

- It executes `packages/layers/cli/dist/main.js`.
- It classifies source/dist posture before delegated execution.
- It reports an explicit readiness state and command class when source files are newer than dist.
- It admits read-only inspection through stale dist when the command class is stable enough to inspect task, chapter, inbox, or principal state.
- It blocks authority-affecting governance mutations and implementation/test commands through stale dist unless an explicit policy admits rebuild or stale-authority mutation.
- It prints the exact repair command instead of silently running stale code.

Readiness states emitted by the shim:

| State | Meaning | Default outcome |
| --- | --- | --- |
| `missing_dist` | The delegated dist entrypoint does not exist. | Block. |
| `stale_dist_read_only_admitted` | Source is newer than dist, but the command is read-only inspection. | Proceed with installed dist. |
| `stale_dist_blocked` | Source is newer than dist and the command is not read-only. | Block. |
| `stale_dist_auto_build_admitted` | Source is newer than dist and explicit auto-build policy is set. | Build, then execute. |
| `stale_dist_auto_build_refused_active_work` | Auto-build was requested, but CLI source is dirty. | Block. |
| `stale_dist_authority_mutation_admitted_by_policy` | A stale authority-affecting governance command was explicitly admitted. | Proceed with installed dist. |

Command classes:

| Class | Examples | Stale-dist default |
| --- | --- | --- |
| `read_only` | `--help`, `--version`, `task read`, `task list`, `task evidence`, `task work-next`, `chapter status`, `inbox doctor`, `inbox show`, `principal status` | Admitted. |
| `authority_mutation` | `task claim`, `task close`, `task report`, `chapter init`, `inbox promote`, `principal add` | Blocked unless explicitly admitted. |
| `implementation` | `sync`, `cycle`, `verify`, `doctor`, `operator-surface send`, and other non-classified commands | Blocked unless auto-build is explicitly admitted. |

For active development, an operator may explicitly opt into rebuild-on-use:

```bash
NARADA_SHIM_AUTO_BUILD=1 narada --help
```

That opt-in is intentionally explicit because it lets a shell command perform a build side effect before executing the CLI. If CLI source or shim files are dirty, auto-build is refused by default because a build would smear over active Builder work. Override only with explicit policy:

```bash
NARADA_SHIM_AUTO_BUILD=1 NARADA_SHIM_AUTO_BUILD_WITH_DIRTY_SOURCE=1 narada --help
```

To admit a stale authority-affecting governance command without rebuilding:

```bash
NARADA_SHIM_ALLOW_STALE_AUTHORITY_MUTATION=1 narada task close 1182 --by builder
```

This is intentionally narrower than the old governance allowlist. It preserves read-only task and doctrine inspection during active Builder work without making stale compiled code an unexamined authority mutation surface.

This posture applies [Authority-Revealing Inversion](../concepts/authority-revealing-inversion.md): the shell shim is an embodiment and carrier projection, not the authority deciding whether stale source is safe. It also applies [Plural Embodiment, Singular Authority](../concepts/plural-embodiment-singular-authority.md): plural shells and clones may inspect when freshness is disclosed, while governed mutations require a fresh or explicitly admitted authority path.

## Delegated Site Invocation

A Site wrapper should not hand-assemble Node, NVM, WSL, or `dist/main.js` paths as an agent-facing repair strategy. The canonical delegated invocation is either:

- the installed `narada` shim available in the target embodiment, or
- a Site-declared wrapper in `package.json` under `narada.delegated_cli_embodiment`.

Example:

```json
{
  "narada": {
    "delegated_cli_embodiment": {
      "command": "./bin/narada-site",
      "cwd": ".",
      "shell": "login",
      "repair_command": "pnpm run narada:install-shim"
    }
  }
}
```

`narada inbox doctor` reads this contract, checks `--version`, classifies failures, and prints the exact repair command. If the delegated embodiment is not loadable, an agent should report that failure and repair command rather than inventing a sampled PATH command.
