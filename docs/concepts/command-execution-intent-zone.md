# Command Execution Intent Zone

The Command Execution Intent Zone (CEIZ) is the governed ops zone for non-test command execution.

CEIZ exists because a shell line is not a durable authority artifact. A governed Narada command run has three distinct stages:

1. `CommandRunRequest` is the input boundary. It records requested command, cwd, environment policy, timeout, approval posture, side-effect classification, requester, task linkage, and rationale before execution.
2. `CommandExecution` is the admitted runtime attempt. It may spawn a process only after request admission and approval checks.
3. `CommandRunResult` is the output boundary. It records exit status, duration, timeout state, stdout/stderr digests, bounded excerpts, artifact pointers, and output-admission decision.

Direct shell execution remains a legacy/noncanonical path for governed Narada ops. It may still exist as an operator escape hatch, but it is not the canonical way to create durable command evidence.

## CEIZ And TIZ

TIZ is not a layer on top of CEIZ and not a competing executor. TIZ and CEIZ are adjacent authority zones connected by governed crossings.

CEIZ owns generic command execution authority:

- command request admission;
- side-effect classification;
- approval posture;
- timeout/cancellation policy;
- bounded stdout/stderr admission;
- `CommandRun` persistence.

TIZ owns verification intent and evidence authority:

- test scope classification;
- full-suite guards;
- verification timeout policy;
- task verification linkage;
- `VerificationRun` persistence;
- pass/fail/timed-out interpretation as verification evidence.

The topology is:

```text
Testing Intent Zone
  -- CommandRunRequest crossing -->
Command Execution Intent Zone
  -- CommandRunResult crossing -->
Testing Evidence Admission
```

The `CommandRunResult` crossing does not by itself prove test evidence. TIZ admits that result under verification-specific rules and records a `VerificationRun`. Command success answers "the governed command succeeded"; verification admission answers "this command result counts as task verification evidence."

This is the core anti-collapse invariant: CEIZ may execute a test command, but CEIZ does not decide whether the result is adequate test evidence. TIZ may require command execution, but TIZ does not spawn directly outside CEIZ.

## Authority Owner

The authority owner is the Narada command execution controller. The shell is an execution substrate, not the authority owner. Chat transcript output is an observation surface, not an authority boundary.

## Crossing Artifacts

CEIZ fixes two crossing artifacts:

- `CommandRunRequest`: request crossing from operator/agent intent into command-execution admission.
- `CommandRunResult`: result crossing from runtime process output into durable Narada observation/evidence.

Output admission is separate from output creation. A command may produce large output, but only admitted excerpts, digests, and artifact references should cross into chat or task evidence by default.

## Artifact Contract

`CommandRunRequest` fields:

- `run_id`: durable run identity allocated before admission.
- `request_id`: durable request identity for the operator/agent intent.
- `requester_id`: operator, agent, or system identity making the request.
- `requester_kind`: `operator`, `agent`, or `system`.
- `command_argv`: parsed command vector, not an opaque transcript line.
- `cwd`: execution working directory.
- `env_policy`: `inherit`, `allowlist`, or `empty`; secret values are never stored.
- `timeout_seconds`: bounded execution timeout.
- `stdin_policy`: `none`, `inline` by digest, or artifact reference by URI and digest.
- `task_id` / `task_number`: optional task linkage.
- `agent_id`: optional agent linkage when requester or target is an agent.
- `side_effect_class`: `read_only`, `workspace_write`, `external_write`, `network`, `process_control`, or `destructive`.
- `approval_posture`: `not_required`, `required`, `approved`, or `rejected`.
- `output_admission_profile`: `digest_only`, `bounded_excerpt`, or `artifact_retained`.
- `idempotency_key`: stable repeat-run key.
- `requested_at`: request timestamp.
- `rationale`: nullable human/agent intent.

`CommandRunResult` fields:

- `run_id` / `request_id`: identity linkage to the request.
- `status`: one of `requested`, `rejected`, `approved`, `running`, `succeeded`, `failed`, `timed_out`, `cancelled`, or `blocked_by_policy`.
- `exit_code`: process exit code when available.
- `signal`: terminating signal when available.
- `started_at` / `completed_at` / `duration_ms`: runtime timing.
- `stdout_digest` / `stderr_digest`: digests over complete captured streams.
- `stdout_admitted_excerpt` / `stderr_admitted_excerpt`: bounded admitted output only.
- `full_output_artifact_uri`: optional retained artifact pointer; never raw unbounded row text.
- `error_class`: nullable normalized failure class.
- `approval_outcome`: final approval state.
- `telemetry_json`: bounded structured metrics.

SQLite owns request/result identity, lifecycle status, approval outcome, timing, digests, admitted excerpts, artifact pointers, task/agent linkage, and idempotency keys. Projection-only surfaces may render command strings, human summaries, task evidence snippets, and dashboard rows from SQLite. Raw unbounded stdout/stderr is never authoritative in SQLite; if retained, it belongs in a separate artifact addressed by URI and digest.

Idempotency is not a claim that side effects are safe to replay. It only identifies semantically repeated requests from the same requester over the same command vector, cwd, task linkage, and side-effect class. `read_only` repeats may be coalesced by policy; mutating repeats require a new explicit request or approval unless a later task defines a stronger replay law.

## Execution Regime

Every CEIZ request is classified before execution:

- `read_only`: inspection commands that should not mutate workspace or external state.
- `workspace_write`: local workspace mutation, including build artifacts and sanctioned repo edits.
- `external_write`: mutation outside the workspace or to remote services.
- `network`: network access without a known write effect.
- `process_control`: process start/stop/kill or daemon control.
- `long_running_server`: server/watch/workbench processes that may outlive a short command.
- `gui_open`: browser or desktop open commands.
- `destructive`: deletion, reset, irreversible overwrite, or broad cleanup.

Timeout policy is deterministic by class:

| Side-effect class | Default | Max |
| --- | ---: | ---: |
| `read_only` | 30s | 120s |
| `workspace_write` | 120s | 600s |
| `network` / `external_write` | 180s | 900s |
| `process_control` / `long_running_server` | 300s | 3600s |
| `gui_open` | 300s | 300s |
| `destructive` | 60s | 300s |

Timeout overrides are capped by the class maximum. Cancellation sends a graceful termination first and records partial output digests/excerpts; after a 5 second grace period the process tree may be force-killed by the substrate if supported.

Cwd admission must resolve to an allowed working root. Env admission stores only the env policy shape, never secret values. Persisted output must be post-admission output: complete stream digests, bounded excerpts, and optional artifact URIs.

Approval posture is data:

- `not_required`: request can execute under current policy.
- `required`: platform/operator approval is needed before execution.
- `approved`: approval was granted and linked to the run.
- `rejected`: approval was denied or unavailable.

CEIZ records `blocked_by_policy` or `rejected` results instead of silently falling back to raw shell behavior.

Invocation is argv-first. Shell mode is allowed only when the request explicitly asks for it and the classified side-effect regime permits it. Destructive commands are never shell-mode by default because shell expansion and command separators widen authority.

## First Implementation Slice

The first implementation slice is a SQLite-backed `command_runs` surface with:

- `narada command-run run --cmd <command> [--task <n>] [--timeout <s>]`
- `narada command-run inspect --run-id <id>`
- `narada command-run list [--task <n>]`

This slice is also the substrate used by TIZ crossings: TIZ creates verification intent, CEIZ executes the requested command, and TIZ admits or rejects the returned `CommandRunResult` as verification evidence.
