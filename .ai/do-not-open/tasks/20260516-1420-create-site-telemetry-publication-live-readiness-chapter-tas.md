---
status: closed
depends_on: [1385]
criteria_proved_by: narada.architect
criteria_proved_at: 2026-05-16T22:08:59.947Z
criteria_proof_verification:
  state: unbound
  rationale: Seed task criteria are proven by commissioned follow-on chapter 1421-1430, chapter status/read evidence, and lifecycle snapshot export; this task created no live deployment, Site config mutation, raw secret, commit, or push.
closed_at: 2026-05-16T22:09:32.821Z
closed_by: narada.architect
governed_by: task_close:narada.architect
closure_mode: peer_reviewed
---

# Create Site Telemetry Publication live-readiness chapter tasks

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1420-1420-site-telemetry-publication-live-readiness.md

## Goal

Turn the critically examined plan into an ordered executable chapter for Site Telemetry Publication live readiness without letting Cloudflare infrastructure become the organizing authority.

## Context

The previous plan was directionally useful but too quick to collapse Site Telemetry Publication, SiteRegistry read model, and Cloudflare realization. This seed task must create the real chapter tasks from the corrected shape: define the publication/admission/read-model boundary first, audit repo evidence, then only later prepare Cloudflare resources, deployment gates, live deploy, smoke verification, and separate Site config connection.

## Required Work

1. Read docs/product/site-telemetry-publication.md, docs/product/site-telemetry-readiness.v0.md, docs/deployment/cloudflare-site-materialization.md, and relevant task evidence from the 1385-1419 Site Telemetry Publication work.
2. Define the chapter boundary explicitly: Site Telemetry Publication as the chapter, SiteRegistry as one read-model component, and Cloudflare as one realization.
3. Create ordered follow-on tasks that cover admission semantics, minimum live slice, repo publication audit, Cloudflare coordinate/secret posture, resource binding replacement, deploy preflight, operator-gated live deploy, post-deploy smoke verification, and separate Site config connection.
4. Ensure each created task has concrete required work, non-goals, acceptance criteria, and dependencies that prevent premature live deployment before authority/admission semantics and repo evidence are settled.
5. Leave live Cloudflare deployment, Site config mutation, secret creation, and broad federation out of this seed task.

## Non-Goals

- Do not deploy to Cloudflare.
- Do not mutate live Site configuration.
- Do not create or record raw secrets.
- Do not claim that SiteRegistry is the whole Site Telemetry Publication structure.
- Do not bulk-commit or push the dirty worktree.

## Execution Notes

Created the seed chapter from `.ai/tmp/site-telemetry-publication-live-readiness-chapter.json`, then used the seed task to commission the ordered follow-on chapter from `.ai/tmp/site-telemetry-publication-live-readiness-followon.json`.

The follow-on chapter covers tasks 1421-1430. It keeps Site Telemetry Publication as the chapter boundary, SiteRegistry as a read-model component, and Cloudflare as a realization. Deployment-capable tasks are gated behind semantic boundary, route/storage contract, repo publication audit, coordinate/secret posture, binding replacement, and green preflight. Site config connection is a separate later task after post-deploy smoke evidence.

No live Cloudflare deploy, Site config mutation, raw secret recording, commit, or push was performed.

## Verification

- `narada chapter commission --input .ai/tmp/site-telemetry-publication-live-readiness-chapter.json --dry-run --format json` passed; previewed seed chapter 1420 with no mutation.
- `narada chapter commission --input .ai/tmp/site-telemetry-publication-live-readiness-chapter.json --format json` passed; created chapter 1420-1420 and opened task 1420.
- `narada chapter status 1420-1420 --format json` passed; chapter state was shaped before seed execution.
- `narada chapter status 1385-1419 --format json` passed; prior Site Telemetry Publication chapter showed 35 closed tasks.
- `narada chapter commission --input .ai/tmp/site-telemetry-publication-live-readiness-followon.json --dry-run --format json` passed; previewed follow-on tasks 1421-1430 with no mutation.
- `narada chapter commission --input .ai/tmp/site-telemetry-publication-live-readiness-followon.json --format json` passed; created follow-on chapter 1421-1430.
- `narada task lifecycle export --output .ai/task-lifecycle-snapshot.json` passed after commissioning.

## Acceptance Criteria

- [x] A follow-on ordered task chapter exists for Site Telemetry Publication live readiness.
- [x] The created tasks encode Site Telemetry Publication, SiteRegistry read model, and Cloudflare realization as distinct components.
- [x] Deployment tasks are dependency-gated behind admission semantics, evidence audit, and coordinate/secret posture tasks.
- [x] No live Cloudflare deployment, Site config mutation, raw secret recording, bulk commit, or push occurs during this seed task.
