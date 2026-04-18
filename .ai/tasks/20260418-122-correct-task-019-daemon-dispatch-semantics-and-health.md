# Task 122: Correct Task 019 Daemon Dispatch Semantics And Health

## Why

Task 019 was implemented materially, but review found that several parts of its stated semantics and acceptance criteria were not actually completed.

The daemon now does run a dispatch phase after sync, but key pieces remain missing or divergent from the task's own contract:

- no implemented wake coalescing / wake priority model
- no retry-timer-aware sleep calculation
- health file does not expose the promised control-plane fields
- the daemon does not actually call `foreman.onSyncCompleted(signal)` as Task 019 specified; it uses fact admission directly and only synthesizes an empty signal for hook callbacks

This corrective task addresses those gaps explicitly.

## Goal

Bring the daemon dispatch implementation into coherence with the intended semantics from Task 019, or explicitly revise the contract in code and docs where the newer fact-driven design supersedes the older signal-based wording.

## Scope

This task must cover:

- daemon wake semantics
- retry-aware sleep/wake behavior
- control-plane health fields
- sync-completion signaling semantics
- tests for the corrected behavior

## Non-Goals

- Do not redesign the whole daemon architecture
- Do not remove the fact-driven dispatch approach if it is the correct newer model
- Do not reopen unrelated control-plane work

## Findings To Correct

### 1. Wake coalescing / priority semantics are missing

Task 019 required pending wake coalescing with priority ordering:

- `manual` > `webhook` > `retry` > `poll`

Current daemon loop only uses fixed polling sleep and retry backoff; there is no general pending-wake priority model.

### 2. Retry timer integration is missing

Task 019 required idle sleep to wake at:

- `min(polling_interval_ms, next_retry_at - now)`

Current loop sleeps on a fixed polling interval or backoff delay and does not inspect the next retryable work deadline.

### 3. Health file lacks control-plane fields

Task 019 required health fields such as:

- `openWorkItems`
- `leasedWorkItems`
- `failedRetryableWorkItems`
- `lastDispatchAt`

Current health file only reports sync counters.

### 4. Sync-completion signaling contract drift

Task 019 said the daemon should build `SyncCompletionSignal` from changed conversations and call `foreman.onSyncCompleted(signal)`.

Current implementation instead:

- reads unadmitted facts
- calls `foreman.onFactsAdmitted(...)`
- creates an empty `SyncCompletionSignal` only for dispatch hooks

If the fact-driven design is now canonical, the task must explicitly reconcile that contract drift instead of silently leaving the old acceptance criterion stale.

## Required Corrections

### 1. Implement Wake Priority Model

Add explicit daemon wake semantics with pending wake coalescing.

At minimum:

- represent wake reasons structurally
- coalesce pending wakes
- higher-priority wake replaces lower-priority pending wake
- integrate manual, webhook, retry, and poll wakes coherently

### 2. Implement Retry-Aware Idle Scheduling

The daemon must inspect the earliest runnable retry deadline and wake accordingly.

Expected behavior:

- if retryable work becomes runnable before the next poll interval, wake early
- do not rely only on the next full poll cycle to resume retryable work

### 3. Extend Health Surface With Control-Plane Data

Add the missing control-plane health fields and serialize them in the daemon health file.

At minimum include:

- open/runnable work count
- leased/executing work count
- failed-retryable work count
- last dispatch timestamp

If naming changes are needed, document them clearly and update any readers/tests.

### 4. Reconcile Signal Semantics

Choose one coherent path and implement/document it:

- either restore a real `onSyncCompleted(signal)` call with meaningful changed-context data, or
- formally update the design to say fact admission supersedes sync-completion signaling, and adjust hooks/contracts/tests accordingly

Silent divergence is not allowed.

### 5. Add Focused Tests

Add or update tests to cover:

- wake priority behavior
- retry-timer wake behavior
- health file control-plane fields
- whichever signal/admission semantics are chosen as canonical

## Deliverables

- explicit wake-priority mechanism in daemon runtime
- retry-aware sleep scheduling
- health file with control-plane visibility
- reconciled and documented sync-to-dispatch contract
- tests proving the corrected behavior

## Definition Of Done

- [ ] daemon wake handling has explicit priority/coalescing semantics
- [ ] retryable work can wake the daemon before the next normal poll interval
- [ ] health file includes control-plane dispatch/work-item fields
- [ ] sync-to-dispatch signaling semantics are no longer drifting between task/spec and implementation
- [ ] tests cover the corrected behaviors

## Notes

This is a corrective task for partial completion of Task 019. The current implementation already performs sync -> dispatch -> quiescence materially; this task closes the remaining semantic and operability gaps.
