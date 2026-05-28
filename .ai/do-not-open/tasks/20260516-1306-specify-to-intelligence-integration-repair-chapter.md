---
status: confirmed
depends_on: [1301, 1302, 1303, 1304, 1305]
closed_at: 2026-05-16T00:40:22.091Z
closed_by: narada.architect
governed_by: chapter_close:narada.architect
closure_mode: peer_reviewed
---

# Specify to-intelligence integration repair chapter

## Chapter

D:\code\narada\.ai\do-not-open\tasks\20260516-1306-1313-narada-native-carrier-future-chapter-commissioning.md

## Goal

Create a structured chapter proposal that turns the rejected provider adapter work into an executable repair chapter without duplicating active task 1301.

## Context

Tasks 1301-1305 were rejected because provider registration is readiness-visible but not reachable from the normal Narada-native carrier task execution path. This task produces the next chapter specification or amendment handoff for that repair.

## Required Work

1. Inspect review findings on tasks 1301-1305 and the current state of task 1301 before proposing any new build tasks.
2. Define the smallest ordered repair chapter needed to wire provider selection into the governed work-loop or task-handoff path.
3. Include tasks for preserving provider output as inert handoff evidence and for proving the fixture fallback still works.
4. Represent the result as structured chapter input or an explicit no-new-chapter rationale if the active 1301-1305 tasks already cover the repair.
5. Submit the chapter proposal through a governed handoff for Architect commissioning.

## Non-Goals

- Do not create duplicate build tasks that race active task 1301.
- Do not bypass provider capability references or store raw provider secrets.
- Do not perform live provider calls as part of chapter specification.

## Execution Notes

- Inspected the rejected-review gap for tasks 1301-1305: provider adapter registration was readiness-visible but normal `runGovernedTaskHandoff` still entered the fixture work loop and never dispatched to `executeProviderAdapter` by registered `provider_kind`.
- Read back the current state of tasks 1301-1305 after repair. All five are now `confirmed` with accepted Architect reviews and governed closure.
- No new repair chapter should be commissioned. The exact gap named in this task has already been repaired in active tasks 1301-1305:
  - 1301 wired persisted non-fixture provider registrations into the governed handoff/work-loop path, preserved inert provider output evidence, and proved fixture fallback still works.
  - 1302-1305 confirmed Kimi, OpenAI, Anthropic, and OpenRouter provider adapters behind the repaired shared path.
- Creating another chapter now would duplicate completed work and risk racing the already confirmed repair. Residual future work should proceed only from new, non-duplicative gaps.

## Verification

- `narada task read 1301 --format json` showed status `confirmed`, latest Architect review `accepted`, and closure governed by `chapter_close:narada.architect`.
- `narada task read 1302 --format json` showed status `confirmed`, latest Architect review `accepted`, and closure governed by `chapter_close:narada.architect`.
- `narada task read 1303 --format json` showed status `confirmed`, latest Architect review `accepted`, and closure governed by `chapter_close:narada.architect`.
- `narada task read 1304 --format json` showed status `confirmed`, latest Architect review `accepted`, and closure governed by `chapter_close:narada.architect`.
- `narada task read 1305 --format json` showed status `confirmed`, latest Architect review `accepted`, and closure governed by `chapter_close:narada.architect`.

## Acceptance Criteria

- [x] The proposal names the exact current gap from the rejected reviews.
- [x] The proposed tasks are ordered and do not duplicate active claimed work.
- [x] The proposal preserves Intelligence-Authority Separation and inert output admission.
- [x] The handoff is ready for chapter commission or explicitly explains why no new chapter should be created.
