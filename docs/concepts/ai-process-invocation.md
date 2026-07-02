# AiProcessInvocation

AiProcessInvocation is the first-class Narada boundary for launching a local external AI subprocess. It sits below Carrier and IntelligenceProvider selection and above raw process spawning. Any local Codex process, regardless of which operator-facing projection requested it, must pass through this substrate before a process is created.

## Position

Carrier and IntelligenceProvider are projections over the same lower-level space when they launch local AI processes. They are not independent owners of process policy.

- Carrier projection: a direct local AI operator surface or runtime carrier, for example `Carrier=codex`.
- IntelligenceProvider projection: a provider adapter that shells out to a local AI CLI, for example `codex-subscription` preflight and runtime `codex exec --json` calls.
- Worker projection: delegated worker runtimes that choose Codex as their execution adapter.

All three projections share one admission, lease, evidence, and cleanup interpretation path.

## Object Model

An AiProcessInvocation record contains:

- `schema`: stable schema id, currently `narada.ai_process_invocation.v1`.
- `id`: compact stable id derived from the lease key.
- `key`: full lease key hash.
- `key_parts`: structured lease-key material.
- `adapter_kind`: local AI adapter family, for example `codex`.
- `projection`: the higher-level projection requesting the process, for example `direct-carrier`, `codex-subscription`, or `worker-delegation`.
- `purpose`: why the process is being launched, for example `auth_probe`, `provider_request`, or `worker_run`.
- `site_root`: owning Narada site root.
- `workspace_root` or `cwd`: execution workspace.
- `agent_id`: owning agent identity when available.
- `session_id`: owning NARS/session id when available.
- `thread_id`: optional provider thread id when relevant.
- `command` and `argv`: command shape after resolution but before spawn.
- `env`: redacted environment summary, never raw secrets.
- `policy`: duplicate-admission and cap policy inputs.
- `owner_pid`: process that owns the invocation lease.
- `lease_path`: path to the live lease artifact.
- `artifact_path`: path to the launch/refusal/exit evidence artifact.
- `created_at`, `exited_at`: lifecycle timestamps.

The lease key is built from the identity of the adapter/projection/purpose and the owning execution locus. It must not be a raw process-count heuristic.

## Lifecycle

An invocation moves through these states:

1. `planned`: caller has constructed the invocation request but no admission has occurred.
2. `admitted`: admission acquired a lease and wrote launch evidence; spawning may proceed.
3. `refused`: admission refused before spawn and wrote refusal evidence.
4. `spawned`: process creation returned a child/process-owner handle.
5. `exited`: process completed and exit evidence was written.
6. `released`: live lease was removed or made non-live.

Refusal is a terminal pre-spawn state for that request. It must not create a subprocess.

## Required Callers

These paths must use AiProcessInvocation for local Codex launches:

- direct `Carrier=codex` launches;
- `codex-subscription` auth/preflight probes;
- `codex-subscription` runtime provider requests;
- worker-delegation Codex runtime launches.

A new local AI process path is not complete until it either calls AiProcessInvocation or explicitly proves that it is not an external AI subprocess invocation.

## Non-Goals

AiProcessInvocation is not a Windows Terminal detector, PATH shim, fnm/node wrapper, provider-only guard, launcher-only guard, or postfactum process watchdog. Those can be useful diagnostics or compatibility layers, but they are not the authoritative policy boundary because they sit at the wrong level or see only one projection.

## Operator Interpretation

A refusal artifact means Narada intentionally prevented a process from being spawned. The operator-facing message should show the refusal reason, lease key, existing invocation evidence, and cleanup hint. The normal remediation is to stop or wait for the existing invocation, or use an explicit duplicate override when policy and operator intent permit it.
