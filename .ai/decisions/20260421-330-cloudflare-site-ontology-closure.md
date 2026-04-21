# Cloudflare Site Ontology Closure Review

> Semantic closure for Tasks 320–329: did Cloudflare remain a Site, or did it accidentally become a second Narada?

**Verdict**: **Preserved with corrections.** Cloudflare remained a Site. No second Narada runtime was invented. The `Aim / Site / Cycle / Act / Trace` vocabulary held throughout the prototype.

**Closure date**: 2026-04-21

---

## 1. Artifact Classification

Every Cloudflare prototype artifact classified against the canonical vocabulary from [`SEMANTICS.md §2.14`](../../SEMANTICS.md):

| Task | Artifact | Primary Object | Secondary Objects | Assessment |
|------|----------|---------------|-------------------|------------|
| 320 | `site-manifest.ts` + `docs/deployment/cloudflare-site-manifest.md` | **Static schema / pure compiler** | Site (substrate bindings), Aim (name, description), policy (runtime context) | ✅ Clean. Uses `site_id`, `substrate`, `aim`. No `operation` smear. |
| 321 | `packages/sites/cloudflare/` Worker package | **Site substrate / Cycle machinery** | — | ✅ Clean. Worker is "Site substrate and Cycle machinery" per SEMANTICS.md §2.14.2. Code comments explicitly deny runtime ownership. |
| 322 | `NaradaSiteCoordinator` DO class | **Site state / Trace storage** | Lock (Cycle coordination) | ✅ Clean. DO stores Site state and lock. Does not perform foreman/scheduler governance. |
| 323 | `R2Adapter` | **Trace storage** | — | ✅ Clean. R2 holds "large Trace artifacts" per design doc. No authority claims. |
| 324 | Secret binding design doc | **Site substrate binding** | — | ✅ Clean. Secrets bind to a Site via naming convention. |
| 325 | `runCycle()` runner | **Cycle** | — | ✅ Clean. Explicitly "one bounded 8-step Cycle." Steps 2–6 are stubs, so no governance bypass can occur in v0. |
| 326 | `runSandbox()` + `cycleSmokePayload` | **Site substrate / Cycle machinery** | — | ✅ Clean. Mock sandbox runs pure computation only. No side effects. |
| 327 | `GET /status` endpoint | **Operator** (observation surface) | — | ✅ Clean. Read-only. No mutations. Privacy-safe. |
| 328 | Smoke fixture (`cloudflare-smoke.test.ts`) | **Trace** (test evidence) | Static validation | ✅ Clean. Synthetic data, no live credentials. Proves mechanics only. |
| 329 | Closure review document | **Trace** (review artifact) | — | ✅ Clean. Honest about structural vs functional boundaries. |

**No artifact mixes categories illegitimately.** Every artifact sits cleanly in its classification.

---

## 2. Forbidden Reinterpretation Check

### 2.1 Is Cloudflare called an `Operation`?

**Finding**: No. Zero instances of "Cloudflare operation" or "Operation.*Cloudflare" in any prototype artifact, task file, or decision document. The design doc opens with: "Cloudflare is the first concrete **Site materialization** for Narada."

**Verdict**: ✅ Clean.

### 2.2 Is the Worker treated as the Narada runtime?

**Finding**: No. `src/index.ts` comment:

> "This file owns routing, request parsing, and response formatting. It does NOT own Cycle logic, DO implementation, or R2 adapters."

The Worker is "Site substrate and Cycle machinery" per SEMANTICS.md §2.14.2.

**Verdict**: ✅ Clean.

### 2.3 Does DO state claim authority beyond Site coordination?

**Finding**: The DO schema stores `context_records`, `work_items`, `evaluations`, `foreman_decisions`, and `outbound_commands`. These are authoritative control-plane records, not merely "compact traces."

However, SEMANTICS.md §2.14.1 explicitly legitimizes this:

> "Trace is a projection and lens over durable records. A traced record may also be an authoritative structure (e.g., a `foreman_decision` is both a control-authority record and a Trace of how that authority was exercised). Trace does not strip authority from the records it explains."

The DO **stores** these records but does not **produce** them. Lock, health, and storage are Site-coordination concerns. Foreman governance, scheduler leasing, and outbound handoff remain Narada runtime concerns that will run inside the Cycle and write to the DO.

**Minor residual risk**: The class name `NaradaSiteCoordinator` could be read as implying Narada control-plane coordination (foreman/scheduler). The implementation comment clarifies "per-Site coordination point" in the distributed-systems sense (lock holder). No actual authority confusion exists in the code.

**Verdict**: ✅ Clean. Corrected design doc framing in §3 below.

### 2.4 Are R2 traces treated as authoritative durable state?

**Finding**: No. R2 holds "large Trace artifacts (raw sync snapshots, evaluation dumps, backup manifests)" explicitly for "recovery/rebuild." The R2 adapter has no write authority over control-plane state.

**Verdict**: ✅ Clean.

### 2.5 Can the Cycle bypass Narada's Intent / outbound-command boundary?

**Finding**: In v0, steps 2–6 are stubs. No actual intents or outbound commands are created. The design doc's step 5 is "Create draft / intent handoffs" — explicitly routing through foreman governance. When ported in v1, the same `IntentHandoff` and `OutboundHandoff` invariants from AGENTS.md §6–11 will apply.

**Verdict**: ✅ Clean (not yet exercised, but contract preserves the boundary).

### 2.6 Can Sandbox execution perform ungoverned side effects?

**Finding**: The v0 mock sandbox runs `cycleSmokePayload`, which is pure computation (no network calls, no file writes, no Graph API calls). The v1 design says the Sandbox will run "charter evaluation, tool calls, and effect workers inside resource limits." Tool calls and effect workers will be governed by the foreman/decision boundary before they reach the Sandbox.

**Verdict**: ✅ Clean.

### 2.7 Does USC own runtime behavior?

**Finding**: The Cloudflare package contains zero USC references. The `runtime-usc-boundary.md` document uses the crystallized vocabulary and states:

> "A USC app repo or Cloudflare-backed runtime is a **Site**. It hosts Cycles; it does not *become* the Aim."

**Verdict**: ✅ Clean.

### 2.8 Does a Site own policy decisions that belong to the foreman/governance layer?

**Finding**: The Site manifest has a `policy` field (`primary_charter`, `allowed_actions`, `require_human_approval`). This is static runtime context, not a policy decision.

The local Narada runtime loads equivalent policy from `config.json` under `runtime_policy`. The Site manifest holds the same configuration shape for the Cloudflare substrate. The **foreman** still owns evaluation resolution and failure classification. The **Site** merely provides the policy context that the foreman reads.

SEMANTICS.md §2.14.1 definition of Site explicitly includes "runtime context (policy, posture, allowed actions)."

**Verdict**: ✅ Clean.

---

## 3. Semantic Drift Found and Corrected

### Drift 1: `scope_id` conflated with `site_id` in Cycle entrypoint

**Location**: `packages/sites/cloudflare/src/cycle-entrypoint.ts`

```typescript
const result = await runCycle(req.scope_id, env);
```

`runCycle` parameter is named `siteId`, but receives `req.scope_id`. This conflates two distinct concepts:
- `scope_id`: internal Narada partition for an Aim-at-Site binding
- `site_id`: Cloudflare Site identifier (DO instance name)

**Impact**: Mild. For v0 single-Site, single-scope setups, the values coincide. For multi-scope or multi-Site scenarios, an explicit mapping layer is required.

**Correction**: Documented in closure review. Deferred to v1 — multi-Site support will introduce an explicit `scope_id → site_id` resolution layer.

**Status**: Recorded, not blocking.

### Drift 2: Design doc understates DO SQLite authority

**Location**: `docs/deployment/cloudflare-site-materialization.md` §3 and §4

The design doc frames DO SQLite as holding "compact control-state Traces" and "compact shadows of the full coordinator schema." In the shipped prototype, the DO stores full facsimiles of `context_records`, `work_items`, `evaluations`, `foreman_decisions`, and `outbound_commands`.

These are authoritative durable records, not merely traces or shadows. The DO SQLite **is** the Site's authoritative state store.

**Correction**: Updated design doc §8 (Post-Prototype Corrective Notes) to explicitly state:

> "The DO SQLite is the Site's authoritative state store. Tables such as `evaluations`, `foreman_decisions`, and `outbound_commands` are authoritative control-plane records stored at the Site, not merely 'compact traces.'"

**Status**: Corrected in design doc.

### Drift 3: `site_id` regex allows uppercase, but secret naming normalizes to uppercase

**Location**: `site-manifest.ts` and secret binding doc

The `site_id` regex is `/^[a-zA-Z0-9_-]+$/`, allowing mixed case. The secret naming convention says `site_id` is "normalized: uppercase, hyphen-safe." If an operator creates a Site with `site_id: "Help"`, the secret name would be `NARADA_HELP_...` but the manifest would use `"Help"`. This is a mild operational inconsistency.

**Correction**: Not blocking for v0. The secret resolution logic should normalize `site_id` to uppercase before constructing secret names. Documented as v1 should-have.

**Status**: Recorded, not blocking.

---

## 4. Residual Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `NaradaSiteCoordinator` name confuses DO storage with Narada foreman/scheduler | Low | Medium | Comment clarifies distributed-systems coordination. Rename to `NaradaSiteStorage` in v1 if confusion arises. |
| `scope_id`/`site_id` conflation breaks multi-scope Sites | Medium (when multi-scope implemented) | Medium | v1 must introduce explicit `scope_id → site_id` mapping. |
| DO `fetch()` handler is a stub; production RPC boundary untested | High | High | Must be resolved in v1 before any production deployment. |
| Sandbox v0 is mock; real bounded execution unproven | High | High | Must be resolved in v1. |
| Site manifest `policy` field duplicates local `config.json` policy shape; divergence risk over time | Medium | Low | Keep schemas in sync via shared types (already uses `AllowedActionSchema` from `@narada2/charters`). |

---

## 5. Generic `Site` Abstraction Decision

**Deferred.**

The closure review for Task 329 correctly states:

> "Narada should learn the real deployment boundary from one honest Cloudflare-backed Site before extracting a provider-neutral substrate model."

One Site materialization is not sufficient evidence to justify a generic `Site` abstraction. The vocabulary (`Aim / Site / Cycle / Act / Trace`) is already generic. The *implementation* of a Site remains substrate-specific.

**Criteria for extracting a generic `Site` interface:**

1. At least **two** materially different substrate implementations (e.g., Cloudflare DO + local container, or Cloudflare + AWS Lambda)
2. Both implementations share enough mechanical structure (lock, health, trace, cycle runner) that a shared interface reduces duplication
3. The shared interface does not force either substrate into unnatural shapes

Until then, Cloudflare remains a **concrete Site** with its own package, schema, and runner. The crystallized vocabulary provides the semantic consistency layer; no additional abstraction is needed yet.

---

## 6. Overall Assessment

| Question | Answer |
|----------|--------|
| Did Cloudflare remain a Site? | **Yes.** |
| Was a second Narada invented? | **No.** |
| Did `operation` smear occur? | **No.** Zero instances in prototype artifacts. |
| Did USC leak into runtime behavior? | **No.** Zero USC references in Cloudflare package. |
| Did Site own policy decisions? | **No.** Site holds policy context; foreman owns resolution. |
| Is the generic `Site` abstraction justified now? | **No.** Deferred until a second substrate is proven. |
| Is Cloudflare ready to proceed as a concrete Site prototype? | **Yes.** Semantic foundation is sound. Next step is kernel porting (v1). |
