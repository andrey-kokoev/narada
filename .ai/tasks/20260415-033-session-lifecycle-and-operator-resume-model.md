# Session Lifecycle and Operator Resume Model

## Context

Task 026 closes canonical identity, including session identity.

What remains is to define what a session means operationally and how operators or future human-in-the-loop flows can interpret and resume it without confusing session state with control truth.

## Goal

Define and implement a minimal operator-facing session model such that:

> execution sessions are observable, resumable in interpretation, and never mistaken for correctness state.

## Required Work

### 1. Define Session Lifecycle

State transitions at minimum:

- opened
- active
- idle
- completed
- abandoned
- superseded

Clarify relationship to:
- daemon process lifetime
- execution attempts
- work items
