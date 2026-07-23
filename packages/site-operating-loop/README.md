# @narada2/site-operating-loop

Shared Site Operating Loop substrate for Narada Sites.

This package owns the reusable storage operations for loop runs, steps, locks,
health, pause/resume control, attention records, and directive outcomes. Its
public records use canonical `narada.site_operating_loop.*` schemas. It also
owns generic policy loading, merging, validation, and quiet-hours evaluation. It
owns a generic runtime host that can repeatedly execute bounded loop runs from a
Site-provided step factory. It does not own a Site's source adapters, resident
agent identity, or concrete loop steps.

Site-specific code is expected to:

- open the Site-local task lifecycle SQLite database using that Site's DB
  discipline;
- call `ensureSiteLoopTables(db)`;
- load policy with `loadSiteOperatingLoopPolicy()` or wrap it with
  Site-specific defaults;
- compose source-specific loop steps;
- pass the resulting store into the exported run/status/control helpers.

The generic default policy prefers `narada-agent-runtime-server` and leaves
carrier fallback unset and disabled. A Site host must explicitly name and
enable any fallback; this package validates that declaration but does not
select or launch carriers.

For simple loops, use `runSiteOperatingLoop()` from `@narada2/site-operating-loop/runner`.
For hosted loops, use `startSiteOperatingLoopRuntime()` from `@narada2/site-operating-loop/runtime`.
For mature loops that need custom branching or domain-specific reconciliation,
compose directly with the store helpers.

The package CLI can host a generic loop when given both a store module and a Site
loop module:

```sh
narada-site-loop run --store-module ./site-loop-store.mjs --loop-module ./site-loop.mjs --loop-id site.loop --once
```

The store module must export `openSiteLoopStore(siteRoot)`. The loop module must
export `createSiteOperatingLoopSteps(context)` or `createSteps(context)`, returning
the concrete steps for the current runtime cycle. It may also export
`prepareSiteOperatingLoopRun(context)` or `prepareRun(context)` to materialize
cycle-local context once before step creation. This preserves Site authority:
the runtime owns cadence, pause checks, locking, run/step recording, health, and
event projection; the Site owns source adapters, policy interpretation beyond the
generic policy shape, and emitted effects.

The loop module contract is validated by `@narada2/site-operating-loop/loop-module`.
Each returned step must be an object with `stepId` and an optional `execute()`
function. `execute(context)` receives loop/run/step ids, dry-run state, prior
steps, and prior results by step id. `inputRefs`, `outputRefs`, and `evidence`
functions receive `(result, context)`. Optional `prepareSiteOperatingLoopRun()` and
`summarizeSiteOperatingLoopRun()` hooks let a Site preserve domain lineage while
the generic runtime records the durable run shape. A Site migrating from a legacy
bespoke loop may temporarily materialize a legacy run once and expose its internal
phases as generic runtime-recorded phase steps with stable ids, lineage refs,
evidence, and status. The durable generic run should not contain a single opaque
legacy-wrapper step as a normal loop phase.

## Runtime host authority

`startSiteOperatingLoopRuntime()` hosts one Site Operating Runtime Host. The
host is a first-class authority boundary, not just a timer: it persists a
logical `runtime_id`, an `authority_epoch`, an owner lease, and the lifecycle
`created -> binding -> ready -> serving -> closing -> stopped` (with explicit
failure cleanup). A live unexpired host lease refuses a second supervisor for
the same loop. A stopped or failed host can be reclaimed while retaining its
logical runtime id and incrementing the authority epoch.

The host lifecycle is distinct from a bounded Loop Run lifecycle and from the
NARS Agent Runtime Server. NARS owns agent sessions, turns, providers, MCP, and
agent projections; this package owns Site loop cadence, trigger admission,
bounded runs, and loop evidence. Site-specific supervisors remain adapters and
must not introduce a competing generic host authority.

The host state is available through `status.runtime_host` and
`health.runtime_host`. Host claims and lifecycle transitions are durable
`narada.site_operating_loop.runtime_event.v1` records with stable event ids, so
CLI, HTTP/SSE, schedulers, and future UI projections can replay the same
authority evidence. The host-claim operation returns a structured receipt with
the claimed host snapshot and its persisted claim event, and the runtime
projects that receipt through `onEvent` before binding begins.

For long-running hosts, `--runtime-lease-ttl-ms` controls the owner lease
duration. The runtime heartbeats the lease while serving and refuses to continue
after authority loss.

Runtime events are recorded durably as `narada.site_operating_loop.runtime_event.v1`
records and can be read back with:

```sh
narada-site-loop events --store-module ./site-loop-store.mjs --loop-id site.loop
narada-site-loop health --store-module ./site-loop-store.mjs --loop-id site.loop
```

Triggers can be admitted generically and consumed by the next active runtime
cycle:

```sh
narada-site-loop trigger --store-module ./site-loop-store.mjs --loop-id site.loop --kind operator_request
narada-site-loop triggers --store-module ./site-loop-store.mjs --loop-id site.loop
```

Observation clients can attach through the generic HTTP server:

```sh
narada-site-loop serve --store-module ./site-loop-store.mjs --loop-id site.loop --port 8787
```

For a single standing process that hosts both the runtime loop and HTTP
attachment surface, use:

```sh
narada-site-loop supervise --store-module ./site-loop-store.mjs --loop-module ./site-loop.mjs --loop-id site.loop --port 8787
```

Long-running service supervisors should add `--jsonl-events`. In that mode,
`supervise` emits a `narada.site_operating_loop.supervisor_started.v1` line as
soon as the HTTP attachment server is listening, then emits durable runtime event
records as JSONL. This gives scheduled tasks and service wrappers immediate
startup evidence instead of waiting for a forever runtime to exit.

The server exposes `GET /health`, `GET /status`, `GET /events`,
`GET /events/stream`, `GET /triggers`, `GET /runs`, and `GET /runs/:run_id`.
It also exposes generic write-side controls: `POST /triggers`,
`POST /control/pause`, and `POST /control/resume`.

`GET /events/stream` is a live SSE subscription by default. Use
`GET /events/stream?snapshot=1` for a bounded snapshot response that closes after
the current event page.

The package exports from `dist`. Run `pnpm --filter @narada2/site-operating-loop build`
after changing `src` or `bin` files.

The Sonar email resident loop is currently the first consumer. Its email intake,
resident dispatch policy, and escalation semantics remain in `narada.sonar`; the
table/control/health/outcome substrate lives here. The real-Site proof is
`narada.sonar/tools/site-loop/tests/Test-SonarGenericSiteLoopRuntime.mjs`: it
opens a Sonar Site DB through a generic store adapter, hosts a Sonar-owned native
loop body through `startSiteOperatingLoopRuntime()`, admits/completes a trigger,
verifies durable run, event, trigger, status, and health evidence, asserts that no
Sonar phase records `narada.sonar.generic_site_loop_projected_step.v1`, and then
proves that the installed `narada-site-loop supervise --once --jsonl-events` CLI
can host the same Sonar store/body modules against fixture state.
