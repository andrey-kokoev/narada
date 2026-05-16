---
status: closed
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T23:12:31.569Z
criteria_proof_verification:
  state: unbound
  rationale: Criteria are proven by tile UI implementation, focused Worker tests, live deployment, live HTML marker check, and deploy:verify; missing future values render as not projected.
closed_at: 2026-05-16T23:12:41.487Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Add hosted Site Registry tile UI starter surface

## Goal

Replace the public root page's route-list-first view with a read-only Site tile projection surface that reserves space for future Site information display.

## Context

The hosted Site Registry public page now has coherent live data, but the page still presents as a route index plus JSON summary. The next coherence-gradient step is a projection UI that shows Sites as tiles and provides starter slots for active agents, open tasks, operator attention, critical action, health, freshness, and telemetry evidence without claiming authority or fabricating missing values.

## Required Work

1. Keep `/` projection-only and read-only.
2. Render Site tiles from `/api/sites` with stable tile sections for identity, freshness, health, telemetry evidence, active agents, open tasks, operator attention, critical action, and future crossings.
3. Show unavailable future values as `not projected` rather than inferred.
4. Keep API route links secondary.
5. Add or update tests proving the page renders tile scaffolding, loads `/api/sites`, and does not embed tokens or raw payloads.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Updated `packages/site-registry-cloudflare/src/index.ts` so the public `/`
page renders a read-only Site tile surface. The route list remains present as a
secondary Read API section.

Each tile has stable display slots for:

- freshness;
- health;
- observed timestamp;
- latest event;
- provenance count;
- active agents;
- open tasks;
- operator attention;
- critical action;
- inbox posture;
- publication edge.

Fields not present in `/api/sites` render as `not projected`. This keeps future
information space visible without inferring task, agent, or attention truth from
the hosted registry.

Updated `packages/site-registry-cloudflare/test/worker-boundary.test.ts` to
prove the human page exposes tile scaffolding and does not embed tokens or raw
payload markers.

Redeployed the Worker. Observed version:
`6850fa07-2099-4aa2-a507-6a061f10fe93`.

Evidence artifact:
`.ai/decisions/2026-05-16-site-registry-tile-ui-starter-surface.md`

## Verification

- `pnpm --filter @narada2/site-registry-cloudflare test` passed, 37 tests.
- `pnpm --filter @narada2/site-registry-cloudflare build` passed.
- `pnpm --filter @narada2/site-registry-cloudflare deploy:live` passed and deployed version `6850fa07-2099-4aa2-a507-6a061f10fe93`.
- Live root HTML contains `site-grid`, `site-tile`, `Active agents`, `Open tasks`, `Operator attention`, `Critical action`, and `not projected`.
- Live root HTML does not contain `payload_summary`, `publish-token`, or `read-token`.
- Live `/api/sites` returns `site_count=1`, `fresh_count=1`, `missing_count=0`.
- `pnpm --filter @narada2/site-registry-cloudflare deploy:verify -- --url https://narada-site-registry.andrei-kokoev.workers.dev` passed.

## Acceptance Criteria

- [x] The root page renders Site tile scaffolding instead of making the route list primary.
- [x] Tiles include starter slots for active agents, open tasks, operator attention, and critical action.
- [x] Missing future values are shown as not projected, not inferred.
- [x] The page remains projection-only and does not embed raw tokens or payload summaries.
- [x] Focused Worker tests pass.
