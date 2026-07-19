# Task Executability Assessment

A **Task Executability Assessment** is a structured, read-only, low-cognition evaluation of whether a governed task can be attempted as written in a declared environment. It is **not** a correctness proof, a success guarantee, or a substitute for human judgment. It answers one narrow question: *does the task spec and the environment we declare to have available contain enough clarity, authority, and tooling to start execution?*

## Ownership

| Concern | Owner | Why |
| --- | --- | --- |
| Assessment truth and policy | Task Lifecycle | The task database is the durable authority for what a task asks and what has been assessed. |
| Outcome orchestration | Delegated Task MCP | The evaluator is a read-only delegated workflow; Delegation owns how it is admitted, retried, and bounded. |
| Provider / model execution | Worker Delegation MCP | Provider registry and runtime selection are Delegation's domain; Task Lifecycle policy only names an evaluator profile. |
| Immediate dispatch | NARS | NARS lifecycle hooks see the structured follow-up from task create and start the shared orchestrator asynchronously. |
| Recovery / cadence | Site Operating Loop | When no NARS session exists, Site Loop reclaims pending or expired requests and drives the same orchestrator. |
| Enforcement | Delegated Task (canonical task-linked path only) | Strict mode refuses a dispatch that lacks a current executable assessment or a one-shot override. |

## Verdicts

- **`executable`** — no blocking findings; the task can be attempted with the declared environment.
- **`needs_revision`** — the task spec has blocking problems the executor cannot resolve (unresolved references, undecided choices, unmapped acceptance criteria, missing information, ambiguity).
- **`not_executable`** — the declared environment lacks required authority or tools; revising the task spec will not fix this.

Verdicts are derived mechanically from structured findings. Evaluator prose, provider failures, or orchestration errors never produce a verdict.

## Policy

Effective policy resolves field-by-field from **target Site** → **User Site** → **Host Site** → **product defaults**, with each field carrying provenance:

- `trigger` — `manual` (default) or `on_create`.
- `enforcement` — `off` (default), `warn`, or `strict`.
- `evaluator_profile` — default `shoshin-v1`.

Policy files live at `<siteRoot>/.ai/task-executability-policy.json` and only contain trigger/enforcement/profile. Provider or model selection is forbidden in Task Lifecycle policy and rejected during validation.

## Digests and Currency

Two digests make assessments comparable and durable:

- **Task-spec digest** — a stable hash over goal, context, required work, non-goals, acceptance criteria, dependencies, and title. Tags, chapter, execution notes, verification, and checkmarks do not participate.
- **Declared-environment digest** — a stable hash over the Site identity, substrate/variant, and the declared tools and authority capabilities available at dispatch time.

An assessment is **current** only when both digests still match. Any material change to the task spec or declared environment makes prior assessments stale.

## Execution State vs. Assessment Verdict

Keep these axes separate:

- **Request execution state** — `pending`, `leased`, `dispatched`, `completed`, `failed_retryable`, `failed_terminal`. This tracks the orchestrator, not the task.
- **Assessment currency** — `current`, `stale`, `superseded`. This tracks whether an admitted assessment still describes the current task and environment.
- **Assessment verdict** — `executable`, `needs_revision`, `not_executable`. This is the evaluator's structured judgment.

A failed evaluator run is recorded on the request state, not folded into the verdict.

## One-Shot Override

In strict mode, an operator may admit a one-shot override scoped to an actor, reason, authority basis, task digest, and dispatch fingerprint. It permits exactly one matching dispatch and is durably audited. Changed dispatch environments cannot reuse an override.

## Shoshin Posture

The default evaluator profile is named `shoshin-v1` to emphasize a beginner's-mind stance: the evaluator does not assume hidden context, prior conversation, or task-local self-exemption. It inspects only the canonical task packet and the bounded declared Site environment.
