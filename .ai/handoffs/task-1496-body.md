Implemented task 1496 with relation boundary fixtures and a focused validation test.

Files changed:

- `docs/product/fixtures/operator-site-communication-relation/projection-ui.valid.json`
- `docs/product/fixtures/operator-site-communication-relation/invalid-direct-task-mutation.json`
- `docs/product/fixtures/operator-site-communication-relation/invalid-direct-inbox-admission.json`
- `docs/product/fixtures/operator-site-communication-relation/invalid-raw-secret-field.json`
- `docs/product/operator-site-communication-relation.v0.md`
- `packages/site-registry-cloudflare/test/communication-docs.test.ts`

Summary:

- Added relation and projection fixture coverage in the coherent product fixture directory.
- Added invalid fixtures for direct task mutation, direct inbox admission, and raw secret field collapse.
- Extended the existing communication docs test with a focused relation fixture validator.
- Validator rejects authority claims and receipt/projection/capability collapses without creating a broad schema framework.
- Invalid raw-secret fixture uses `raw_token: "REDACTED"` so it proves the forbidden field shape without storing a secret value.

Verification:

- `pnpm --filter @narada2/site-registry-cloudflare test -- test/communication-docs.test.ts`
- `Get-ChildItem docs/product/fixtures/operator-site-communication-relation -Filter *.json | ForEach-Object { Get-Content -Raw $_.FullName | ConvertFrom-Json | Out-Null; $_.Name }`
- `rg --pcre2 -n '"(raw_token|password|api_key|private_key|refresh_token)"\s*:\s*"(?!REDACTED")' docs/product/fixtures/operator-site-communication-relation`
- `git diff --check -- docs/product/fixtures/operator-site-communication-relation docs/product/operator-site-communication-relation.v0.md packages/site-registry-cloudflare/test/communication-docs.test.ts`

No live Cloudflare data, route behavior, dashboard UI, chat runtime, or broad schema framework was introduced.
