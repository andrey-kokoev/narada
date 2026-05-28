---
status: confirmed
depends_on: [1488]
criteria_proved_by: narada.builder
criteria_proved_at: 2026-05-18T03:44:16.491Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-18T03:44:16.973Z
closed_by: narada.builder
governed_by: chapter_close:narada.builder
closure_mode: agent_finish
---

# Add validation fixtures for relation and projection boundaries

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260518-1494-1498-operator-site-communication-relation.md

## Goal

Create testable fixtures or schema checks that keep the Operator Site Communication Relation from collapsing into message admission, task mutation, or chat authority.

## Context

The doctrine contract needs executable guardrails where practical. Existing package conventions include JSON fixtures and focused tests for product contracts. This task should add the smallest useful validation boundary for the new relation shape.

## Required Work

1. Locate the existing fixture/schema/test pattern used for Site communication, registry relation, or product contract artifacts.
2. Add valid and invalid relation fixtures for at least: valid bidirectional relation, projection-only UI derivation, forbidden direct task mutation, forbidden direct inbox admission claim, and forbidden raw secret field.
3. Add or update focused tests or validation scripts if an existing product-contract validation path exists.
4. If no suitable validator exists, document the residual and add fixtures in a location future validators can consume.

## Non-Goals

- Do not build a broad schema framework solely for this task.
- Do not validate live Cloudflare data.
- Do not store real tokens, credentials, or private Site payloads in fixtures.

## Execution Notes

- Located existing product fixture validation patterns in `packages/site-registry-cloudflare/test/communication-docs.test.ts`, `packages/site-inbox/test/remote-exchange.test.ts`, and `packages/site-config/test/site-config.test.ts`.
- Added relation fixture set under `docs/product/fixtures/operator-site-communication-relation/`:
  - `relation.valid.json`
  - `projection-ui.valid.json`
  - `invalid-direct-task-mutation.json`
  - `invalid-direct-inbox-admission.json`
  - `invalid-raw-secret-field.json`
- Updated `docs/product/operator-site-communication-relation.v0.md` to list the fixture set and describe invalid fixtures as authority-collapse cases.
- Extended `packages/site-registry-cloudflare/test/communication-docs.test.ts` with a focused relation fixture validator that refuses direct task mutation claims, direct inbox admission claims, operator acknowledgement as approval, remote preservation as local admission, projection-only relation collapse, credential values, and raw secret fields.
- Kept invalid raw-secret fixture value redacted while preserving the forbidden field name for validator coverage.

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test -- test/communication-docs.test.ts` passed with 2 tests.
- `Get-ChildItem docs/product/fixtures/operator-site-communication-relation -Filter *.json | ForEach-Object { Get-Content -Raw $_.FullName | ConvertFrom-Json | Out-Null; $_.Name }` parsed all relation fixtures as valid JSON.
- `rg --pcre2 -n '"(raw_token|password|api_key|private_key|refresh_token)"\s*:\s*"(?!REDACTED")' docs/product/fixtures/operator-site-communication-relation` returned no matches.
- `git diff --check -- docs/product/fixtures/operator-site-communication-relation docs/product/operator-site-communication-relation.v0.md packages/site-registry-cloudflare/test/communication-docs.test.ts` passed.

## Acceptance Criteria

- [x] Relation fixtures exist in a coherent product fixture location.
- [x] Invalid examples cover authority-collapse failures.
- [x] A focused validation test exists, or the absence of a validator is recorded as an explicit residual.
- [x] Fixtures contain no raw secrets or private Site data.
