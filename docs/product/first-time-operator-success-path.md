# First-Time Operator Success Path

This is the canonical path for a first-time Operator to move from fresh materialization to usable Narada work without documentation spelunking.

The path is deliberately explicit about authority-affecting crossings. Each crossing has a command family that should own the mutation or observation. The User Site onboarding path and the operation-specific path each have one front door; neither front door hides the crossings.

## Choose the Path

If you are a first-time Windows user who wants a personal assistant, go directly to [User-First Windows Onboarding UX](#user-first-windows-onboarding-ux). Its front door is the User Site resident-first path; you do not need to create an ops repo, Project Site, PC Site, or remote Site first.

If you already have a User Site and want to declare or run governed work, use the [Full Operation Path](#full-operation-path). The operation path is intentionally more detailed because it covers intake, Site selection, role binding, work selection, and effect proof.

The related terms have distinct scopes: **Personal User Site onboarding** starts one general assistant; **operation bootstrap** declares governed work; **Site bootstrap** creates an explicit runtime boundary; **cascading onboarding** records readiness layers; and **inhabited onboarding** proves representative operation through a Site.

## Substrate Evidence Boundary

Narada is not a Windows-only product. Its core CLI, documentation, task governance, inbox, and Site concepts are intended to remain portable across supported substrates.

The intensively exercised first-time Operator substrate today is narrower: Windows 11 with WSL, Windows Terminal, PowerShell carrier scripts, local Git, Node tooling, and Windows User/PC Site coordination. The Operator Surface inhabitation path involving stable window labels, focused input, runtime binding, PC-locus messaging, and multi-agent ergonomics has the strongest evidence on that stack. macOS and Linux paths may run core flows, but they do not yet have equivalent evidence for spatial Operator Surface inhabitation.

First-time Operator guidance should therefore point new Operators to the Windows 11 path first when they want the currently proven inhabited-agent experience, while avoiding any claim that Narada itself is Windows-only.

## Success Definition

There are two valid success targets, and the simpler personal target is the default.

### Personal User Site success

A first-time Windows user succeeds when they can:

1. start one healthy User Site `resident` assistant;
2. see successful identity hydration;
3. submit one human operator request;
4. receive a useful or explicit no-work response; and
5. read durable readiness evidence without inspecting raw runtime state.

### Operation success

An Operator taking the operation-specific path succeeds when they can:

1. declare the work Aim as an Operation Specification;
2. materialize or select the Site/runtime locus that will host the work;
3. instantiate a role identity and receive bounded bootstrap text;
4. bind or route the Operator Surface without pretending the surface grants authority;
5. admit first intake through Canonical Inbox or a declared source;
6. ask `work-next` for the next governed action;
7. run one representative loop through readiness proof and trace;
8. see residual blockers and next commands without reading raw SQLite, task files, or full lifecycle snapshots.

## Full Operation Path

This is the complete operation-specific path after the Operator has a User Site and wants to declare or run a particular operation. It is not the default first-time User Site path described below.

| Step | Operator intent | Governed crossing | Command family | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Declare what Narada should do | Operator pressure -> Operation Specification | `narada init`, `narada want-mailbox`, `narada want-workflow` | operation config, preflight result |
| 2 | Choose where it runs | Operation Specification -> Site/runtime locus | `narada sites init`, `narada sites bootstrap-*`, `narada sites doctor` | Site config, Site doctor result |
| 3 | Prove substrate can host work | Site realization -> readiness posture | `narada doctor --bootstrap`, `narada sites doctor`, `narada preflight` | bounded readiness report |
| 4 | Start an AI role | Operator request -> role identity contract | `narada operator-surface agent instantiate`, `narada sites agent-bootstrap` | role identity record, bootstrap text |
| 5 | Bind the surface if possible | role identity -> Operator Surface / runtime binding | `narada operator-surface bind-focused --as self` | binding record or runtime-locus deferral |
| 6 | Admit first input | outside message/file/report -> Canonical Inbox or source facts | `narada inbox submit`, `narada inbox ingest-files`, source-specific sync | inbox envelope or fact admission |
| 7 | Select next work | Site posture -> next governed action | `narada work-next`, `narada task work-next`, `narada inbox work-next` | selected action packet or no-work reason |
| 8 | Execute representative loop | action intent -> Act / Trace | `narada task claim`, `narada test-run`, `narada command-run`, operation commands | reports, verification runs, command runs |
| 9 | Publish readiness | trace -> readiness proof | `narada sites doctor`, `narada task evidence`, `narada publication`, docs artifact | readiness state and residuals |

## Boundary Distinctions

| Boundary | Must not collapse into |
| --- | --- |
| Operation Specification | Site folder, runtime, mailbox, chat request |
| Site/runtime locus | current shell, clone, CLI binary, Operator Surface |
| Role identity | model session, terminal title, task authority |
| Operator Surface binding | effect capability, review authority, Operator consent |
| Inbox intake | task creation, command execution, truth admission |
| Work-next | autonomous assignment loop, hidden recommendation |
| Readiness proof | green build alone, docs alone, chat confidence |

## Failure Posture

Failures must return bounded repair commands instead of pushing the Operator toward raw state inspection.

| Failure | Bounded posture | Preferred command |
| --- | --- | --- |
| Missing dependencies or stale CLI dist | Report bootstrap readiness, shim source, dist freshness, package build posture, and repair plan. Stale dist warns by default and only blocks governance commands under explicit strict mode. | `narada doctor --bootstrap --format json`; strict: `narada doctor --bootstrap --strict --format json` |
| Missing native SQLite binding | Report delegated CLI/native binding health | `narada inbox doctor --format json` or `narada doctor --bootstrap --format json` |
| Stale clone or embodiment mismatch | Name authority locus and clone posture | `narada task preflight --format json`, `narada inbox doctor --format json` |
| Absent Operator Surface transport | Return runtime-locus deferral, not guessed handles | `narada operator-surface bind-focused --as self` |
| No admitted work | Return no-work reason with blockers | `narada task workboard --format json`, `narada work-next --format json` |
| Deferred dependency | Require explicit unblock evidence | `narada task unblock <n> --agent <id> --evidence <text> --rationale <text>` |

## Operation-Specific Front Door

For an already selected Site and Operation, the operation-specific front door is:

```bash
narada operator start --site <site-id-or-root> --operation <operation-id> --format json
```

The command is the orchestrated guide over the crossings above. It is read-only by default and must not become a hidden authority shortcut. Its output is bounded:

- current Site and Operation coordinates;
- missing prerequisite checks;
- exact next command;
- bootstrap text or Operator Surface handoff when appropriate;
- readiness proof or residual blockers.

Focused verification:

```bash
pnpm --dir packages/layers/cli exec vitest run test/commands/operator.test.ts --pool=forks --no-file-parallelism --maxWorkers=1 --minWorkers=1 --testTimeout=120000 --hookTimeout=120000
```

Observed result for the onboarding proof: the fixture walks from an absent Site to a configured Site with missing role binding, then to a fully idle Site with a bound architect identity. It asserts bounded JSON fields, explicit blockers, precise unblock commands, governance coordinates, and final next-work guidance.

## User-First Windows Onboarding UX

Status: target UX contract with the CLI first slice and User Site browser onboarding composition implemented. The PowerShell handoff, resident-first launch, deterministic defaults, demo fallback, and NARS-backed first-use status projection exist; explicit roster materialization remains a separate governed crossing.

The default path is User Site first. A first-time user should become productive without creating a Project Site, naming a PC Site, registering a remote Site, or understanding the full Site topology.

### Supported Install Boundary

The supported first-time Windows install boundary is the published `@narada2/cli` package. A source checkout is a contributor path and is not required for ordinary User Site use.

Prerequisite: Node.js 22 or newer.

```powershell
npm install --global @narada2/cli
narada install windows-user-site
narada doctor --bootstrap
```

The install command provisions the User Site launch registry, the package-owned PowerShell launcher, and the provider-secret helpers under `%USERPROFILE%\Narada`. `narada doctor --bootstrap` is the bounded readiness check; when repair is needed it returns the single repair command:

```powershell
narada install windows-user-site --repair
```

Provider setup is an explicit branch, not an implicit install side effect:

| Path | Credential posture | Next command |
| --- | --- | --- |
| Demo | No credentials; synthetic data | `narada onboarding start --platform windows --scope user-site --demo` |
| Codex subscription | Local Codex authentication | `codex login`, then `narada doctor --bootstrap` |
| API provider | User Site SecretManagement/SecretStore entry | `Pwsh -File "$env:USERPROFILE\Narada\tools\operator-secrets\Set-NaradaProviderSecret.ps1" -Provider <provider> -InstallModules` |

API provider readiness can be inspected without printing secrets:

```powershell
Pwsh -File "$env:USERPROFILE\Narada\tools\operator-secrets\Test-NaradaProviderSecrets.ps1"
narada doctor --bootstrap
```

The first-use page must preserve these branches and must not imply that a source checkout, a Site-specific MCP file, or an API key is required for the credential-free demo.

### Front Door

Once the CLI is available, the canonical command is:

```powershell
narada onboarding start --platform windows --scope user-site --interactive
```

The one-time PowerShell bootstrapper may install or locate the CLI and create or locate the User Site, then hand off to this command. It must not own onboarding policy, runtime selection, MCP assembly, provider logic, or terminal orchestration.

The installed Windows handoff is equivalent:

```powershell
Pwsh -File "$env:USERPROFILE\Narada\Start-NaradaWorkspace.ps1" -Onboarding
```

`-Onboarding` is the thin bootstrap path. Explicit Site, role, operator-surface, runtime, and provider selection remains on the advanced workspace launcher path.

When the onboarding launch selects the browser surface, the launcher passes an explicit User Site onboarding mode into
Agent Web UI. The browser then shows a compact first-use panel with the resolved workspace, `resident` General assistant,
intelligence, Browser surface, and Resident runtime authority. Before the first request it offers human-facing starter
intents; while a turn is active it shows that the assistant is working; after the first response it explains that resident
is sufficient and offers a prefilled question about optional architect and builder roles. Technical details remain collapsed
and the role prompt remains an operator decision rather than a roster mutation.

The first screen should ask only:

1. `Where do you want to work?` — when only the User Site exists, preselect `Personal workspace` and do not present a Site decision. If other Sites are already known, expose `Choose another workspace` as a secondary action.
2. `Start your assistant?` — primary action: `Start my assistant`. Show `General assistant` with technical role id `resident` as secondary detail.

The screen should show the resolved defaults in a non-interactive summary:

```text
Workspace: Personal workspace
Assistant: General assistant
Surface: Browser (terminal fallback)
Intelligence: Registry default (resolved provider)
Local setup: Ready
```

Runtime host, operator surface, provider, MCP scope, and local execution details are available under `Advanced launch options`; they are not first-time decisions. Every displayed combination must come from the admitted capability matrix.

### Default Resolution

Default resolution is deterministic and visible:

- use the User Site resident identity;
- use the managed local execution host without asking the user to create a named PC Site;
- prefer the best available operator surface, with browser projection first when available and terminal fallback otherwise;
- prefer an already authenticated subscription or configured provider;
- offer demo/no-provider mode when the user has not yet declared live work;
- ask for one provider choice only when no usable default exists.

The local execution host is machine-local infrastructure. It may have a durable PC-locus binding, but that binding is not presented as a required Site choice and never becomes User Site authority. Provider secrets remain in User Site SecretManagement/SecretStore state and never enter Site config, launch artifacts, logs, or chat.

### First Useful Session

The first launch creates exactly one `resident` identity for the selected User Site. The UI uses the human label `General assistant`; `resident` is secondary technical detail.

The onboarding proof is complete only when the user sees:

1. a healthy session;
2. identity hydration succeeded;
3. the input is ready;
4. one operator message was admitted;
5. one useful response or explicit no-work response; and
6. durable readiness or checkpoint evidence.

The first prompt should be human-facing, such as `What would you like to work on?`, not `startup_sequence {}` or an MCP tool name. Technical startup events remain available in diagnostics.

After the Operator sends the first request, the bounded readiness readback is:

```powershell
narada onboarding status --scope user-site
```

The status command correlates the resident launch session binding with the Site-local NARS session index, probes `/health`, and reads a bounded tail of the session `events.jsonl` projection. It reports healthy session, identity hydration evidence from a successful startup tool result, input readiness, an operator-sourced admitted input, and a useful or explicit no-work response. It writes only non-secret readiness evidence to `.narada/runtime/onboarding/user-site-onboarding.json`; it never copies provider output or credentials into that artifact. A legacy state without an exact launch/session binding remains pending until the operator supplies `--session`.

### Contextual Role Expansion

After the first useful interaction, the CLI first slice may recommend role expansion when the current roster has no suitable
planning or implementation role. The recommendation is gated by verified first use and is always an explicit operator choice.
The CLI does not infer a Site policy or silently interpret the user's request as authorization; a surface that has those
additional evidence sources may add them before presenting the same affordance.

The recommendation is a single durable affordance, not a recurring chat interruption:

> You are working in a resident-only workspace. Add planning and implementation roles?

The primary actions are `Add recommended roles`, `Keep resident only`, and `Not now`. The UI may show `Planning (architect)` and `Implementation (builder)` as outcome-first labels. Adding roles always requires explicit Operator confirmation and produces a preview of the roster changes. `Not now` is remembered and suppresses repetition until the user asks for role expansion.

The current CLI approval boundary is explicit and non-destructive:

```powershell
narada onboarding roles approve --scope user-site --confirm
```

It records the Operator's approval and a role preview in the User Site onboarding state, but does not silently mutate the launch registry or start additional roles. Roster materialization remains a separate governed crossing.

The role progression is:

```text
user_site_ready
  -> resident_session_ready
  -> first_work_verified
  -> role_posture_reviewed
  -> optional architect/builder roster expansion
```

### Deferred Expansion

After first-use verification, the user can explicitly expand into:

- a Project Site when work becomes repository-specific;
- a named PC Site when machine-local administration needs a user-visible boundary;
- a remote or Cloudflare Site when authority must move across machines; or
- a scheduled Site when unattended cycles are required.

Each expansion is a separate, explained crossing. None is required for the User Site resident path.

This UX is a projection over the existing launcher and runtime contracts, not a second launcher implementation. The full Site/role/surface/runtime/provider selector remains available as an advanced path for experienced Operators.

## Verification Rule

Verification for this path uses sanctioned read surfaces only:

```bash
narada doctor --bootstrap --format json
narada task preflight --format json
narada sites doctor <site-id-or-root> --format json
narada operator-surface labels build --site <site-id-or-root> --format json
narada operator-surface inspect compact --site <site-id-or-root> --format json
narada task workboard --format json
```

Do not verify first-time Operator readiness by opening `.ai/task-lifecycle.db`, directly reading task projection files, or inspecting full lifecycle snapshots.
