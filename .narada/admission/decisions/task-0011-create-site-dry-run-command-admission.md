# task-0011 create-site dry-run command admission

Decision: admitted

Task: `narada-proper.task-0011`

Source request:
- `OSM:osm_20260510_192448_209_7a1a46a0`

Authority basis:
- Operator accepted task-0010 design as complete and requested the recommended first implementation slice.
- Mutation root remains Narada proper repo authority at `D:\code\narada`.
- This task mutates only repo CLI source/tests and Narada proper `.narada` evidence.

Admitted changed-file scope:
- `packages/layers/cli/src/commands/sites.ts`
- `packages/layers/cli/src/commands/sites-register.ts`
- `packages/layers/cli/test/commands/sites-create.test.ts`
- `.narada/tasks/task-0011-create-site-dry-run-command.md`
- `.narada/admission/decisions/task-0011-create-site-dry-run-command-admission.md`
- `.narada/audit/task-0011-create-site-dry-run-command-audit.json`
- `.narada/admission/admission-ledger.jsonl`

Admitted behavior:
- Descriptor-only dry-run planning through `narada sites create --dry-run --config <path> --format json`.
- Optional explicit `--output-plan <path>` artifact write.
- Validation and refusal of source Site state import, live setup admissions, raw secrets/credentials, PC/operator runtime state, and identity/role authority smear.

Denied behavior:
- Filesystem Site creation.
- Local storage adapter admission.
- DB init or mutation.
- Live MCP registration.
- Runtime hydration.
- Capability or secret grants.
- Existing Site migration/lift/import.
- narada-andrey, CPY, Narada proper live Site state, DB, history, roster, checkpoint history, operator-surface runtime, PC state, secrets, or credentials import.

Rollback:
- Revert the admitted CLI source/test edits and remove the task-0011 `.narada` evidence entries/files if the slice is rejected before publication.
