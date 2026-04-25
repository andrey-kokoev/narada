# Task 085 — Freeze Observation Boundary Invariants

## Objective
Turn the new UI/observation/control split into a durable architectural law.

## Why
This tranche significantly improved authority safety and shell neutrality. The next regression risk is not missing functionality but future erosion of the newly restored boundaries. :contentReference[oaicite:3]{index=3}

## Required Changes
- Add architectural tests/lints/docs that assert:
  - generic observation types use neutral context/scope terminology
  - mailbox terms are confined to mailbox vertical modules and compatibility layers
  - control endpoints cannot be mounted into observation namespace
  - observation queries remain SELECT-only
  - UI shell stays kernel-first and vertical-neutral
- Extend AGENTS/docs with a short “do not regress these boundaries” section
- Add one grep-style regression test specifically for mailbox leakage in generic observation modules

## Acceptance Criteria
- CI fails on mailbox leakage into generic observation surfaces
- CI fails if control routes appear in observation namespace
- CI fails if generic UI shell regains mailbox-first framing
- Documentation states the invariant set clearly enough for coding agents to follow without reinterpretation

## Invariant
Once restored, observation/control neutrality must be mechanically guarded.