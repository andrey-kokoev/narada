# Site Operational Dashboard Generator v0

`site_operational_dashboard_generator.v0` defines a reusable contract for
rendering bounded Site operational posture dashboards without turning the
dashboard into Site authority.

The first earned source is the Staccato operational dashboard:

- `D:/code/staccato-elt/scripts/Build-NaradaStaccatoOpsPage.mjs`
- `D:/code/staccato-elt/scripts/ops-dashboard-server.mjs`
- `D:/code/staccato-elt/tests/build-narada-staccato-ops-page.test.mjs`
- `D:/code/staccato-elt/tests/ops-dashboard-server.test.mjs`

The Staccato implementation proves useful mechanics, but Staccato row providers
remain Site-specific. This contract specifies the reusable shape for Narada
proper and other Sites.

## Grounding

The generator is grounded in:

- SEMANTICS observation/evidence distinction: dashboard rows are observations
  and read models, not facts, intents, task lifecycle authority, or Site truth.
- Site Factorization: dashboard, static HTML, live server, and hosted page are
  projections over a Site authority object and its runtime loci.
- Site State Projections: runtime observations must expose freshness, evidence
  locus, and authority limits.
- Site Posture and Work-Next: dashboards may summarize posture and next action,
  but they do not replace canonical `narada site posture` or task/inbox
  lifecycle commands.
- Capability-Governed Secret Management: dashboard artifacts may carry
  credential references or capability posture, never raw secret values.
- Operator Surface Action Posture: primary rows may name ordinary work actions;
  diagnostics, repairs, and intrusive mutations must not be promoted by UI
  convenience.

## Authority Limits

The dashboard generator:

- renders a bounded projection from supplied snapshots and row providers;
- may read configured local files only through explicit caller-owned providers;
- may expose evidence refs, posture, freshness, and next-action hints;
- may offer copy/open helpers for evidence coordinates;
- must not mutate tasks, inbox, outbox, runtime state, credentials, external
  services, or Site authority records;
- must not infer Site authority from filesystem path, registry membership,
  process liveness, hosted presence, or dashboard freshness;
- must not claim live readiness unless the supplied evidence row says a
  governed readiness proof exists.

The dashboard is allowed to say "observed", "missing", "stale", "attention",
or "ready according to evidence X". It is not allowed to make an admission,
close work, rotate secrets, send effects, or certify authority by display.

## Reusable Staccato Mechanics

These mechanics are reusable:

- row shape with `section`, `label`, `state`, `basis`, `evidence_path`,
  `observed_at`, `next_action`, and bounded `detail`;
- explicit basis classification: `evidenced`, `inferred`, or `unknown`;
- section summaries and attention row selection;
- static HTML rendering with embedded bounded JSON payload;
- live local read-only server that returns snapshots and a dashboard shell;
- grouped navigation, section filtering, state filtering, search, compact path
  display, and copy affordances;
- task lifecycle snapshot projection as a read-only row family;
- sanitizers that redact secret-like keys and strings before rendering;
- tests that assert rows have evidence/freshness fields and that raw secret
  markers are absent.

These mechanics are not reusable as generic defaults:

- Staccato paths such as OneDrive client-service root, Staccato data root,
  Staccato ELT root, and Staccato runtime root;
- Staccato operation ids, campaign construction/activation packet names, C4X
  rows, Klaviyo/BigCommerce/GA4/Yotpo capability names, and Staccato worker
  event types;
- Staccato-specific mailbox, report, sync, and legacy inbox bridge heuristics;
- Staccato visual branding, route labels, and hosted surface navigation.

## Core Data Contracts

### Dashboard Snapshot

```json
{
  "schema": "narada.site_operational_dashboard.snapshot.v0",
  "site_ref": "narada-proper",
  "generated_at": "2026-05-17T00:00:00.000Z",
  "generator": {
    "name": "@narada2/site-operational-dashboard",
    "version": "0.1.0"
  },
  "authority_limits": [
    "dashboard_is_projection_not_site_authority",
    "rows_are_observations_not_admissions",
    "raw_secret_values_excluded"
  ],
  "sections": [],
  "rows": [],
  "summaries": [],
  "attention": [],
  "next_action": null,
  "output_bounds": {
    "raw_transcripts_included": false,
    "raw_db_rows_included": false,
    "raw_secret_values_included": false,
    "mutation_controls_included": false
  }
}
```

Required invariants:

- `generated_at` is observation time, not proof of source freshness.
- Every row must name its basis and evidence coordinate.
- `attention` is derived from rows; it is not a separate authority.
- `next_action` is advisory unless it points to a governed command with its own
  authority posture.

### Dashboard Row

```json
{
  "schema": "narada.site_operational_dashboard.row.v0",
  "row_id": "task-lifecycle-authority",
  "section_id": "authority-boundaries",
  "label": "Task lifecycle authority",
  "state": "ready",
  "basis": "evidenced",
  "severity": "info",
  "observed_at": "2026-05-17T00:00:00.000Z",
  "freshness": {
    "state": "fresh",
    "max_age_seconds": 3600,
    "source_observed_at": "2026-05-17T00:00:00.000Z"
  },
  "evidence": [
    {
      "kind": "file",
      "ref": ".ai/task-lifecycle.db",
      "authority_role": "projection_source"
    }
  ],
  "detail": "Task lifecycle DB present; status counts are bounded.",
  "next_action": null,
  "authority_limits": [
    "row_is_observation_not_lifecycle_authority"
  ]
}
```

Allowed `state` values:

- `ready`
- `attention`
- `blocked`
- `stale`
- `failed`
- `unknown`
- `not_configured`
- `done`

Allowed `basis` values:

- `evidenced`: row is backed by a declared evidence coordinate.
- `inferred`: row is derived from bounded observations but not direct authority.
- `unknown`: row cannot establish the source posture.

Rows must not include raw transcripts, raw DB rows, raw inbox bodies, raw draft
bodies, raw credentials, or raw external payloads. Details should be bounded
summaries.

### Dashboard Section

```json
{
  "schema": "narada.site_operational_dashboard.section.v0",
  "section_id": "runtime-daemon",
  "title": "Runtime / Daemon",
  "purpose": "Show local runtime liveness and freshness without making process presence authority.",
  "row_order": ["daemon-process", "daemon-health"],
  "authority_limits": [
    "process_liveness_is_observation_not_authority"
  ]
}
```

### Section Summary

```json
{
  "section_id": "runtime-daemon",
  "row_count": 2,
  "attention_count": 1,
  "worst_state": "attention",
  "ready_count": 1,
  "unknown_count": 0
}
```

The summary is derived. It must not contradict row states.

### Row Provider

A row provider is a read-only adapter owned by the caller or Site-local package.

```ts
interface SiteDashboardRowProvider {
  provider_id: string;
  purpose: string;
  authority_inputs: string[];
  runtime_observations: string[];
  output_sections: string[];
  collect(context: SiteDashboardProviderContext): Promise<SiteDashboardRow[]>;
}
```

Provider rules:

- Providers may read files, DB projections, command outputs, or APIs only when
  the caller grants those coordinates.
- Providers must return bounded rows, not raw source objects.
- Providers must classify missing source data as `unknown`, `not_configured`,
  `stale`, `attention`, or `blocked`; they must not silently invent readiness.
- Providers must expose residuals when they use inference.
- Providers must not mutate state as part of collection.

### Renderer

The renderer accepts a validated snapshot and returns HTML or JSON. It does not
collect data itself.

Renderer requirements:

- escape all text;
- embed JSON with safe `</script>` handling;
- render state, basis, observed time, evidence refs, next action, and detail;
- provide section navigation and filtering for large snapshots;
- preserve machine-readable snapshot payload for publication or tests;
- avoid mutation controls by default;
- keep action controls separate from row observation.

## Default Generic Sections

The generic dashboard should support these sections. A Site may omit sections
with no provider, but omission must be visible in summary or generator metadata
when the section is expected by policy.

| Section | Purpose | Typical providers |
| --- | --- | --- |
| Site identity/loci | Declared Site id, authority locus, realization roots, evidence locus. | Site governance coordinates, file/root probes. |
| Authority boundaries | Task/inbox/outbox/effect authority, projection boundaries, mutation evidence locus. | Config readers, lifecycle projection readers. |
| Runtime/daemon | Runtime liveness, health, logs, supervisor status. | Doctor/readiness summaries, bounded process probes. |
| Agents | Active role carriers, roster, assignments, stale session hints. | Roster/read-only task lifecycle providers. |
| Task lifecycle | Open/claimed/in-review/closed counts, assignment consistency, reviews. | `narada task lifecycle status` or read-only exported projection. |
| Inbox/outbox | Received/promoted/pending inbox and outbound command posture. | Canonical inbox/outbox summaries. |
| Publication/telemetry | dirty/unexported/unpushed, Site telemetry publication posture. | Git status summary, publication evidence refs, Site registry projection rows. |
| Capabilities | Capability refs, credential binding posture, missing/stale/revoked grants. | Capability registry/preflight summaries; no raw values. |
| Operator attention | Derived attention rows and one bounded recommended next action. | Summary reducer over all rows. |
| Residuals/next action | Known residuals, blockers, and the safest next governed command. | Site posture/work-next providers. |

## Freshness

Freshness must be explicit per row or per provider. A recent dashboard render
does not make stale source evidence fresh.

Freshness states:

- `fresh`: source observation is inside its declared max age.
- `stale`: source observation is older than its declared max age.
- `event_bound`: source remains valid until a named transition invalidates it.
- `unknown`: source freshness cannot be established.
- `not_applicable`: static authority record or doctrine artifact.

Rows with stale or unknown freshness may still be useful, but they must not be
counted as live readiness proof.

## No-Secret Rule

The generator must redact or refuse secret-like material in:

- row labels;
- details;
- evidence refs;
- embedded JSON;
- HTML;
- live server responses;
- test fixtures.

Blocked patterns include raw token, password, client secret, access token,
authorization header, private key, and credential resolver output. Secret refs
and capability refs are allowed when they are references, not values.

## Publication And Telemetry

A dashboard snapshot may be published as a Site telemetry event only as a
projection. Publication must carry:

- snapshot schema and generator version;
- Site ref;
- generated time;
- bounded summary counts;
- dashboard URL if available;
- authority limits;
- output bounds proving raw values are excluded.

Publication does not move Site authority and does not grant the hosted registry
permission to mutate the Site.

## Tests Required For Implementations

Implementations must prove:

- snapshot validation accepts complete rows and rejects missing state/basis;
- section summaries and attention lists are derived correctly;
- renderer escapes text and safely embeds JSON;
- raw secret markers are absent from HTML and JSON output;
- missing authority config is not marked ready;
- provider output distinguishes `evidenced`, `inferred`, and `unknown`;
- live server, if present, is read-only and exposes no mutation endpoints;
- diagnostics/repair/intrusive controls are absent from primary rows by default.

## Next Implementation Boundaries

Later tasks may implement:

- a generic `@narada2/site-operational-dashboard` package;
- Narada proper row providers for task lifecycle, inbox, publication, and
  capability posture;
- CLI generation for static HTML reports;
- optional local live server;
- Site registry telemetry row integration.

Later tasks must not:

- copy Staccato-specific row providers into generic defaults;
- render raw secret values;
- mutate Site state from the dashboard package;
- claim that hosted dashboard freshness is Site readiness;
- replace canonical task, inbox, outbox, publication, or capability commands.
