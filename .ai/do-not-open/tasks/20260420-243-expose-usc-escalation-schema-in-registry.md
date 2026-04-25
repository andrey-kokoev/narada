# Task 243: Expose USC Escalation Schema In Registry

## Chapter

Governance Protocols

## Context

Task 239 lifted the question/escalation protocol into `narada.usc` and added:

- `/home/andrey/src/narada.usc/docs/protocols/question-escalation.md`
- `/home/andrey/src/narada.usc/packages/compiler/templates/question-escalation.md`
- `/home/andrey/src/narada.usc/packages/core/schemas/escalation.schema.json`

Review found no blocking issue, but one residual polish gap:

`packages/core/schemas/escalation.schema.json` is loaded by `loadSchemas()`, but `packages/core/src/schema-registry.js` does not expose it as a named `schemaIds` entry.

## Goal

Make the new escalation schema discoverable through the public USC schema registry.

## Required Work

### 1. Update USC Schema Registry

In `/home/andrey/src/narada.usc/packages/core/src/schema-registry.js`, add:

```js
escalation: "https://narada2.dev/schemas/usc/escalation.schema.json"
```

to the exported `schemaIds` object.

### 2. Add Focused Coverage If Existing Pattern Exists

If `narada.usc` already has a focused schema-registry test, update it to assert that `schemaIds.escalation` exists and matches the escalation schema `$id`.

Do not invent broad new infrastructure for this polish task.

### 3. Update Task 239 Notes

If accessible from the agent environment, update:

```text
/home/andrey/src/narada/.ai/do-not-open/tasks/20260419-239-lift-question-escalation-protocol-into-narada-usc.md
```

with a short review-polish note saying the escalation schema is now exposed by the USC schema registry.

Do not create a derivative result/status file.

## Non-Goals

- Do not change the escalation protocol text.
- Do not change generated app repo layout.
- Do not add an escalation workflow engine.
- Do not add network services or inter-agent messaging.
- Do not create `*-EXECUTED`, `*-DONE`, `*-RESULT`, `*-FINAL`, or `*-SUPERSEDED` files.

## Verification

Run focused validation only in `/home/andrey/src/narada.usc`.

Preferred:

```bash
pnpm validate
```

If a focused schema-registry test exists and is updated, run that test too.

Do not run broad test suites unless focused validation fails and the extra command is needed to isolate the problem.

## Acceptance Criteria

- [x] `schemaIds.escalation` exists in `/home/andrey/src/narada.usc/packages/core/src/schema-registry.js`.
- [x] `schemaIds.escalation` equals `https://narada2.dev/schemas/usc/escalation.schema.json`.
- [x] Existing schema loading behavior remains unchanged.
- [x] Focused USC validation passes.
- [x] Task 239 is updated with a short review-polish note if accessible.
- [x] No derivative status/result files are created.

## Execution Notes

**Task 243 work was already completed as part of Task 239's review polish.**

- `schemaIds.escalation` is already present in `packages/core/src/schema-registry.js` at line 19, with value `"https://narada2.dev/schemas/usc/escalation.schema.json"`.
- This matches the `$id` in `packages/core/schemas/escalation.schema.json`.
- Task 239 already documents this fix in its "Review Polish" section.
- `pnpm validate` in `narada.usc` passes (all 28 domain-packs + refinements validated).
- No changes were required; verification confirms the registry is correct.
