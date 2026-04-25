# Task 117: Establish `operation` As The Primary User-Facing Term

## Why

Narada currently lacks one stable user-facing word for the thing a user is trying to set up and run.

Competing words have appeared implicitly:

- agent
- workspace
- instance
- deployment
- setup
- scope

That drift is harmful because these words are not interchangeable.

The strongest candidate is `operation`.

It fits the real user intent:

- a mailbox operation
- a workflow operation
- a webhook operation
- a support operation spanning multiple mailboxes

It also separates the user-facing concept from internal implementation terms such as `scope`.

## Goal

Document and adopt `operation` as the primary user-facing term for the live configured thing a user wants Narada to perform.

## Core Semantic Decision

Use:

- `operation` for the user-facing configured live arrangement
- `ops repo` or `operations repo` for the private repo containing one or more operations
- `mailbox operation`, `workflow operation`, `webhook operation` for typed variants

Keep:

- `scope` as the internal technical/config/runtime term
- `charter` as the policy/intelligence role within an operation
- `posture` as the action-permission stance of an operation

## Required Documentation Outcome

Document, briefly and normatively, that:

- users set up and run operations
- Narada compiles operations into scopes and lower-level runtime/control-plane objects
- `scope` is not the primary user-facing word
- `agent` is not the preferred umbrella word for this concept

## Scope

This task should update the semantic framing in the most authoritative places, likely:

- root `AGENTS.md`
- first-run / quickstart docs
- Task 114 and Task 115 terminology if needed

It should not require a wide repo-wide wording rewrite in one pass, but it must establish the canonical term clearly enough that future work uses it consistently.

## Non-Goals

- Do not rename every historical occurrence immediately
- Do not force `operation` into low-level implementation APIs where `scope` is correct
- Do not re-open taxonomy design

## Deliverables

- short normative semantic note committed
- authoritative docs distinguish `operation` vs `scope`
- future user-facing tasks/docs have a stable term to use

## Definition Of Done

- [ ] `operation` is explicitly documented as the primary user-facing term
- [ ] `scope` is explicitly retained as the internal technical term
- [ ] docs no longer leave the reader guessing between `agent`, `instance`, `workspace`, and `operation`
- [ ] the semantic distinction is short, clear, and easy to reuse in later CLI/docs work
