# Task 239: Lift Question Escalation Protocol Into narada.usc

## Why

While building Narada, we needed a local task contract that tells worker agents when to stop and ask the architect/user instead of making arbitrary semantic, product, authority, safety, or private-data decisions.

That need is not Narada-specific. It is a constructor-level primitive:

> workers executing a task graph need a protocol for unresolved arbitrariness.

The canonical home for this concept should therefore be `narada.usc`, not only Narada proper. Narada's local `.ai/task-contracts/question-escalation.md` should become a project-local instance or specialization of the USC protocol.

## Goal

Make question/escalation a first-class USC protocol and ensure future USC-generated app repos inherit it by default.

## Required Work

### 1. Add Canonical Protocol To `narada.usc`

In `/home/andrey/src/narada.usc`, add a canonical protocol document for task-graph worker escalation.

Suggested location:

```text
protocols/question-escalation.md
```

The protocol should define:

- unresolved arbitrariness as the reason for escalation
- when a worker must ask for help
- when a worker should proceed locally
- required escalation format
- pause rules
- decision recording
- relationship between worker, architect, and user

The content can be adapted from Narada's local:

```text
.ai/task-contracts/question-escalation.md
```

but it should be phrased as a generic USC construction protocol, not as a Narada-specific rule.

### 2. Wire Protocol Into USC Templates

Update USC app/task templates so generated USC-governed repos include the escalation protocol by default.

Acceptable shapes:

- generated `.ai/task-contracts/question-escalation.md`
- generated task template includes a `## Escalation Needed` section reference
- generated README/protocol docs tell workers to use the protocol

Do not require every task to copy the full protocol text.

### 3. Add Optional Schema Or Structured Convention

If USC already has schemas for task graph or task artifacts, add a lightweight structured convention for escalation blocks.

Acceptable minimum:

- document the Markdown block shape only

Preferred if low-friction:

- add `schemas/escalation.schema.json` for machine-readable escalation records

Do not overbuild a workflow engine here.

### 4. Reconcile Narada Proper

Update Narada proper's local contract to state that it is an instance/specialization of the USC protocol.

Do not remove the local Narada copy; agents working in Narada should still have local instructions without needing to inspect `narada.usc`.

### 5. Verification

Run focused validation in `narada.usc` only.

Examples:

```bash
pnpm validate
pnpm test
```

Use whichever command exists in `narada.usc`; do not invent new validation unless required.

## Non-Goals

- Do not implement inter-agent messaging infrastructure.
- Do not add network services.
- Do not make escalation automatic or model-mediated.
- Do not remove Narada proper's local question-escalation contract.
- Do not create derivative task-status files.

## Acceptance Criteria

- [x] `narada.usc` contains a canonical question/escalation protocol.
- [x] USC-generated task/app repos inherit or reference the protocol by default.
- [x] Narada proper's local contract points back to the USC protocol as its conceptual source.
- [x] A lightweight escalation block convention is documented, and schema exists.
- [x] Focused `narada.usc` validation passes.
- [x] No `*-EXECUTED`, `*-DONE`, or `*-RESULT` files are created.

## Review Polish

**Residual found:** `packages/core/schemas/escalation.schema.json` was added and loaded by `loadSchemas()`, but `schemaIds` in `packages/core/src/schema-registry.js` did not expose a named `escalation` entry. Fixed by adding:

```js
escalation: "https://narada2.dev/schemas/usc/escalation.schema.json",
```

Validation re-run: passes.

## Implementation Summary

### 1. Canonical Protocol Added

**File:** `narada.usc/docs/protocols/question-escalation.md`

Generic USC construction protocol covering:
- Mandatory escalation triggers (authority ambiguity, semantic conflict, live external mutation, secret/private-data ambiguity, product decision, scope expansion, verification ambiguity, dishonest completion risk, irreversible migration)
- Non-escalation examples (ordinary implementation details)
- Escalation format (`## Escalation Needed` with Question, Why This Blocks, Options Considered, Recommendation, Current State)
- Pause rules (what is allowed/forbidden after recording escalation)
- Decision recording (`## Decision` block)
- Governance feedback distinction (escalation vs post-task improvement)
- Architect interaction rules
- Relationship to USC authority classes (`derive`/`propose` may escalate; `claim`/`execute`/`resolve`/`confirm` belong to downstream runtime)

### 2. Template Wired Into USC Init

**File:** `narada.usc/packages/compiler/templates/question-escalation.md`

- Project-local instance of the USC protocol with Narada-specific examples
- Includes link back to canonical USC protocol

**File:** `narada.usc/packages/compiler/src/init-repo.js`

- Added `question-escalation.md` to the template files list
- Updated generated `AGENTS.md` to reference the escalation protocol

### 3. Schema Added

**File:** `narada.usc/packages/core/schemas/escalation.schema.json`

Machine-readable schema for escalation records with:
- `escalation_id`, `task_id`, `status` (open/decided/superseded/withdrawn)
- `question`, `why_blocked`, `options`, `recommendation`, `current_state`
- `decision`, `decided_by`, `trigger` (enum of known trigger categories)

### 4. Narada Proper Reconciled

**File:** `.ai/task-contracts/question-escalation.md`

- Added header noting it is a "Narada-local instance" of the USC protocol
- Links to canonical USC protocol source
- Preserves all local content and examples (agents working in Narada still have local instructions)

### 5. Verification

```bash
cd /home/andrey/src/narada.usc && pnpm validate
# → All validations passed.

# Init test confirms template is included:
pnpm usc -- init /tmp/test-usc-init --name test-init --principal "Test" --intent "Test"
# → usc/question-escalation.md generated
# → AGENTS.md references escalation protocol
```

## Dependencies

- The current Narada local contracts exist:
  - `.ai/task-contracts/agent-task-execution.md`
  - `.ai/task-contracts/chapter-planning.md`
  - `.ai/task-contracts/question-escalation.md`
