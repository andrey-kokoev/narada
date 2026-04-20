# Task 235: Stuck-Work and Stuck-Outbound Detection

## Chapter

Operational Trust

## Why

The scheduler recovers stale leases mechanically, but it does not *alert* when work is piling up. A work item can sit in `opened` for days if the scheduler stops scanning. An outbound command can sit in `pending` forever if the worker registry is misconfigured. The operator has no way to know something is wrong without manually running `narada status` or checking the UI.

Operational trust requires that the system detect and surface its own stagnation.

## Goal

Add explicit detection for stuck work items and stuck outbound commands, surface the findings in health reporting and observation queries, and document the thresholds.

## Required Work

### 1. Stuck Work Item Detection

Add a detection pass that runs periodically (e.g., after each dispatch cycle or via a scheduled check):

| Condition | Threshold | Classification |
|-----------|-----------|----------------|
| `opened` for too long | > 1 hour without being leased | `stuck_opened` |
| `leased` for too long | > 2 × lease duration without completing | `stuck_leased` |
| `executing` for too long | > charter timeout + buffer | `stuck_executing` |
| `failed_retryable` with max retries reached | `retry_count >= maxRetries` and `next_retry_at` in the past | `stuck_retry_exhausted` |

Store detected stuck items in a new transient table or compute them on-demand via observation queries. Prefer on-demand computation to avoid mutable state.

Add observation queries:
- `getStuckWorkItems(store, thresholds)` — returns all work items matching stuck conditions
- `getStuckWorkItemSummary(store)` — returns counts by classification

### 2. Stuck Outbound Detection

Add detection for outbound commands:

| Condition | Threshold | Classification |
|-----------|-----------|----------------|
| `pending` for too long | > 15 minutes | `stuck_pending` |
| `draft_creating` for too long | > 10 minutes | `stuck_draft_creating` |
| `draft_ready` for too long | > 24 hours (awaiting operator) | `stuck_draft_ready` |
| `sending` for too long | > 5 minutes | `stuck_sending` |

Add observation queries:
- `getStuckOutboundCommands(outboundStore, thresholds)`
- `getStuckOutboundSummary(outboundStore)`

### 3. Surface in Health Reporting

Extend `HealthFileData` (from Task 234) with:

```typescript
interface HealthFileData {
  // ... existing fields ...
  stuck_items: {
    work_items: { classification: string; count: number }[];
    outbound_commands: { classification: string; count: number }[];
  };
}
```

### 4. Surface in `narada status`

Include stuck-item summary in CLI output:

```json
{
  "stuck": {
    "work_items": [{ "classification": "stuck_opened", "count": 2 }],
    "outbound_commands": [{ "classification": "stuck_draft_ready", "count": 1 }]
  }
}
```

### 5. Surface in Observation API

Add routes:
- `GET /scopes/:id/stuck-work-items`
- `GET /scopes/:id/stuck-outbound-commands`

### 6. Document Thresholds

Add threshold configuration to config schema:

```json
{
  "operational_trust": {
    "stuck_work_thresholds": {
      "opened_max_age_minutes": 60,
      "leased_max_age_minutes": 120,
      "executing_max_age_minutes": 30
    },
    "stuck_outbound_thresholds": {
      "pending_max_age_minutes": 15,
      "draft_creating_max_age_minutes": 10,
      "draft_ready_max_age_hours": 24,
      "sending_max_age_minutes": 5
    }
  }
}
```

## Non-Goals

- Do not add automatic remediation (retry, cancel, force-resolve). Detection only.
- Do not add alerting webhooks or external notifications.
- Do not add real-time streaming updates.
- Do not modify the scheduler or outbound worker logic.

## Acceptance Criteria

- [ ] Stuck work item detection query exists and covers all four conditions.
- [ ] Stuck outbound detection query exists and covers all four conditions.
- [ ] Health file includes stuck-item counts.
- [ ] `narada status` includes stuck-item summary.
- [ ] Observation API routes exist for stuck items.
- [ ] Thresholds are configurable via config.
- [ ] Task notes document default thresholds and rationale.

## Dependencies

- Tasks 228-232 (Live Operation chapter) must be complete. Detection requires work items and outbound commands to exist.
- Task 234 (Health/Readiness Contract) should precede or coincide with this task, as stuck-item data feeds into health reporting.

## Execution Notes

### Implemented

- **Stuck work item detection** (`packages/layers/control-plane/src/observability/queries.ts`):
  - `getStuckWorkItems(store, thresholds?, now?)` — on-demand SQL query covering `stuck_opened`, `stuck_leased`, `stuck_executing`, and `stuck_retry_exhausted`.
  - `getStuckWorkItemSummary(store, thresholds?, now?)` — aggregation by classification.
  - Default thresholds: `opened_max_age_minutes: 60`, `leased_max_age_minutes: 120`, `executing_max_age_minutes: 30`, `max_retries: 3`.

- **Stuck outbound detection** (`packages/layers/control-plane/src/observability/queries.ts`):
  - `getStuckOutboundCommands(outboundStore, thresholds?, now?)` — on-demand SQL query using `outbound_transitions` to determine status-entered time, covering `stuck_pending`, `stuck_draft_creating`, `stuck_draft_ready`, and `stuck_sending`.
  - `getStuckOutboundSummary(outboundStore, thresholds?, now?)` — aggregation by classification.
  - Default thresholds: `pending_max_age_minutes: 15`, `draft_creating_max_age_minutes: 10`, `draft_ready_max_age_hours: 24`, `sending_max_age_minutes: 5`.

- **Health file** (`packages/layers/control-plane/src/health.ts`):
  - Added optional `stuck_items` field to `HealthFileData` with the shape `{ work_items: { classification, count }[], outbound_handoffs: { classification, count }[] }`.
  - No readiness semantics introduced; the field is populated by callers that have DB access.

- **`narada status`** (`packages/layers/cli/src/commands/status.ts`):
  - `StatusReport` now includes `stuck` derived from `ControlPlaneStatusSnapshot`.

- **Observation API** (`packages/layers/daemon/src/observation/observation-routes.ts`):
  - `GET /scopes/:id/stuck-work-items` — returns `getStuckWorkItems()`
  - `GET /scopes/:id/stuck-outbound-commands` — returns `getStuckOutboundCommands()`

- **Config schema** (`packages/layers/control-plane/src/config/types.ts`, `schema.ts`, `load.ts`, `defaults.ts`):
  - Added `OperationalTrustConfig` with `stuck_work_thresholds` and `stuck_outbound_thresholds`.
  - Available per-scope; loader validates numeric thresholds with defaults.

- **Tests** (`packages/layers/control-plane/test/unit/observability/queries.test.ts`):
  - 10 new focused tests covering all 4 work-item conditions, all 4 outbound conditions, and both summary aggregations.

### Deviations / Rationale

- **Property naming (`outbound_handoffs` vs `outbound_commands`)**: The task example shows `outbound_commands`, but the kernel boundary (Task 087) forbids mailbox-era naming in generic modules. The internal type uses `outbound_handoffs` to align with the neutral durable table. The semantics are identical; only the key name differs. Task 246 normalized this consistently across `health.ts`, `daemon/src/lib/health.ts`, and CLI `status.ts`.
- **Thresholds are explicit, not derived**: The task mentions "2 × lease duration" and "charter timeout + buffer", but the implementation uses explicit config values. This avoids surprise behavior when runtime lease duration or charter timeout changes.
- **On-demand computation only**: No transient table or mutable state is written. Detection is pure SELECT over durable tables, consistent with the task's preference.

### Default Thresholds Rationale

| Threshold | Default | Rationale |
|-----------|---------|-----------|
| `opened_max_age_minutes` | 60 | One hour is long enough to absorb normal scheduler scan intervals (default 60s) plus startup delays, short enough to flag real stagnation. |
| `leased_max_age_minutes` | 120 | Default lease duration is 60s; 120 minutes provides generous headroom for slow charters while still catching abandoned leases that the scheduler missed. |
| `executing_max_age_minutes` | 30 | Charter default timeout is 5 min (300s); 30 minutes allows slow Graph API operations without false positives. |
| `max_retries` | 3 | Matches foreman and scheduler defaults. |
| `pending_max_age_minutes` | 15 | Outbound worker should pick up pending commands within one or two poll cycles. |
| `draft_creating_max_age_minutes` | 10 | Draft creation is a single Graph API call; 10 minutes indicates a hung worker or network partition. |
| `draft_ready_max_age_hours` | 24 | Draft ready awaits operator approval; 24 hours is a full business-day threshold. |
| `sending_max_age_minutes` | 5 | Sending is a lightweight Graph API mutation; 5 minutes flags a stuck worker. |

### Corrective Actions Applied (Post-Review)

1. **Daemon `.health.json` now includes stuck-item counts** (`packages/layers/daemon/src/lib/health.ts`, `packages/layers/daemon/src/service.ts`):
   - Added `stuck_items: { work_items: StuckItemHealthEntry[]; outbound_handoffs: StuckItemHealthEntry[] }` to `HealthStatus`.
   - `getDispatchHealth()` calls `getStuckWorkItemSummary()` and `getStuckOutboundSummary()` per scope.
   - `updateHealth()` aggregates stuck counts across all scopes and writes them into the health file.

2. **`createHealthWriter` propagates `stuck_items`** (`packages/layers/control-plane/src/health.ts`):
   - `markSuccess` and `markError` now preserve `previousData?.stuck_items` in the written health file.

3. **`DEFAULT_EXCHANGE_FS_SYNC_CONFIG` includes `operational_trust`** (`packages/layers/control-plane/src/config/defaults.ts`):
   - Default config object now carries `stuck_work_thresholds` and `stuck_outbound_thresholds`, so scopes created from defaults inherit explicit thresholds.

4. **Dedicated summary API routes added** (`packages/layers/daemon/src/observation/observation-routes.ts`):
   - `GET /scopes/:id/stuck-work-summary` — returns only `{ classification, count }[]`
   - `GET /scopes/:id/stuck-outbound-summary` — returns only `{ classification, count }[]`

5. **Test coverage for snapshot stuck integration** (`packages/layers/control-plane/test/unit/observability/queries.test.ts`):
   - Added `buildControlPlaneSnapshot includes stuck work items and outbound commands` test that seeds stuck state and asserts `snapshot.stuck` is populated.

## Acceptance Criteria

- [x] Stuck work item detection query exists and covers all four conditions.
- [x] Stuck outbound detection query exists and covers all four conditions.
- [x] Health file includes stuck-item counts.
- [x] `narada status` includes stuck-item summary.
- [x] Observation API routes exist for stuck items.
- [x] Thresholds are configurable via config.
- [x] Task notes document default thresholds and rationale.
