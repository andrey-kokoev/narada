# narada-proper.task-0011

Title: Implement descriptor-only `narada sites create --dry-run`

Authority basis:
- Operator accepted task-0010 greenfield create-Site option model as complete.
- Source request: `OSM:osm_20260510_192448_209_7a1a46a0`.
- Narada proper task target: repo package/CLI implementation and local `.narada` evidence only.

Goal:
- Implement the first CLI slice: `narada sites create --dry-run --config <path> --format json`.
- Parse task-0010 config fixtures, validate greenfield template/catalog create-site options, expand descriptor-only package slices, and emit a structured dry-run plan.

Scope:
- `packages/layers/cli/src/commands/sites.ts`
- `packages/layers/cli/src/commands/sites-register.ts`
- `packages/layers/cli/test/commands/sites-create.test.ts`
- `.narada` task/admission/audit/ledger evidence

Acceptance:
- Supports descriptor-only presets: `minimal`, `agent-memory`, `task-lifecycle`.
- Full operator-surface-aware User Site preset is refused/fixture-only until live surfaces are separately admitted.
- Plan JSON includes selected template/preset, package descriptors, required local admissions, planned files, refusals, warnings, evidence refs, and non-claims.
- Refusal guards cover source Site imports, runtime DB/history/checkpoint/task/inbox/operator-surface/PC state, secrets/credentials, implicit live capability grants, and identity/role authority smear.
- No filesystem Site creation occurs; only explicit `--output-plan` artifact is allowed.

Non-goals/refusals:
- No create-Site execution.
- No local adapter admission.
- No DB init or mutation.
- No live MCP registration.
- No runtime hydration.
- No capability or secret grants.
- No Site-to-Site import/lift/migration.
- No narada-andrey, CPY, Narada proper live Site state, DB, history, roster, checkpoint history, operator-surface runtime, PC state, secrets, or credentials import.

Verification checklist:
- CLI typecheck.
- Focused `sites-create` tests.
- If available, package-local CLI build or equivalent compile verification.

Closeout evidence:
- Audit path: `.narada/audit/task-0011-create-site-dry-run-command-audit.json`.
- Ledger event appended to `.narada/admission/admission-ledger.jsonl`.
- OSM closeout to `narada-andrey.Kevin`.
