---
status: confirmed
depends_on: [1433, 1463, 1474]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-17T21:07:10.252Z
criteria_proof_verification:
  state: bound
  verification_run_id: run_1779052025887_qpjqzg
closed_at: 2026-05-17T21:07:24.512Z
closed_by: narada.builder2
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Specify Site Registry relation publication command and MCP surface

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260517-1475-1481-separate-site-telemetry-from-site-registry.md

## Goal

Define the missing command surface for publishing a locally admitted Site Registry relation transition through registry-owner authority.

## Context

narada-andrey locally admitted a registry relation in principle but could not publish it because the existing tool surface is Site telemetry publication, not relation lifecycle publication. This task specifies the proper relation tool before implementation.

## Required Work

1. Define CLI command family, preferably separate from `site-telemetry`, such as `narada site-registry relation plan-transition` and `narada site-registry relation publish-transition`.
2. Define MCP tool names with dry-run default and explicit live-send posture.
3. Define input shape: registry URL, relation id, site id, subject site id, relation kind, transition, visibility/state, actor, capability ref, evidence refs, idempotency key.
4. Define credential posture: registry-owner/admin token is a capability reference resolved only at live transport time; raw tokens never appear in payloads, docs, logs, or MCP output.
5. Define refusal cases for missing local admission evidence, wrong actor kind, missing admin capability, unsupported transition, purge/delete, and stale relation state.
6. Define how narada-andrey local declaration evidence becomes input evidence without becoming remote registry authority.

## Non-Goals

- Do not implement the command in this task.
- Do not grant admin token access.
- Do not publish narada-andrey relation live.

## Execution Notes

- Added `docs/product/site-registry-relation-publication-surface.v0.md`.
- Specified CLI command family `narada site-registry relation plan-transition` and `narada site-registry relation publish-transition`, explicitly separate from `site-telemetry publish`.
- Specified MCP tools `site_registry_relation_plan_transition` and `site_registry_relation_publish_transition` with dry-run default and explicit live-send posture.
- Defined input shape, credential reference posture, refusal cases, output shape, and narada-andrey evidence use.
- Preserved authority boundary: narada-andrey local relation admission is input evidence, while registry-owner authority publishes the hosted relation transition.

## Verification

- `rg -n "plan-transition|publish-transition|site_registry_relation_plan_transition|site_registry_relation_publish_transition|credential_ref|Refusals|narada-andrey Evidence Use|site-telemetry publish|registry-owner" docs/product/site-registry-relation-publication-surface.v0.md` confirmed command/MCP names, credential posture, refusal cases, narada-andrey evidence use, and registry-owner distinction.
- `git diff --check -- docs/product/site-registry-relation-publication-surface.v0.md .ai/do-not-open/tasks/20260517-1478-specify-site-registry-relation-publication-command-and-mcp-s.md` passed.

## Acceptance Criteria

- [x] Command and MCP surface spec exists.
- [x] Authority and credential boundaries are explicit.
- [x] The spec distinguishes local Site admission from registry-owner publication.
