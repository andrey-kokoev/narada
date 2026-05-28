# Site Telemetry / Registry Boundary Audit 2026-05-17

This audit applies the boundary in
[`site-telemetry-registry-boundary.v0.md`](site-telemetry-registry-boundary.v0.md)
to the current hosted Cloudflare package and adjacent docs.

## Hosted Route Classification

| Route family | Current route(s) | Boundary classification | Posture |
| --- | --- | --- | --- |
| Human shell | `GET /` | Site Registry read UI plus communication UI | May keep; page title may remain `Narada Site Registry` because the primary public UI is the registry grid. |
| Registry service health | `GET /health` | Registry Operational Telemetry | Must not be described as represented Site health. |
| Telemetry event receive | `POST /webhook` | Site Operational Telemetry | Compatibility route may keep name; desired conceptual name is telemetry event publish/receive. |
| Registry public read model | `GET /api/sites`, `GET /api/freshness`, `GET /api/projections/:site_id` | Site Registry read model with telemetry projection fields | May keep; docs/UI must say projection/read model, not authority. |
| Remote message candidates | `POST /api/messages`, `GET /api/messages/pending`, `GET /api/messages/:message_id`, `GET /api/messages/:message_id/receipt`, `POST /api/messages/:message_id/finalize` | Site Communication Candidate Exchange | Compatibility-only naming; desired conceptual name is remote candidate / site communication. |
| Relation lifecycle | `POST /api/relations/transition` | Site Registry | Correct concept; must remain separate from telemetry publish and message send. |
| Site communication | `POST /api/site-communications/send`, `GET /api/site-communications/:communication_id`, `GET /api/site-communications/:communication_id/receipt` | Site Communication Candidate Exchange | Correcter route family; should be preferred over `/api/messages` in new docs. |

## Must Fix

| Surface | Issue | Required correction |
| --- | --- | --- |
| `docs/product/site-telemetry-publication.md` | Treats the Cloudflare hosted Site Registry slice as an implementation slice of Site Telemetry Publication, which keeps SiteRegistry inside the telemetry chapter. | Reword to say the hosted package currently co-locates several concern realizations and that Site Registry relation publication is a separate command family. |
| `docs/product/site-telemetry-publication-outcome-shapes.md` | Includes `SiteRegistry Read Model` and `Remote Candidate Exchange` as subchapter outcomes under Site Telemetry Publication. | Mark these as adjacent/co-located concerns reused by telemetry surfaces, not subparts of Site Operational Telemetry. |
| `packages/site-operational-dashboard/src/index.ts` section title `Site Registry / Telemetry` | UI label joins registry and telemetry as one surface. | Rename in follow-up to a boundary-aware title such as `Registry Projection` plus separate telemetry rows where needed. |
| narada-andrey publication path | No command family exists for turning local relation admission into hosted Site Registry relation transition. | Specify `site-registry relation publish/activate` planner and MCP surface before any live hosted publication. |

## May Keep For Compatibility

| Surface | Why it may remain | Guardrail |
| --- | --- | --- |
| Package name `@narada2/site-registry-cloudflare` | Existing deployment/import coordinate. | Docs must say this package co-locates concerns and is not Site authority. |
| Environment prefix `NARADA_SITE_REGISTRY_*` | Existing deployment coordinate and secret binding prefix. | Secret names remain capability coordinates, not conceptual authority. |
| `/webhook` | Existing receiver route. | New docs should call it a telemetry event receiver route. |
| `/api/messages/*` | Existing remote exchange compatibility route. | New docs should prefer Site Communication Candidate Exchange naming and distinguish cloud receipt from local admission. |
| Page title `Narada Site Registry` | The public first viewport is the registry grid. | The page must not imply all hosted routes are registry authority. |

## Future Split Candidates

| Candidate | Split trigger |
| --- | --- |
| Telemetry event receiver | Split when multiple telemetry surface realizations or non-registry telemetry subscribers exist. |
| Registry relation lifecycle admin API | Split when relation publication/withdraw becomes a first-class CLI/MCP product surface. |
| Site Communication Candidate Exchange | Split when `/api/messages` and `/api/site-communications` need one canonical D1 schema and public API. |
| Registry Operational Telemetry | Split when deploy/smoke/monitoring history needs a separate private operator dashboard. |

## UI Label Findings

- `Narada Site Registry` is acceptable as the app title for the public registry
  grid.
- `Projection-only hosted registry` is acceptable and should remain visible.
- `Site Registry / Telemetry` is ambiguous because it implies one combined
  concern. It should become separate registry projection and telemetry
  projection rows.
- `Message` and `Chat` are acceptable only because the Site Communication
  Surface explicitly scopes them to one selected Site projection and receipt
  posture.

## Command Naming Findings

- Desired Site Operational Telemetry family: `site-telemetry event publish`,
  `site-telemetry pull`, `site-telemetry doctor`.
- Desired Site Registry family: `site-registry relation plan/publish/activate`,
  `site-registry relation withdraw/suppress/retire`.
- Desired Registry Operational Telemetry family: `site-registry ops health`,
  `site-registry ops smoke`, `site-registry ops deploy-evidence`.
- Desired Site Communication family: `site-communication compose/send/pending`,
  `remote-candidate finalize`.

New tasks should not use `site-telemetry publish` for hosted registry relation
activation.
