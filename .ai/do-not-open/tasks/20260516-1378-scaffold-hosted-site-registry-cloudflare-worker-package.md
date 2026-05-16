---
status: closed
depends_on: [1377]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T16:26:21.446Z
criteria_proof_verification:
  state: unbound
  rationale: proof via task finish
closed_at: 2026-05-16T16:26:21.941Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: agent_finish
---

# Scaffold hosted Site Registry Cloudflare Worker package

## Chapter

Cloudflare hosted Site Registry projection

## Goal

Create the Narada hosted Site Registry Worker package boundary and Cloudflare deployment skeleton.

## Context

Staccato keeps its hosted surface under workers/staccato with a Worker entrypoint, wrangler.jsonc, KV binding, D1 binding, migrations, and deploy script. Narada needs an equivalent package or package slice for the hosted Site Registry projection, distinct from @narada2/cloudflare-site bounded Cycle runtime.

## Required Work

1. Decide package location and naming for the hosted Site Registry Worker, reusing existing package conventions where possible. 2. Add Worker entrypoint skeleton with no-authority route posture. 3. Add Wrangler config template, compatibility date posture, D1 binding, KV binding, and secret binding names using Narada-specific names. 4. Add package scripts for build/typecheck/test and a non-live deployment template or runbook. 5. Add tests proving the package boundary is projection-only and distinct from the Cloudflare Site Cycle runtime.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Created `packages/site-registry-cloudflare` as the hosted Site Registry Worker package, separate from the existing `@narada2/cloudflare-site` Cycle runtime package. The package boundary is projection-only: it exposes scaffold `GET /`, `GET /health`, `GET /api/sites`, and planned `POST /webhook` route posture, and explicitly denies Site mutation, inbox/task admission, identity certification, and capability grants.

Added a Wrangler template with Narada-specific KV, D1, mode var, and secret binding names. The template uses placeholders only; no account ids, database ids, namespace ids, or secret values were added.

Added package scripts and focused boundary tests proving the hosted registry scaffold is a projection surface, not Cloudflare Site Cycle runtime authority.

## Verification

- `pnpm install` succeeded and linked the new workspace package.
- `pnpm --filter @narada2/site-registry-cloudflare test` passed: 1 test file, 4 tests.
- `pnpm --filter @narada2/site-registry-cloudflare typecheck` passed.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.

## Acceptance Criteria

- [x] Worker package boundary exists with build/typecheck/test scripts.
- [x] Wrangler/D1/KV/secret binding template exists without raw account ids or secrets.
- [x] Tests prove the hosted registry package is not the Cloudflare Site Cycle runtime and owns no Site authority.
