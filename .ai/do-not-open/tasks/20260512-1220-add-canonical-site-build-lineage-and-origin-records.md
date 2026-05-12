---
status: closed
closed_at: 2026-05-12T19:01:26.507Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: operator_direct
---

# Add canonical Site build lineage and origin records

## Chapter

Canonical Inbox Promotions

## Goal

Narada has Site provenance doctrine and partial governance coordinates, but ordinary Site bootstrap does not consistently emit an authority-bearing who-built-me record. The missing concept is stronger than human builder metadata: Narada should track Site build lineage, including which Narada Site governed or initiated creation of another Site, which operator and agent principals participated, what runtime/template/source commit was used, and what authority basis made the build admissible.

## Context

Source inbox envelope: env_653b3570-94dc-4f86-9110-183a60f393c0

Source: agent_report:site-build-lineage-20260428

Envelope kind: observation

Summary: Narada has Site provenance doctrine and partial governance coordinates, but ordinary Site bootstrap does not consistently emit an authority-bearing who-built-me record. The missing concept is stronger than human builder metadata: Narada should track Site build lineage, including which Narada Site governed or initiated creation of another Site, which operator and agent principals participated, what runtime/template/source commit was used, and what authority basis made the build admissible.

Evidence:
- Site provenance lineage doctrine defines site.created and related events with principal, evidence_refs, occurred_at, and authority_effect, but current user/client Site configs do not consistently reference a site.created event.
- Windows User Site and Staccato Site configs contain linked_sites, operator/context notes, and absorption records, but not a canonical origin event or builder-Site relation.
- Recent inhabited onboarding produced multiple Sites and cross-Site proposals, making it important to know which Site built or governed which other Site without implying ownership or authority transfer.

Proposal:
- Make Site bootstrap always emit an append-only site.created or site.built lineage event before or alongside config materialization.
- Record builder Site relation explicitly: builder_site_ref, built_site_ref, build_method, authority_effect, authority_basis, operator_principal, agent_principal, builder_runtime, source_material, evidence_refs, residuals, and occurred_at.
- Add config projection fields that reference the authoritative lineage event, e.g. origin.lineage_event_ref or governance.lineage_source.path, without making mutable config the source of truth.
- Distinguish construction influence from ownership: builder Site built or governed creation, but does not own target Site unless a separate site.authority_transferred event exists.
- Add CLI/bootstrap tests proving client/project/user/pc Site initialization writes lineage events and that doctor warns when a Site lacks origin/build lineage evidence.
- Add docs language for Site build lineage as a first-class relation: builder Site --site.built--> built Site, with operator/agent/runtime/template evidence attached.

Recommendation: Promote to execution task/chapter because Site proliferation without build lineage will make future absorption, split, clone, and reconstruction incoherent.

## Required Work

0. Source summary: Narada has Site provenance doctrine and partial governance coordinates, but ordinary Site bootstrap does not consistently emit an authority-bearing who-built-me record. The missing concept is stronger than human builder metadata: Narada should track Site build lineage, including which Narada Site governed or initiated creation of another Site, which operator and agent principals participated, what runtime/template/source commit was used, and what authority basis made the build admissible.
1. Read source inbox envelope env_653b3570-94dc-4f86-9110-183a60f393c0 and preserve its authority context.
2. Identify the owning Narada authority boundary before mutating any target state.
3. Implement the smallest local change that satisfies the promoted request.
4. Verify the result with focused tests or command evidence appropriate to the changed surface.
5. Report residuals explicitly before closure.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

Implemented canonical greenfield Site origin/build lineage for `narada sites create`.

- `narada sites create` skeleton execution now writes `.narada/lineage/events/site-created-*.json` as a local append-only `site.created` origin event.
- The lineage event records `builder_site_ref`, `built_site_ref`, `build_method`, `authority_effect`, `authority_basis`, `operator_principal`, `agent_principal`, `builder_runtime`, `source_material`, `evidence_refs`, `residuals`, `occurred_at`, and explicit non-transfer/source-import posture.
- `.narada/site.json` and `config.json` now project `origin.lineage_event_ref` and `origin.lineage_event_path`; the lineage event remains the authority-bearing record.
- The admission ledger seed event records the lineage event ref.
- Dry-run planned files now include the lineage event artifact.
- Site doctor now warns when config does not reference a readable origin/build lineage event.
- Site provenance docs now state that greenfield create writes a local `site.created` event and projects its ref into local config/seed records.

Changed files:
- `packages/layers/cli/src/commands/sites.ts`
- `packages/layers/cli/test/commands/sites-create.test.ts`
- `docs/product/site-provenance-lineage.md`
- `.ai/do-not-open/tasks/20260512-1220-report.json`

## Verification

- `pnpm --dir packages/layers/cli test test/commands/sites-create.test.ts` passed: 22 tests.
- `pnpm --dir packages/layers/cli typecheck` passed.
- `pnpm --dir packages/layers/cli build` passed.

## Acceptance Criteria

- [x] Proposal handled: Make Site bootstrap always emit an append-only site.created or site.built lineage event before or alongside config materialization.
- [x] Proposal handled: Record builder Site relation explicitly: builder_site_ref, built_site_ref, build_method, authority_effect, authority_basis, operator_principal, agent_principal, builder_runtime, source_material, evidence_refs, residuals, and occurred_at.
- [x] Proposal handled: Add config projection fields that reference the authoritative lineage event, e.g. origin.lineage_event_ref or governance.lineage_source.path, without making mutable config the source of truth.
- [x] Proposal handled: Distinguish construction influence from ownership: builder Site built or governed creation, but does not own target Site unless a separate site.authority_transferred event exists.
- [x] Proposal handled: Add CLI/bootstrap tests proving client/project/user/pc Site initialization writes lineage events and that doctor warns when a Site lacks origin/build lineage evidence.
- [x] Proposal handled: Add docs language for Site build lineage as a first-class relation: builder Site --site.built--> built Site, with operator/agent/runtime/template evidence attached.
- [x] Recommendation addressed or explicitly rejected: Promote to execution task/chapter because Site proliferation without build lineage will make future absorption, split, clone, and reconstruction incoherent.
