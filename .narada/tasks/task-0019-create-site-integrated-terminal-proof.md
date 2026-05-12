# narada-proper.task-0019

Status: completed for current integrated proof by `narada-proper.task-0024`.

Evidence:
- Create-Site CLI proof: `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts`
- Live carrier proof: `node --test tools\site-init\site-live-carriers.test.mjs`
- Audit: `.narada/audit/task-0024-create-site-live-carriers-implementation-audit.json`

Title: Prove integrated greenfield Site creation path

Goal:
- Provide a terminal proof that a future operator can create a minimal, task-lifecycle, or agent-memory Site from Narada proper templates using the CLI.

Acceptance:
- End-to-end smoke tests cover minimal create and descriptor/admission setup for package slices.
- Documentation names exact operational commands, admission gates, rollback, and non-claims.
- Richer cross-Site migration/lift/import remains separate.

Former blocker resolved:
- Tasks 0012 through 0018 are completed or represented by the tested carrier implementation.

Remaining non-claim:
- Single-command live orchestration through `narada sites create` remains a separate implementation slice.
