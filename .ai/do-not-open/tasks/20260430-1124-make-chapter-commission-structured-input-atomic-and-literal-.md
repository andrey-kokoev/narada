---
status: opened
amended_by: architect
amended_at: 2026-04-30T14:00:19.433Z
---

# Make chapter commission structured input atomic and literal-safe

## Goal

Fix chapter commission structured input so it is atomic, preserves rich task fields literally, and does not leave partial artifacts on failure.

## Context

While commissioning the Operator Surface Work-State Ergonomics chapter through `narada chapter commission --input`, the command wrote task files and mutation state, then failed in task spec upsert with `RangeError: Too many parameter values were provided`. The same attempt also serialized `required_work` and `non_goals` arrays as comma-joined inline text before manual repair through `task amend --from-file`.

A second repair attempt exposed adjacent authoring drift: `task create --from-file` accepted `--title`, `--goal`, and repeated `--criteria`, but the created task initially had an ID-derived title, null goal, and empty criteria. `task amend --criteria` then kept only the final repeated criterion. These are part of the same structural problem: rich task authoring is not yet reliably literal, atomic, and specification-preserving.

This is a governance-command reliability fault. A failed command must not leave partial task artifacts, malformed task bodies, lifecycle drift, or lost acceptance criteria that Architect has to repair manually.

## Required Work

1. Reproduce the `chapter commission --input` failure against a fixture or temporary Site without mutating Narada proper state.
2. Fix task spec upsert compatibility so the SQL placeholders and bound values match in source and built output.
3. Make `chapter commission --input` render array-valued `required_work`, `non_goals`, and similar rich fields as structured Markdown, not comma-joined text.
4. Wrap chapter commission in an atomic posture: either all files/lifecycle/spec rows are created, or the command reports failure without durable partial artifacts.
5. Fix `task create --from-file` so title, goal, chapter, dependency, and acceptance-criteria flags remain authoritative unless the structured input explicitly overrides them.
6. Fix `task amend --criteria` posture so multiple criteria can be replaced without repeated-flag loss or comma-splitting surprises.
7. Add focused regression tests for successful structured input, malformed input rollback, SQL upsert binding count, `task create --from-file` metadata preservation, and repeated criteria handling.
8. Document the safe structured chapter/task commissioning path in help or command examples.

## Non-Goals

- Do not bypass sanctioned task/chapter commands with direct task-file editing.
- Do not make raw SQLite writes a public repair path.
- Do not remove existing short inline task creation ergonomics.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Structured input arrays render as numbered Markdown or bullets instead of comma-joined text
- [ ] Task spec upsert uses matching SQL placeholders and bound values in source and built output
- [ ] A failed chapter commission leaves no partial task files, lifecycle rows, specs, or registry drift
- [ ] `task create --from-file` preserves explicit title, goal, chapter, dependency, and criteria flags unless explicitly overridden
- [ ] `task amend --criteria` can replace multiple criteria without repeated-flag loss or accidental comma splitting
- [ ] Focused tests cover successful structured input, malformed input rollback, SQL binding-count regression, from-file metadata preservation, and criteria replacement
- [ ] Help or examples show the safe structured chapter/task commissioning path
