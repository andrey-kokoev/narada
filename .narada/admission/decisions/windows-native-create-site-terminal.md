# Windows-Native Create-Site Terminal Capability

Decision: the first Windows-native greenfield create-Site path is terminal and claimable.

Claimed scope:
- Narada proper template/catalog driven Site creation.
- Windows-native execution surface.
- Presets verified: `minimal`, `task-lifecycle`, `agent-memory`, `site-machinery`.
- CLI supports descriptor dry-run, filesystem skeleton creation, and explicit live carrier orchestration with `--execute-live --live-authority-basis`.

Operational commands:
- `narada sites create-presets --format json`
- `narada sites create --preset minimal --site-id <id> --root <path> --dry-run --format json`
- `narada sites create --preset minimal --site-id <id> --root <path> --format json`
- `narada sites create --preset task-lifecycle --site-id <id> --root <path> --execute-live --live-authority-basis <basis> --format json`
- `narada sites create --preset agent-memory --site-id <id> --root <path> --execute-live --live-authority-basis <basis> --format json`
- `narada sites create --preset site-machinery --site-id <id> --root <path> --execute-live --live-authority-basis <basis> --format json`

Evidence:
- `.narada/audit/windows-native-create-site-chapter.json`
- `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts`
- `node --test tools/site-init/site-live-carriers.test.mjs`
- `pnpm --dir packages/layers/cli typecheck`
- `pnpm --dir packages/layers/cli build`
- Built CLI smoke tests for dry-run, skeleton creation, and task-lifecycle live carrier execution.

Non-claims:
- No source Site runtime state import.
- No source Site DB/history/task/inbox/roster/checkpoint/operator-surface/PC/secrets import.
- No private MCP client config mutation.
- No real Windows profile mutation outside target-root artifacts.
- No capability/credential grants.
- No operator-surface or PC-locus mutation.
- No Site-to-Site migration/lift/import path; that remains a separate command family.
