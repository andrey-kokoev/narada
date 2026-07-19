---
status: opened
---

# Make process-launch-posture baseline writes content-stable

## Goal

Stop perpetual dirty churn of scripts/process-launch-posture-baseline.json

## Context

first-time-user-flow incoherency sweep, slice 2. --update-baseline always rewrote the baseline with a fresh generated_at even when entries were identical.

## Required Work

Skip the baseline write when scanned entries deep-equal the existing baseline entries; refresh the baseline to current scan.

## Non-Goals

- Do not expand scope beyond this task.
- Do not create derivative task-status files.
- Do not mutate live external systems unless explicitly authorized.

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [ ] Second consecutive --update-baseline run reports unchanged and leaves git tree clean
- [ ] Guard check mode still passes
