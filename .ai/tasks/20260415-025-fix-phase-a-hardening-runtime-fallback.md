# Fix Phase A Hardening Runtime Fallback

## Context

Commit `cae5868` implemented most of the Phase A hardening corrections, but it did not fully remove implicit fallback to `MockCharterRunner`.

The current daemon logic still returns `MockCharterRunner` for any runtime value other than `codex-api`, even though the intended behavior is:

- `codex-api` → require API key, fail fast if missing
- `mock` → explicit mock path only
- anything else → fail fast as invalid runtime configuration

## Required Change

Update the charter-runner selection logic in:

- `packages/exchange-fs-sync-daemon/src/service.ts`

so that:

1. `runtime === 'codex-api'`
   - requires API key
   - throws if missing

2. `runtime === 'mock'`
   - explicitly returns `MockCharterRunner`

3. any other runtime value
   - throws an error such as:
     - invalid charter runtime
     - unsupported runtime value

No implicit fallback allowed.

## Required Test Coverage

Add or update tests to prove:

- `codex-api` + missing API key → startup fails
- `mock` → mock runner is used
- unknown runtime value → startup fails
- no runtime value other than `mock` can silently degrade to mock behavior

## Nice-to-have Cleanup

If practical in the same change:

- remove or clarify the unused `definitionTool` lookup in the Phase A tool execution path

Do not expand scope beyond this.

## Definition of Done

- implicit fallback is removed
- runtime behavior is explicit and deterministic
- tests cover invalid runtime config cases
- all tests pass