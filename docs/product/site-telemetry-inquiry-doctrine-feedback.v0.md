# Site Telemetry Inquiry Doctrine Feedback v0

`site_telemetry_inquiry_doctrine_feedback.v0` specifies how Site Telemetry
Publication work preserves ontology pressure before Inquiry Space machinery is
available.

This contract does not implement Inquiry Space storage, change canonical
doctrine, or create implementation work by itself. It defines the intake
artifact a Site may use to carry a telemetry inquiry branch into a future
Inquiry Space substrate, or into Canonical Inbox as an explicit fallback.

## Purpose

Site Telemetry Publication exposed pressure that was not just a deployment task:
the work needed names and boundaries for SiteRegistry, Site telemetry
publication, hosted surfaces, publication edges, and inquiry/doctrine feedback.

That pressure must not disappear into chat memory, and it must not be promoted
directly into doctrine or implementation because it feels coherent. The intake
artifact keeps the branch provisional while preserving enough provenance for a
future agent or Inquiry Space tool to replay it.

## Artifact Families

The contract covers three related artifact families:

- `inquiry_branch_candidate.v0`: a bounded question branch with frontier,
  branch point, evidence, and traversal posture.
- `doctrine_lift_candidate.v0`: a candidate doctrine change with lift criteria,
  re-instantiation cases, and explicit non-canonical status.
- `concept_lifecycle_candidate.v0`: a proposed lifecycle entry for a concept
  that should have status, admission evidence, dependencies, and residuals.

An artifact may contain one or more of these families, but it must name which
family is being submitted and what authority it requests.

## Intake Shape

Required fields:

- `schema`: `narada.site_telemetry.inquiry_doctrine_feedback.v0`;
- `artifact_id`;
- `origin`: source chapter, task numbers, source refs, and authoring agent;
- `target_locus`: intended authority locus, normally `inquiry_space` or
  `canonical_inbox_fallback`;
- `target_inquiry_space_ref`: known tool or Site reference, or `null`;
- `artifact_family`;
- `question`: the bounded question or pressure statement;
- `branch_topology`: branch point, open branches, closed branches, residuals,
  and traversal posture;
- `candidate`: proposed concept or doctrine lift name, status, relation to
  existing doctrine, and lift criteria;
- `evidence_refs`: tasks, docs, decisions, and source envelope refs;
- `non_data_lift`: confirms the artifact carries machinery/structure only, not
  private Inquiry Space data;
- `fallback_posture`: what to do when Inquiry Space machinery is unavailable;
- `closure_expectations`;
- `authority_limits`.

## Admission Rules

The artifact is inert on arrival. Admission may record a candidate, route it to
Inquiry Space, or create a later implementation task, but those are separate
governed crossings.

Admission must preserve these boundaries:

- an inquiry branch is not a task until a taskification crossing is admitted;
- a doctrine lift candidate is not canonical doctrine until doctrine admission;
- a concept lifecycle candidate is not lifecycle authority until a lifecycle
  substrate admits it;
- a Canonical Inbox fallback envelope is visibility and routing evidence, not
  Inquiry Space storage;
- a non-data lift request may ask for tools, schema, commands, or fixtures, but
  must not copy private Inquiry Space content.

## Fallback Posture

When Inquiry Space machinery is unavailable, the branch may be stored as a
Canonical Inbox envelope or task evidence with explicit limitation:

```text
fallback_posture.state = "inbox_fallback_only"
fallback_posture.limitation = "not_queryable_inquiry_topology"
```

The fallback artifact must include the source envelope ids or task refs that
caused it, and the later replay task must treat it as a candidate to be imported
or re-authored through the admitted Inquiry Space surface. It must not report
the branch as already recorded in Inquiry Space.

## Closure And Evidence

Closure requires evidence for one of these outcomes:

- `submitted_to_inquiry_space`: the admitted machinery accepted the candidate;
- `recorded_as_inbox_fallback`: the candidate was preserved with explicit
  fallback limitation;
- `promoted_to_task`: the branch became a well-formed task through task
  lifecycle;
- `promoted_to_doctrine_candidate`: the branch entered doctrine review without
  becoming canonical;
- `residualized`: the branch remains real but not actionable under the current
  decision context.

Every closure record must identify the target locus and evidence refs. A claim
that private Inquiry Space data was lifted is invalid for this contract.

## Fixtures

- `docs/product/fixtures/site-telemetry-inquiry-doctrine-feedback/inquiry-branch-candidate.json`
- `docs/product/fixtures/site-telemetry-inquiry-doctrine-feedback/doctrine-lift-candidate.json`
- `docs/product/fixtures/site-telemetry-inquiry-doctrine-feedback/inbox-fallback-candidate.json`

## Residual Implementation Tasks

- Implement doctrine grounding MCP lift package for telemetry inquiries.
- Replay the Site Telemetry Publication branch through admitted Inquiry Space
  machinery after the lift exists.
- Decide whether concept lifecycle status belongs in Inquiry Space, a separate
  lifecycle substrate, or both.
