# narada-proper.task-0012

Title: Implement minimal greenfield Site filesystem creation

Authority basis:
- Operator requested tasks covering the full path to easy CLI Site creation and instructed execution without stopping unless blockers arise.
- Follows task-0011 descriptor-only dry-run command.
- Narada proper target: repo CLI/source/tests and `.narada` evidence only.

Goal:
- Make `narada sites create --config <path> --format json` create a minimal greenfield Site skeleton when the config is valid and contains no live package/runtime admissions.

Scope:
- `packages/layers/cli/src/commands/sites.ts`
- `packages/layers/cli/src/commands/sites-register.ts`
- `packages/layers/cli/test/commands/sites-create.test.ts`
- `.narada` task/audit/ledger evidence

Acceptance:
- Non-dry-run create writes only minimal greenfield files under `site.site_root`.
- The command refuses package slices, live adapter requests, DB init, MCP registration, runtime hydration, capability grants, source Site imports, PC/operator-surface mutation, secrets, and collisions.
- Existing `--dry-run` behavior remains intact.
- Tests cover successful minimal create, collision refusal, source-state refusal, and no package/live execution.

Non-goals/refusals:
- No DB init or mutation.
- No MCP registration.
- No runtime hydration.
- No capability or credential grant execution.
- No Windows PowerShell profile mutation.
- No Site-to-Site import/lift/migration.

Verification:
- Focused CLI tests.
- CLI typecheck and build.
- Built CLI smoke against a temp Site root.

Closeout evidence:
- Audit path: `.narada/audit/task-0012-create-site-minimal-filesystem-skeleton-audit.json`.
- Ledger event appended to `.narada/admission/admission-ledger.jsonl`.
