---
status: opened
---

# Replace sonar root config.json placeholder with valid pointer

## Goal

Make D:/code/narada.sonar/config.json valid JSON declaring site_id sonar

## Context

first-time-user-flow incoherency sweep, slice 5. The root config.json was the literal text 'config/config.json', crashing plain JSON.parse consumers; the resolver survived only via its .narada fallback.

## Required Work

Replace placeholder text with a narada.site.pointer.v0 JSON declaring site_id sonar and pointing at .narada/config.json as authority.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] config.json parses as JSON and yields site_id sonar through the CLI site resolver
