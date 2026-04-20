# Task 286: Operator Live-Loop Ergonomics

## Chapter

Operation Realization

## Context

Even with a runnable operation, Narada still needs a short, obvious operating loop for day-to-day use. The system already has inspection and audit surfaces, but they are not yet shaped into one coherent live-operator rhythm.

## Goal

Make the minimal operator loop for a live operation obvious, short, and durable.

## Required Work

### 1. Define The Core Operator Loop

Express the minimal loop clearly:

- is it healthy?
- what happened?
- what needs attention?
- what draft/proposal exists?
- what should the operator do next?

### 2. Align Surfaces To The Loop

Shape CLI/UI/runbook surfaces so they support that loop directly rather than requiring the operator to assemble it from many commands.

### 3. Live-Operation Runbook

Document the normal operating rhythm and the minimal troubleshooting rhythm for a live operation.

## Non-Goals

- Do not redesign every UI surface.
- Do not build fleet dashboards.

## Acceptance Criteria

- [ ] A minimal live-operator loop is explicitly defined.
- [ ] Existing CLI/UI surfaces are aligned around that loop.
- [ ] A runbook exists for normal operation and first troubleshooting steps.
