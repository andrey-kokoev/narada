# AiProcessInvocation

AiProcessInvocation is the first-class substrate for local AI process starts. It sits below Carrier and IntelligenceProvider projections and above raw process spawn. The boundary exists because `codex-subscription` as a provider and `codex` as a carrier can both resolve to the same local executable shape, and treating those as separate launch worlds hides duplicate wrappers until after windows and processes already exist.

The substrate owns the common invocation projection: adapter kind, projection, purpose, site root, cwd, command, argv, redacted environment summary, deterministic lease key, pre-spawn admission/refusal, launch/refusal/exit evidence, and explicit duplicate override through `NARADA_AI_PROCESS_INVOCATION_ALLOW_DUPLICATE`.

Required projections are `carrier` for direct `Carrier=codex`, `codex-subscription` for auth preflight and runtime `codex exec --json`, and `worker-delegation` for delegated Codex worker runtime launches.

## Duplicate Policy

The default policy refuses a duplicate live lease before spawn. A refusal artifact contains `reason=duplicate_live_invocation`, the existing invocation record, a cleanup hint, and the path to the lease that blocked the new start. Operators should inspect the artifact first; it identifies whether the duplicate came from a carrier handoff, provider runtime, auth preflight, or worker delegation.

The override is intentionally explicit. Set `NARADA_AI_PROCESS_INVOCATION_ALLOW_DUPLICATE=1` only when concurrent launches with the same command, argv, cwd, site root, projection, and purpose are expected.

## Non-Goals

AiProcessInvocation is not a daemon, watchdog, window enumerator, or postfactum cleanup loop. Diagnostic scripts can still explain existing `node.exe`, `OpenConsole.exe`, or terminal processes, but the invariant belongs in the invocation path: a governed caller must ask for admission before it creates the process.

AiProcessInvocation also does not move identity authority into window titles, workspace registry names, command-line labels, or inferred process ancestry. It records launch evidence, but identity authority remains owned by higher Narada session and carrier mechanisms.
