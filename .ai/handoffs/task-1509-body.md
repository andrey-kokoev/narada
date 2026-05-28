Implemented task 1509 by adding the Narada proper MCP architect role-policy projection contract.

Files changed:

- `packages/narada-proper-mcp/src/surface-registry.ts`
- `packages/narada-proper-mcp/src/index.ts`
- `packages/narada-proper-mcp/test/narada-proper-mcp.test.ts`
- `.ai/do-not-open/tasks/20260518-1509-define-canonical-mcp-role-policy-projection-contract.md`

Summary:

- Added typed projection and validation APIs:
  - `NaradaProperMcpRolePolicyProjection`
  - `RolePolicyValidationResult`
  - `buildNaradaProperArchitectRolePolicyProjection`
  - `validateNaradaProperArchitectAllowedTools`
- Projection names the MCP surface registry as policy source and `config.json` as reconciled Site-local runtime posture, not authority.
- Projection distinguishes canonical allowed tools, optional bare `inbox_*` aliases, refused tools, and role-eligible tools.
- Bare inbox aliases are excluded by default and admitted only via explicit projection mode.
- Replaced the local `config.json`-dependent allowlist test with contract-level tests, so the package test suite no longer depends on gitignored Site-local config.

Verification:

- `pnpm --filter @narada2/narada-proper-mcp typecheck` passed.
- `pnpm --filter @narada2/narada-proper-mcp test` passed: 1 file, 31 tests.
- `pnpm --filter @narada2/narada-proper-mcp build` passed.
