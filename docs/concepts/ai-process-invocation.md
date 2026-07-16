# AiProcessInvocation

AiProcessInvocation is the first-class Narada boundary for launching a local external AI subprocess. It sits below Carrier, operator-surface, worker-runtime, and IntelligenceProvider selection, and above raw process spawning. Any local Codex process, regardless of which projection requested it, must pass through this substrate before a process is created.

The purpose of this boundary is admission before side effects. It is the common choke point where Narada can decide whether a local AI subprocess may exist, write redacted evidence, acquire a live lease, and return an operator-readable refusal before a duplicate process is spawned.

## Position

Carrier, operator surface, worker runtime, and IntelligenceProvider are projections over the same lower-level space when they launch local AI processes. They are not independent owners of process policy.

- Direct carrier projection: a direct local AI handoff, for example legacy `Carrier=codex`.
- Operator-surface projection: a user-visible surface such as `agent-cli`, `agent-tui`, or `agent-web-ui` that attaches to NARS rather than owning AI process policy itself.
- IntelligenceProvider projection: a provider adapter that shells out to a local AI CLI, for example `codex-subscription` preflight and runtime `codex exec --json` calls.
- Worker projection: delegated worker runtimes that choose Codex as their execution adapter.

All projections share one admission, lease, evidence, and cleanup interpretation path. A projection can add its own UX, defaults, or routing, but it cannot bypass the invocation substrate for a local AI subprocess.

## Object Model

An AiProcessInvocation record contains:

- `schema`: stable schema id, currently `narada.ai_process_invocation.v2`.
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
- `invocation_scope`: canonical runtime-session scope. A Codex live cap is evaluated only against invocations with the same `kind`, `site_root`, and `runtime_session_id`; a missing scope is refused rather than treated as a shared null scope.
- `thread_id`: optional provider thread id when relevant.
- `command` and `argv`: command shape after resolution but before spawn.
- `env`: redacted environment summary, never raw secrets.
- `policy`: duplicate-admission and cap policy inputs.
- `owner_pid`: process that owns the invocation lease.
- `owner_process_start_identity`: identity recorded for the owning process start. PID liveness without a matching start identity is unverified and cannot block a new admission.
- `admission_diagnostics`: bounded diagnostics, including the count of live but unverified legacy or PID-reuse candidates.
- `lease_path`: path to the live lease artifact.
- `artifact_path`: path to the launch/refusal/exit evidence artifact.
- `created_at`, `exited_at`: lifecycle timestamps.
- `cleanup_hint`: operator-readable next action when admission is refused or a stale lease is found.

The lease key is built from the identity of the adapter/projection/purpose and the owning execution locus. It must not be a raw process-count heuristic. The default Codex cap is `1` per canonical NARS runtime-session scope, not per site or host.

The evidence artifact is historical truth. The lease artifact is the live admission lock. Deleting evidence does not fix admission. Stale lease cleanup is valid only when the recorded owner is no longer live or the operator deliberately overrides the duplicate policy.

## Lifecycle

An invocation moves through these states:

1. `planned`: caller has constructed the invocation request but no admission has occurred.
2. `admitted`: admission acquired a lease and wrote launch evidence; spawning may proceed.
3. `refused`: admission refused before spawn and wrote refusal evidence.
4. `spawned`: process creation returned a child/process-owner handle.
5. `exited`: process completed and exit evidence was written.
6. `released`: live lease was removed or made non-live.

Refusal is a terminal pre-spawn state for that request. It must not create a subprocess.

## Admission Scope And Compatibility

The authoritative live-admission scope is:

```json
{
  "schema": "narada.ai_process_invocation_scope.v1",
  "kind": "narada_runtime_session",
  "site_id": "sonar",
  "site_root": "D:/code/narada.sonar",
  "runtime_session_id": "carrier_...",
  "agent_identity_ref": {},
  "launch_session_id": "..."
}
```

The launcher allocates the runtime-session identity before provider credential readiness is projected, so a launch-time Codex auth probe and the eventual provider turn carry the same scope. The carrier session record is persisted only after provider readiness succeeds. The provider runtime creates the scope before it dispatches a Codex subprocess. The provider lifecycle exposes the boundary explicitly as `dispatched -> admitting -> admitted -> receiving`; a live-cap refusal therefore records `admitting -> refused` with its original reason instead of being misclassified as a receiving failure.

Legacy leases and artifacts remain readable. A live legacy lease without a process-start identity is reported as unverified evidence and is excluded from positive cap matches. It cannot block an explicitly scoped admission, and a missing runtime-session scope fails closed with `invocation_scope_missing`.

## Required Callers

These paths must use AiProcessInvocation for local Codex launches:

- direct `Carrier=codex` launches;
- `codex-subscription` auth/preflight probes;
- `codex-subscription` runtime provider requests;
- worker-delegation Codex runtime launches.

A new local AI process path is not complete until it either calls AiProcessInvocation or explicitly proves that it is not an external AI subprocess invocation.

The current implementation has two repository loci:

- Narada proper uses `@narada2/carrier-provider-support` for launcher, NARS provider, and direct carrier paths.
- `mcp-surfaces` worker-delegation uses the same policy shape locally until the shared package can be consumed cleanly across that repository boundary.

Both loci must preserve the same semantics: admit before spawn, refuse before spawn, redact secrets, record artifacts, and release live leases on process exit.

## Non-Goals

AiProcessInvocation is not a Windows Terminal detector, PATH shim, fnm/node wrapper, provider-only guard, launcher-only guard, or postfactum process watchdog. Those can be useful diagnostics or compatibility layers, but they are not the authoritative policy boundary because they sit at the wrong level or see only one projection.

The tempting alternatives are incomplete for specific reasons:

- fnm/node interception is too low-level. It sees many Node processes that are not AI subprocesses and does not know Narada site, agent, projection, purpose, or operator intent.
- Windows Terminal and window-title checks are too high-level. They only see one UI embodiment and miss provider calls, background workers, and non-terminal launch paths.
- Launcher-only checks are too early and too narrow. They miss AI subprocesses created after launch by NARS provider adapters or delegated workers.
- Provider-only checks are too late and too narrow. They miss direct local AI carriers and worker runtimes that do not enter through the provider adapter.
- PATH shims are bypassable implementation details. A caller can resolve the real binary, use a package entrypoint, or unwrap a `.cmd` script.
- Postfactum watchdogs detect after side effects. They can report or clean up, but they cannot be the main admission authority.

These mechanisms can support diagnostics, compatibility, or defense in depth. They should not be documented or implemented as replacements for the substrate.

## Operator Interpretation

A refusal artifact means Narada intentionally prevented a process from being spawned. The operator-facing message should show:

- refusal reason, such as `duplicate_live_invocation` or `codex_live_invocation_cap_exceeded`;
- projection and purpose, so the operator can tell whether this was direct carrier, provider, or worker activity;
- site, agent, session, and workspace identity when available;
- existing invocation evidence, including owner pid, command summary, lease path, and artifact path;
- cleanup hint.

The normal remediation is to stop or wait for the existing invocation. If the duplicate is intentional, use the explicit duplicate override supported by that caller and make the override visible in evidence. If a lease is stale, remove only the live lease after confirming that the recorded owner is gone; keep refusal and launch artifacts as audit history.

## Verification Surface

The architecture is covered by focused checks rather than a single broad launcher test:

- substrate unit tests for lease acquisition, duplicate refusal, stale cleanup, explicit override, and redaction;
- substrate tests for per-runtime-session isolation, missing-scope refusal, legacy/unverified leases, and PID-reuse identity mismatch;
- provider-runtime tests for canonical scope propagation and the `admitting -> refused` Codex cap path;
- direct carrier option tests proving `Carrier=codex` enters the substrate;
- `codex-subscription` preflight duplicate-refusal tests;
- provider command-resolution and module-contract tests proving runtime provider calls use the substrate path;
- worker-delegation tests proving Codex worker starts are refused before fake worker output when a duplicate lease exists.

Broad workspace launch tests may exercise the same behavior, but the invariant belongs to the invocation substrate and its required projections.
