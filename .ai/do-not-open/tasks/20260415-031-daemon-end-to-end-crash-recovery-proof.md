# Daemon End-to-End Crash Recovery Proof

## Context

Task 024 establishes crash/replay determinism for the live runtime path.

That still needs to be proven at the full daemon level under realistic restart conditions, not only at component boundaries.

## Goal

Demonstrate that:

> a daemon process may crash at any critical point in the mailbox-agent loop and, after restart, the system converges to one correct durable state without duplicate effects.

## Required Work

### 1. Build Crash Injection Harness

Introduce a daemon integration harness that can force stop/restart at controlled points:

- after sync completion
- after work open
- after lease acquisition
- after execution start
- after tool execution
- after outbound command insert
- before work resolution commit

### 2. Define Recovery Assertions

For each crash point, assert:

- final work_item state
- lease release / stale recovery behavior
- execution_attempt status
- evaluation persistence behavior
- outbound_command uniqueness
- absence of duplicate side effects

### 3. Prove Convergence

Tests must show that repeated restart cycles converge.

Not:
- “usually works”
But:
- deterministic terminal state after replay/recovery

### 4. Include Tool Path

At least one crash scenario must include a real tool execution path so the tool side-band does not escape recovery guarantees.

### 5. Include Supersession

At least one scenario must include:
- crash
- new inbound message arrives
- older work is superseded after restart

## Invariants

1. Restart never creates duplicate outbound effects.
2. Restart never revives abandoned authority incorrectly.
3. Recovery is driven by durable state only.
4. Supersession after restart is deterministic.
5. Tool execution path remains subordinate to recovery rules.
