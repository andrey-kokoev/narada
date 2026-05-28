# Narada MCP Facade

Narada MCP is a typed agent-facing facade over Narada's canonical application services.

It is not a second authority surface. MCP tools must delegate to the same command/service functions used by CLI operators, return the same canonical identifiers, and preserve mutation evidence whenever a tool mutates durable state.

In the [`Operator Surface`](operator-surface.md) topology, an MCP facade is usually a non-spatial `ControlChannel` and may be presented through an Operator Surface such as a console. The facade, channel, and presentation surface remain separate from the target Site authority locus.

This facade participates in the scale-recursive topology described by the external concept note [`Scale-Relative Operation Topology`](../../../thoughts/content/concepts/scale-relative-operation-topology.md): MCP fabric is a governed traversal medium, while each addressed Site remains the local authority locus.

A Site may expose zero, one, or many MCP surfaces. A surface is not identified by the mere presence of an MCP server. It must be typed by:

- **purpose**: inbox intake, command execution, task inspection, Site doctor, fabric traversal, or another declared function;
- **authority boundary**: which Site admits consequence and which crossing regime governs mutation;
- **runtime embodiment**: the process, host, shell, container, stdio channel, HTTP adapter, or client profile that presents the surface.

The compact rule:

```text
MCP surface presence does not imply authority.
Typed capability announcement plus target Site admission decides what can happen.
```

## Boundary

| Layer | Role |
|------|------|
| CLI | Durable operator/admin surface and shell-facing command grammar. |
| MCP | Typed protocol facade for agents and tools that need schemas instead of shell construction. |
| Application services | Canonical implementation of task, inbox, Site, routing, and execution behavior. |
| Stores/evidence | Authority-bearing state and replayable mutation evidence. |

MCP may improve ergonomics. It may not bypass approval, lifecycle, evidence, or crossing regimes.

## Typed Surfaces

Narada MCP surfaces are typed protocol surfaces. A single process may serve multiple typed surfaces, or a runtime may launch separate MCP servers for different purposes. The type declaration is the authority-relevant fact, not the process count.

Initial typed surfaces:

| Surface type | Purpose | Authority posture |
|--------------|---------|-------------------|
| `inbox_mcp` | Submit, inspect, and route Canonical Inbox envelopes. | Admits inert messages or proposals into the target Site inbox authority only. |
| `ee_mcp` | Request bounded execution through a declared runtime embodiment. | Requests embodied execution through CEIZ or equivalent command-execution law; does not execute by transport alone. |
| `site_context_mcp` | Inspect Site identity, readiness, doctor posture, routing, and fabric context. | Read-only unless a specific typed mutation capability is declared separately. |

The anti-collapse rule:

```text
Inbox MCP admits messages.
EE-MCP requests embodied execution.
Target Site authority admits consequence.
```

Inbox MCP and EE-MCP may be useful together, but they are not the same surface. Inbox MCP is governance intake. EE-MCP is a command-execution request channel. Neither bypasses target Site admission.

## Inbox MCP

Inbox MCP is the smallest governance-oriented MCP surface.

Its initial capability set should be limited to:

| Capability | Posture |
|------------|---------|
| `site_context` | Read-only Site identity and authority posture. |
| `inbox_doctor` | Read-only readiness and schema inspection. |
| `inbox_list` | Bounded read-only envelope listing. |
| `inbox_show` | Bounded read-only envelope inspection. |
| `inbox_work_next` | Read-only by default; claim/pending/archive only when explicitly exposed and routed through canonical inbox commands. |
| `inbox_submit_observation` | Mutating inert envelope submission with read-back confirmation and mutation evidence. |
| `inbox_schema` | Read-only schema/capability inspection for clients. |

Inbox MCP does not create tasks, approve effects, run commands, or decide inbox promotion by implication. It submits or inspects envelopes under the target Site's [`Canonical Inbox`](canonical-inbox.md) and message-routing law.

Tests for Inbox MCP should preserve the same boundary. Protocol tests exercise stdio framing, tool discovery, dry-run delegation, schema/refusal behavior, and read-back shape without mutating a live inbox. Dogfood tests are separate live sender flows; they must be named and invoked as mutating evidence because they create real envelopes in the target Site.

## Embodiment Execution MCP

Embodiment Execution MCP, abbreviated **EE-MCP**, is a bounded execution surface for a declared runtime embodiment such as `windows-pwsh`, `wsl-bash`, `linux-systemd`, `container-shell`, or a hosted sandbox.

An EE-MCP surface must declare:

| Field | Requirement |
|-------|-------------|
| `embodiment_id` | Stable local runtime embodiment name. |
| `runtime_locus` | User Site, PC Site, Project Site, or other Site that owns process launch and supervision. |
| `command_classes` | Allowed classes such as read-only inspection, test execution, build, formatter, or explicitly approved mutation. |
| `cwd_policy` | Allowed working directories and target Site/locus mapping. |
| `environment_policy` | Inherited, redacted, pinned, or capability-mediated environment. |
| `timeout_policy` | Default and maximum timeout. |
| `output_admission` | Digest, bounded excerpt, artifact path, or raw opt-in policy. |
| `authority_posture` | CEIZ, TIZ, publication, or other governed command-execution law. |
| `evidence_logging` | Durable command-run, verification-run, or command-execution-intent trace. |

EE-MCP must route command requests through the [`Command Execution Intent Zone`](command-execution-intent-zone.md) or a stricter equivalent. A tool call such as `ee_run` is only a request into the execution law. It is not permission to run arbitrary shell text.

### WSL-to-Windows EE-MCP

The WSL-to-Windows adapter is named `ee-mcp.windows-powershell-from-wsl`.

Its v0 command id grammar is intentionally narrow:

```text
windows-pwsh.readonly.<name>
```

Raw `powershell.exe`, `pwsh.exe`, or `cmd.exe` invocation from WSL is not a valid adapter call. The Narada MCP facade exposes:

| Tool | Purpose |
|------|---------|
| `narada_ee_mcp_doctor` | Read-only readiness and refusal-posture inspection for the adapter. |
| `narada_ee_run` | Request execution of an admitted command id; refuses by default when no sanctioned adapter config exists. |

Without an admitted adapter config at `.ai/ee-mcp/windows-powershell-from-wsl.json`, the posture is `planned_missing_capability` and `narada_ee_run` must return `execution_attempted: false`. When configured, each command id must map to an explicit `argv` and `read_only` command class, and execution routes through CEIZ with bounded output admission.

## Runtime Locus Policy

MCP process launch and supervision belongs to the execution-machine Site: commonly a User Site, PC Site, Project Site, or sandbox-owning Site. The target Site owns admission and consequence.

The execution-machine Site is the Site that can actually launch, stop, observe, and health-check the MCP process or client profile. On a Windows workstation that is normally the Windows User Site or PC Site. Narada proper may define `narada-mcp` and the target Site may expose a facade contract, but neither fact makes every target Site responsible for running a persistent MCP daemon.

Examples:

| Question | Owning locus |
|----------|--------------|
| Which process launches `narada-mcp`? | Execution-machine User/PC/runtime Site. |
| Which Site receives an inbox envelope? | Target Site inbox authority. |
| Which policy admits a command consequence? | Target Site command-execution law, possibly mediated by the execution-machine Site. |
| Which trace proves what happened? | Target Site evidence plus execution-machine command trace when execution crossed loci. |

This preserves [`Site Governance Coordinates`](../product/site-governance-coordinates.md): current shell, MCP process, client config, and convenience path are embodiments. They do not become authority loci by being live.

## Initial Surface

The v0 server is exposed as:

```bash
narada-mcp
```

For Site-scoped use, pass an explicit Site root:

```bash
narada-mcp --site-root /path/to/site
narada mcp serve --site-root /path/to/site
```

It speaks JSON-RPC over stdio and implements:

- `initialize`
- `tools/list`
- `tools/call`

Initial tools:

| Tool | Authority posture |
|------|-------------------|
| `narada_site_context` | Read-only inspection of the Site identity and authority posture scoping this MCP facade. |
| `narada_inbox_doctor` | Read-only readiness inspection. |
| `narada_inbox_work_next` | Read-only by default; `claim=true` performs the same claim transition as the inbox command. |
| `narada_task_work_next` | Read-only task discovery by default; `claim=true` delegates to the canonical task work-next command and may claim/pull work. |
| `narada_inbox_list` | Read-only inbox inspection. |
| `narada_inbox_show` | Read-only envelope inspection. |
| `narada_inbox_submit_observation` | Mutating inbox submission with read-back confirmation and canonical mutation evidence. |

## Agent Tool Discovery

An agent only sees Narada MCP tools when its MCP client configuration launches `narada-mcp`. Tool discovery does not happen merely because the repository contains the binary.

Minimum client configuration shape for an Inbox MCP surface:

```json
{
  "mcpServers": {
    "narada-inbox": {
      "command": "narada-mcp",
      "args": ["--site-root", "/home/andrey/src/narada", "--surface", "inbox"]
    }
  }
}
```

For a contained Project Site, target the contained Site root rather than the visible project root:

```json
{
  "mcpServers": {
    "project-site": {
      "command": "narada-mcp",
      "args": ["--site-root", "/path/to/project/.narada"]
    }
  }
}
```

If the client cannot resolve `narada-mcp`, use the repo-local binary path or install the root `narada` shim first:

```json
{
  "mcpServers": {
    "narada-inbox": {
      "command": "/home/andrey/src/narada/node_modules/.bin/narada-mcp",
      "args": ["--site-root", "/home/andrey/src/narada", "--surface", "inbox"]
    }
  }
}
```

In this repository, `pnpm run narada:install-shim` installs both shell shims:

```bash
narada
narada-mcp
```

The local Narada proper MCP client config artifact is:

```text
.ai/mcp/narada.mcp.json
```

Example: a Windows User/PC execution-machine Site can launch a Narada proper inbox facade by placing equivalent client configuration in the execution-machine-owned MCP client config, while targeting Narada proper's Site root:

```json
{
  "mcpServers": {
    "narada-proper-inbox": {
      "command": "narada-mcp",
      "args": [
        "--site-root",
        "/home/andrey/src/narada",
        "--site-id",
        "narada",
        "--site-kind",
        "project"
      ]
    }
  }
}
```

In that example the User/PC Site owns process launch, restart, client registration, and health checks. Narada proper owns the facade contract and admits consequences under its task, inbox, evidence, and crossing law.

The expected read-only proof after registration is:

1. Client lists MCP tools.
2. Tool list includes `narada_inbox_submit_observation`, `narada_inbox_work_next`, `narada_task_work_next`, and `narada_inbox_doctor`.
3. `narada_site_context` returns the intended `site_id`, `site_root`, and `authority_posture: "facade_only"`.
4. Capability inspection announces the surface type before clients assume a typed surface exists.

This is configuration of a `ControlChannel`, not authority movement. The MCP facade still delegates to canonical services and mutating inbox tools still create inert envelopes with read-back confirmation and mutation evidence.

Mutating inbox tools also delegate to the same message routing authority decision as CLI. `narada_inbox_submit_observation` accepts `target_locus`; when Site policy refuses `principal + target_locus + envelope_kind + authority_level`, MCP returns the same bounded refusal and writes no envelope.

For the shared CLI/MCP routing law, including local compatibility and
capability-gated cross-Site submission, see
[`Message Routing Authority Posture`](../product/message-routing-authority-posture.md).

## Site Scoping

Every Narada Site may expose its own MCP facade, but that facade is not a new authority owner.

There may be many possible Site-scoped MCP facades. The long-term model is not an unbounded swarm of sovereign servers; it is a governed access fabric that resolves each request to a declared Site before consequence.

There may also be many MCP surfaces for the same Site. That is coherent when the surfaces are typed and capability-announced. It is incoherent when clients infer "this Site has MCP" and then assume inbox, execution, task mutation, and publication capabilities all exist on the same authority footing.

Site-scoped MCP means:

1. The server is launched with a Site root, or resolves one from cwd.
2. `config.json` provides `site_id`, `site_kind`, `site_root`, `workspace_root`, and `locus.authority_locus` when available.
3. `initialize`, `tools/list`, and `narada_site_context` expose the resolved Site context and `authority_posture: facade_only`.
4. Tool calls default to the resolved Site root when the caller does not provide `cwd`.
5. Mutating tools still delegate to the canonical command/service implementation and produce the same evidence as the CLI path.

This allows a User Site, PC Site, Project Site, Client Service Site, or future Site kind to publish an agent-facing protocol surface while preserving the Site's existing authority grammar.

## Role Policy Reconciliation

Narada proper MCP role policy is derived from the MCP surface registry and role-policy projection. Site-local `config.json` is runtime posture: it tells a carrier which tools it may expose for a role, but it is not the implementation source of truth and should not be regenerated wholesale from package state.

Startup and fabric posture surfaces should run read-only MCP policy reconciliation. The check compares:

- expected `mcp.role_policies.architect.servers["narada-proper"].allowed_tools` from the projection;
- configured `allowed_tools` in Site-local `config.json`.

The posture is advisory. It may report `aligned`, `drift`, or `error`, plus exact additions, removals, validation errors, and a repair command. It must not mutate `config.json` during startup or doctor-style inspection.

The repair path is the reconciler, not hand editing or full config generation:

```powershell
narada-proper-mcp --site-root D:\code\narada --reconcile-mcp-policy --apply
```

Apply mode is explicit because it crosses from read-only posture into Site-local runtime config mutation. The reconciler patches only the allowed-tools subtree and records mutation evidence under `.ai/mutation-evidence/mcp_policy/`.

## Capability Announcement

Typed MCP surfaces must be capability-announced and inspectable. A client must not assume a surface exists from a server name, process name, repo path, or installed binary.

Minimum announcement fields:

| Field | Meaning |
|-------|---------|
| `surface_type` | `inbox_mcp`, `ee_mcp`, `site_context_mcp`, or another declared type. |
| `site_id` | Target Site whose policy admits consequence. |
| `site_root` | Local root used by the facade. |
| `runtime_locus` | Runtime embodiment owner when different from target Site. |
| `capabilities` | Declared tools and mutation posture. |
| `authority_posture` | Facade-only, read-only, CEIZ-mediated, inbox-admitted, or other explicit posture. |
| `evidence_policy` | Mutation evidence, command run, verification run, or read-only trace posture. |

This is an application of [`capability-announcement`](capability-announcement.md): capability presence is a governed fact that clients inspect before use.

## Operator Example

A User or PC Site may launch two separate surfaces for Narada:

```json
{
  "mcpServers": {
    "narada-inbox": {
      "command": "narada-mcp",
      "args": ["--site-root", "/home/andrey/src/narada", "--surface", "inbox"]
    },
    "narada-ee-wsl": {
      "command": "narada-mcp",
      "args": [
        "--site-root", "/home/andrey/src/narada",
        "--surface", "ee",
        "--embodiment", "wsl-bash",
        "--runtime-locus", "narada"
      ]
    }
  }
}
```

In that example:

- `narada-inbox` can submit or inspect inert envelopes for the Narada Site.
- `narada-ee-wsl` can request bounded WSL command execution only through the declared command-execution law.
- The User/PC/runtime Site owns process launch and supervision.
- The Narada Site owns inbox admission, command consequence, and evidence requirements.

If implementation is missing for a declared surface type, record a follow-up task. Do not let documentation imply the surface is live by naming it.

## Fabric v1

The first MCP fabric step is read-only governed traversal, not cross-Site mutation.

Fabric v1 adds:

| Surface | Role |
|---------|------|
| `narada_mcp_fabric_context` | Read-only fabric posture and target resolution inspection. |
| `target: { kind: "site", ref: "..." }` | Target Site resolution through the source Site's routing-addressing registry. |
| `target: { kind: "site", site_root: "..." }` | Explicit local proof path for a known Site root. |
| `traversal` response block | Source Site, target Site, route, authority posture, mutation posture, and capability posture. |

Read-only MCP tools may traverse to an explicitly resolved target Site. Mutating cross-Site calls are refused in v1 and return the traversal/capability posture needed to explain why consequence was not admitted.

This preserves the scale-relative topology:

```text
MCP fabric routes.
Target Site admits.
Trace explains.
```

## Expansion Rule

Add MCP tools only when all of these are true:

1. The backing command/service already exists or is introduced in the same change.
2. The tool calls that backing implementation directly.
3. Mutating tools emit the same evidence as CLI.
4. The tool schema preserves dry-run, approval, and execution separation.
5. The tool response includes canonical ids needed for follow-up inspection.

If a desired MCP tool would require inventing new authority behavior, implement that behavior in the canonical service first, then expose it through MCP.
