# Task Executability E2E and Recovery

This is the operator and developer runbook for the complete Task Executability Assessment path. The deterministic proof is the authority for the executable path and lifecycle/recovery contract; it is not a proof that the task, its implementation, or its business result is correct. The live provider proof is an explicitly opt-in integration check and is never required for ordinary package or Site Loop verification.

## Authority Map

- Task Lifecycle owns task snapshots, assessment requests, leases, attempts, admitted assessments, currency, and verdict truth.
- Delegated Task owns the bounded assessment workflow and strict task-linked dispatch gate.
- Worker Delegation owns provider, model, cognition, credential, and runtime binding.
- NARS may start the shared orchestrator immediately after task creation.
- Site Loop reconciles pending or expired requests when no NARS session exists.
- Neither NARS nor Site Loop invents or overwrites an assessment verdict.

## Proof Boundary

The evidence in this runbook has three distinct meanings:

- **Executable-path proof** — an admitted `executable` assessment says that the task packet can be attempted as written in the declared environment. It does not establish that the task is well-designed or that its requested result is correct.
- **Lifecycle/recovery proof** — the deterministic E2E proves request creation, assessment replacement, leasing, dispatch enforcement, restart/no-NARS recovery, identity preservation, and resource cleanup across the participating surfaces.
- **Task correctness** — whether the task's approach, implementation, output, or business result is correct remains task-specific. It requires the task's own acceptance tests, review, and operator judgment.

The deterministic command is therefore the closure gate for executable-path and lifecycle/recovery behavior, not a correctness proof. The optional live provider command adds evidence about a configured provider/model adapter and runtime path; it does not change the assessment verdict and does not prove task correctness.

## Deterministic Proof

Run from `D:\\code\\mcp-surfaces`:

```powershell
pnpm --filter @narada2/site-loop-mcp test:e2e:task-executability
```

The test creates a temporary Site, starts the real Task Lifecycle MCP child, and drives a deterministic delegated assessment port. It proves:

- task creation emits an asynchronous assessment request;
- a request with unresolved references is admitted as `needs_revision`;
- a corrected task replaces the stale assessment;
- concurrent leasing admits one executor;
- an expired dispatched attempt is recovered after restart without losing delegated/worker identity;
- a Site Loop pass recovers work when NARS was never created;
- strict task-linked dispatch is based on the current admitted assessment and refuses an unassessed task;
- SQLite handles are owned and closed by the process that opens them, so Windows cleanup is deterministic.

This test must not use sleeps to establish ordering or hide a connection-lifecycle defect. Its temporary root cleanup is part of the assertion.

## Optional Live Provider Proof

The live check is opt-in and bounded:

```powershell
$env:NARADA_E2E_WORKER_EXTERNAL_PROVIDER_LIVE = '1'
$env:NARADA_E2E_WORKER_PROVIDER_REGISTRY = 'D:\\path\\to\\worker-provider-registry.json'
$env:NARADA_E2E_WORKER_PROVIDER = 'openai-api' # optional; otherwise registry default_provider is used
$env:NARADA_E2E_WORKER_PROVIDER_API_KEY = '<secret>' # optional when the registry credential env is already present
pnpm --filter @narada2/worker-delegation-mcp test:e2e:external-provider
```

The registry path must be an explicit worker-runtime provider registry with schema `narada.carrier.provider_registry.v1`. The test resolves the provider's `cognition_defaults.low.model`, verifies that the model is in `available_models`, requires the OpenAI-compatible chat-completions adapter, and passes the selected provider/model through the Narada Agent Runtime Server worker path. It does not use the frozen migration fixture at `packages/invokable-intelligence-management/test/provider-registry.legacy-fixture.json`.

The test exits with:

- `0` for a bounded live pass;
- `2` with structured `status: "not_run"` when the live flag, registry, supported adapter, model, credential, or runtime prerequisite is absent;
- a non-2 failure for a real test or cleanup failure.

The optional timeout is controlled by `NARADA_E2E_WORKER_EXTERNAL_PROVIDER_TIMEOUT_MS` and clamped to 5-120 seconds. The test never prints credential values. A skip is evidence that the optional authority was not configured, not a provider verdict.

## Restart and Recovery

When NARS is absent, run one bounded Site Loop pass. When a request is leased but the process dies, let the lease expire and let Site Loop reconcile it. The persisted attempt retains the delegated task and worker identity needed to distinguish recovery from a fresh attempt. Do not delete the Task Lifecycle database or manually rewrite request state.

When a test or child process reports SQLite `EBUSY`/cleanup failure:

1. stop the process that owns the Task Lifecycle store;
2. close the store through its owner boundary;
3. checkpoint/close any transaction-owned handles;
4. rerun the deterministic proof;
5. treat a remaining lock as a lifecycle defect, not as a reason to add a delay.

## Related Contracts

- Concept: `docs/concepts/task-executability-assessment.md`
- NARS: `docs/concepts/nars-runtime-contract.md`
- Site Loop: `docs/concepts/site-operating-loop.md`
- Task Lifecycle policy: `docs/concepts/task-lifecycle-role-enforcement-policy.md`
- Operator recovery: `docs/product/operator-console-runbook.md`
- Site Loop implementation: `packages/site-loop-mcp/README.md`
- Task Lifecycle implementation: `packages/task-lifecycle-mcp/README.md`
- Delegated Task implementation: `packages/delegated-task-mcp/README.md`
- Worker provider/live proof: `packages/worker-delegation-mcp/README.md`

The deterministic command is the normal closure gate. The live command is a separate operator-controlled integration check and must never be made an implicit dependency of local development or CI.
