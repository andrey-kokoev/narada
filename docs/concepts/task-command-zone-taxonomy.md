# Task Command Zone Taxonomy

Task operators are split by authority zone. A command may inspect adjacent zones,
but it must not silently perform another zone's mutation.

## Task Specification Zone

Owner: task specification commands.

Commands:

- `narada task create`
- `narada task amend`
- `narada task read`

Allowed mutations:

- Create or update `task_specs`.
- Maintain the markdown task artifact as compatibility projection.
- Backfill missing spec rows from legacy projection only through sanctioned commands.

Not allowed:

- Prove completion.
- Admit evidence.
- Review work.
- Close lifecycle.

## Evidence Admission Zone

Owner: evidence commands.

Commands:

- `narada task evidence inspect`
- `narada task evidence prove-criteria`
- `narada task evidence admit`
- `narada task evidence list`

Allowed mutations:

- `inspect` and `list` are read-only observation surfaces.
- `prove-criteria` records criteria proof and a criteria-only admission result.
- `admit` assembles the closure evidence bundle and records the admission result consumed by lifecycle transition commands.

Not allowed:

- Mutate task specification.
- Perform peer review.
- Transition lifecycle to terminal states.

## Review Admission Zone

Owner: review commands.

Commands:

- `narada task review`

Allowed mutations:

- Record review verdict.
- Record review-based evidence admission.
- Transition lifecycle only when the review verdict and evidence admission regime allow it.

Not allowed:

- Rewrite task specification.
- Fabricate evidence proof.

## Lifecycle Transition Zone

Owner: lifecycle commands.

Commands:

- `narada task claim`
- `narada task continue`
- `narada task report`
- `narada task close`
- `narada task reopen`
- `narada task confirm`

Allowed mutations:

- Transition lifecycle state.
- Maintain assignment and roster projections needed by lifecycle authority.
- `close` consumes the latest admitted Evidence Admission result; it does not assemble evidence itself.

Not allowed:

- Mutate task specification.
- Convert inspection into evidence admission.
- Create review verdicts.

## Reconciliation Zone

Owner: reconciliation commands.

Commands:

- `narada task reconcile inspect`
- `narada task reconcile repair`

Allowed mutations:

- `inspect` records durable findings.
- `repair` applies bounded repairs declared by findings.
- Non-auto-repairable findings must be recorded as deferred/ignored rather than guessed.

Not allowed:

- Choose canonical task ownership when the required decision is operator-semantic.
- Hide authority splits by silently repairing unrelated surfaces.

## Do-Not-Open Projection Boundary

Task markdown files under `.ai/do-not-open/tasks` are compatibility projections.
They are not the sanctioned task authority surface.

Sanctioned access:

- Inspect through `narada task read`, `narada task evidence inspect`, or bounded list/graph/observation commands.
- Mutate through `narada task create`, `narada task amend`, `narada task claim`, `narada task report`, `narada task review`, `narada task evidence prove-criteria`, `narada task evidence admit`, `narada task close`, or `narada task finish`.
- Repair projection drift through `narada task reconcile record` followed by `narada task reconcile repair`.

Residual substrate limit:

- A normal filesystem checkout cannot prevent a process from opening a file.
- Narada therefore detects repairable projection drift and treats direct file access as an inadmissible bypass, not as an alternate authority path.
