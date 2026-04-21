# Runtime / USC Boundary

> Normative boundary between Narada runtime, Narada tooling/operators, and Narada.USC static grammar.

## Four Ownership Classes

### 1. Static Schema / Grammar

Static schema defines shapes, not transitions. It is read by runtime and tooling, but must never assume runtime state or operator behavior.

**Owned by Narada.USC static packages and repo artifacts:**
- Task definitions, graphs, and lifecycle schemas (task file front-matter, task graph JSON)
- Review finding schemas
- Charter definitions, prompts, and capability envelopes
- Plan commands and executor adapters
- Domain packs and prior definitions
- Agent authority class schemas
- Assignment record shapes, roster shapes, chapter metadata

**Key invariant:** Static grammar is read-only at runtime. No USC package may call into the coordinator, scheduler, outbound store, or any other runtime mutable surface.

### 2. Pure Tools / Compilers

Tools perform static transforms without mutating runtime state.

**Examples:**
- USC validators (`validateUscRepo`, schema-based validation)
- USC planners (`usc plan`)
- Schema readers and static linters (`narada task lint`)
- Static transforms (task file parsing, finding extraction)

**Key invariant:** A pure tool may read static grammar and produce static artifacts. It must not write to durable runtime stores, file-based assignment records, or task files unless explicitly invoked as an operator.

### 3. Operators

Operators perform task/chapter mutations. They are the only components that may write assignment records, transition task statuses, allocate numbers, or close chapters.

**Owned by Narada proper CLI and control-plane surfaces:**
- `claim` — acquire task assignment atomically
- `release` — release assignment with reason (`completed`, `abandoned`, `budget_exhausted`, `superseded`, `transferred`)
- `review` — accept/reject a task with findings
- `allocate` — reserve the next task number atomically
- `derive-from-finding` — create a corrective task from a review finding
- `chapter close` — verify terminal status, generate closure artifact, transition tasks to `confirmed`
- `confirm` — verify closure and mark tasks confirmed

**Key invariant:** Operators perform transitions; static grammar defines what is being transitioned. No operator may be embedded inside a USC package. No USC package may invoke an operator.

### 4. Runtime

Runtime owns leases, work-item lifecycle, executions, and side effects.

**Owned by Narada control plane and daemon:**
- Durable state (facts, work items, leases, execution attempts, intents, confirmations)
- Effect execution (Graph API calls, process spawns, webhook handling)
- Crash recovery and replay determinism
- Lease acquisition, renewal, and stale recovery
- Observation API (read-only projection of durable state)
- Foreman work opening and evaluation resolution
- Scheduler leasing and mechanical lifecycle
- Outbound handoff and worker mutation

**Key invariant:** Runtime may read static grammar (e.g., runtime policy, charter bindings), but static grammar must not assume runtime state.

---

## Bridge Properties

Every cross-boundary relationship must satisfy these properties:

1. **Explicit**: Every cross-boundary call is named and documented (e.g., `uscInitCommand` → `populateSchemaCache`, `validateUscRepo` → `loadSchema` with fallback).
2. **Versioned**: USC packages loaded at runtime declare a compatibility version range. `uscInitCommand` verifies compatibility before loading. On mismatch, it emits a clear error with upgrade instructions.
3. **Testable**: Boundary contracts have fixture-based tests. The USC bridge tests mock USC imports to prove fallback behavior.
4. **One-directional**: Runtime and tooling may read static grammar. Static grammar must never assume runtime state or operator behavior.
5. **Authority-separated**: Static grammar defines what a task, finding, roster entry, or chapter *is*. Operators perform transitions. No static package owns claim, release, allocate, close, execute, or confirm behavior.

---

## Concrete Boundaries

| Activity | Owner | May Read | Must Not |
|----------|-------|----------|----------|
| Task file schema | USC / static | — | Assume operator behavior |
| Task claim/release | Operator (CLI) | Task files, roster, assignments | Write to runtime stores |
| Work item lifecycle | Runtime (scheduler) | Runtime policy | Write task files |
| Schema validation | Pure tool | Cached schemas, USC packages | Mutate repo state |
| Chapter closure | Operator (CLI) | Task files, review artifacts | Mutate runtime state |
| Lease acquisition | Runtime (scheduler) | Work items, leases | Read task files |
| Number allocation | Operator (CLI) | Registry file | Assume runtime state |

---

## Version Contract

The USC bridge version is declared in root `package.json` under `config.uscVersion` (e.g., `^1.0.0`).

- `uscInitCommand` checks the installed `@narada.usc/compiler` version against this range before loading any USC modules.
- On mismatch, the command fails with a clear, actionable error message.
- Schema cache population happens only after version validation succeeds.
- `narada init usc-validate <path>` can fall back to cached schemas when USC packages are unavailable, but version-checked initialization is the normative path.

---

## USC Recursion and the Crystallized Vocabulary

When Narada is used to govern USC-like constructors, the word `operation` smears quickly: "operation deploys operation" or "Cloudflare operation" lose precision because `operation` is doing too much work. The `Aim / Site / Cycle / Act / Trace` lens prevents this recursion confusion by separating layers.

### Layered Examples

| Layer | USC Concept | Crystallized Reading |
|-------|-------------|----------------------|
| Static knowledge | `narada.usc` schema, task contracts, charter definitions | **Static grammar** — constructor knowledge read by Cycles; not a runtime term itself |
| User request | "Build an ERP for my team" | **Aim** — the pursued objective |
| Runtime context | A Cloudflare-backed Narada instance with Durable Objects and R2 | **Site** — the anchored place where the Aim is pursued |
| Execution pass | One planning → refinement → build → deploy loop | **Cycle** — bounded attempt to advance the Aim |
| Concrete effect | File edit, commit, PR creation, deployment push | **Act** — governed side effect |
| Audit record | Task graph, review findings, decision log, build log | **Trace** — durable explanation of what happened and why |

### Key Distinctions

- **`narada.usc` static grammar** is read-only constructor knowledge. It is **not** an active operator, not a Site, and not an Aim. It is read by Cycles to guide construction, but it is not a Trace because it is not a history of what happened.
- A concrete "build ERP" request is an **Aim**. It does not become a Site until it is anchored to a runtime substrate.
- A USC app repo or Cloudflare-backed runtime is a **Site**. It hosts Cycles; it does not *become* the Aim.
- Each refinement, planning, build, or execution pass is a **Cycle**. Cycles are bounded and leave Traces. Cycles may produce Acts that materialize future Aim-at-Site bindings, but those future Cycles are separately bounded and traced.
- File edits, commits, PRs, and deployments are **Acts**. They are governed effects, not operations in the old overloaded sense.
- Task graphs, reviews, logs, and decisions are **Traces**. They explain why an Act was taken and how a Cycle concluded.
