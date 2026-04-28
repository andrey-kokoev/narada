---
status: closed
depends_on: []
criteria_proved_by: builder
criteria_proved_at: 2026-04-28T23:45:11.066Z
criteria_proof_verification:
  state: unbound
  rationale: Docs now define Operator Surface as a first-class concept distinct from adapters, define AgentRuntime/ControlChannel/SessionBinding, preserve Site authority and plural embodiment/singular authority, include minimal field grammar and anti-collapse rules, connect to Site embodiments/resume/MCP/API/role bootstrap, and implement no adapter materializer or mutation behavior. pnpm verify passed after lifecycle export.
closed_at: 2026-04-28T23:45:19.254Z
closed_by: a2
governed_by: task_close:a2
closure_mode: peer_reviewed
---

# Task 1049 — Define Operator Surface doctrine

## Goal

Define Operator Surface, AgentRuntime, ControlChannel, and SessionBinding as a coherent inhabited-work topology while preserving Site authority, embodiment, and Intelligence-Authority Separation.

## Context

The Windows User Site proposal env_7b649a68 observed stable Windows Terminal titles, Komorebi targeting, YASB/AHK launch/focus paths, and recurring Narada role windows. The follow-up proposal env_903bef3d showed the missing adjacent topology: CLI agents are spatially embodied in terminal Operator Surfaces, while API agents may have no spatial surface but still act through transcripts, inbox envelopes, task files, logs, and console projections. The earned concept is not a terminal profile; it is a surface/channel/runtime/session topology for inhabited work. This task is doctrine/specification only.

## Required Work

1. Inventory existing Site embodiment, resume, console, and operator-loop language for surfaces that imply addressable UI/work loci.
2. Create or update concept documentation defining Operator Surface as a durable addressable interface for inhabiting or observing a Site/role/workflow.
3. Define adjacent concepts: AgentRuntime, ControlChannel, and SessionBinding.
4. State anti-collapse rules: an Operator Surface is not authority, not a Site, not an agent, not a runtime by itself, and not an effect capability; an AgentRuntime or ControlChannel does not gain authority by being bound to a surface.
5. Define minimal fields: surface id, site binding, role binding, embodiment, adapter kind, launch/focus identity, placement hints, recovery posture, authority limits, runtime id, control channel, and session binding continuity references.
6. Relate the concepts to Site embodiments, resume continuity, Operator loop, MCP/console surfaces, task/chapter machinery, API conversations, and role-specific bootstrap without requiring implementation yet.

## Non-Goals

- Do not implement Windows Terminal profile generation
- Do not add Komorebi/YASB integration
- Do not make surfaces authority-bearing
- Do not collapse API conversation threads into terminal Operator Surfaces

## Execution Notes

<!-- Record what was done, decisions made, and files changed during execution. -->

## Verification

<!-- Record commands run, results observed, and how correctness was checked. -->

## Acceptance Criteria

- [x] Docs define Operator Surface as a first-class concept distinct from adapters like Windows Terminal or Komorebi
- [x] Docs define AgentRuntime, ControlChannel, and SessionBinding and relate them to Operator Surface
- [x] Docs preserve Site authority and Plural Embodiment, Singular Authority
- [x] Docs define minimal field grammar and anti-collapse rules for surfaces, runtimes, channels, and bindings
- [x] Docs connect Operator Surface to Site embodiments and resume continuity
- [x] No adapter materializer, session registry, or CLI mutation behavior is implemented by this task
