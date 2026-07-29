# Narada target-architecture acceptance matrix

Status: **destination incomplete**.

This is the auditable completion matrix for the target architecture described in
[`docs/architecture/narada-target-architecture.md`](../architecture/narada-target-architecture.md).
It is an evidence ledger, not a completion claim. A row is complete only when
every required cell is proven by durable source, focused test, boundary/live,
or interruption evidence as appropriate. A green nearby test cannot close a
row. Unknown, stale, invalidated, or blocked evidence remains unresolved.

## Completion rule

Each slice and each cross-cutting check is evaluated against these cells:

| Cell | Completion evidence required |
| --- | --- |
| Owner | Named concept, authority owner, and explicit non-owner boundary |
| Contract | Stable schema/contract and its authoritative source |
| Implementation | Source implementation respects the ownership boundary |
| Projection | Shared contract is consumed consistently by claimed surfaces |
| Refusal/failure | Invalid input, refusal, and known-failure semantics are explicit and tested |
| Focused coverage | Unit or contract coverage for the slice’s behavior |
| Boundary/live | Real process, transport, host, or operator-surface proof when crossed |
| Interruption | Reconciliation after cancellation, restart, replay, or loss of transport |
| Durable evidence | Task, ledger, registry, and artifact references remain reviewable and current |

Cell states are deliberately conservative:

- `proven` means the required evidence was directly audited and satisfies the cell.
- `partial` means evidence exists but does not establish the completion condition.
- `missing` means no satisfying evidence was found in this audit.
- `stale_or_unverified` means an apparent result exists but its currentness or independent review is not established.
- `not_applicable` is allowed only when the row documents why the cell does not apply.

The destination is complete only if every applicable cell in every slice and
cross-cutting row is `proven`, all required review/closure evidence is current,
and no row is `missing`, `partial`, `stale_or_unverified`, or blocked.

## Slice matrix

The chapter task status is lifecycle status, not conformance status. Chapters in
`in_review` have submitted work or a review obligation; they are not thereby
complete. The matrix is intentionally not_proven for every row until the full
cell set is independently reconciled.

| Slice | Chapter task | Lifecycle | Owner | Contract | Implementation | Projection | Refusal/failure | Focused coverage | Boundary/live | Interruption | Durable evidence | Row status | Current gap |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A — authority separation and projection topology | #2371 | in_review | partial | partial | missing | missing | missing | missing | missing | missing | stale_or_unverified | not_proven | Current task evidence does not establish the complete authority/non-owner boundary or boundary proof. Review task #2382 remains open. |
| B — NARS session/runtime authority | #2372 | in_review | partial | partial | partial | partial | partial | partial | missing | missing | partial | not_proven | Focused package evidence exists, but cross-surface parity, live boundary proof, interruption reconciliation, and independent review remain open. Review task #2383 remains open. |
| C — intelligence invocation | #2373 | in_review | partial | partial | partial | partial | partial | partial | missing | missing | partial | not_proven | Selection/plan evidence exists, but end-to-end authority, refusal, replay/recovery, and cross-surface proof are not complete. Review task #2384 remains open. |
| D — strict TypeScript and stale references | #2374 | in_review | partial | partial | partial | partial | partial | partial | missing | missing | partial | not_proven | Source-shape and typecheck evidence is not a substitute for runtime boundary, interruption, or destination-level proof. Review task #2394 remains open. |
| E — shared projections and cross-client parity | #2375 | in_review | partial | partial | partial | partial | partial | partial | missing | missing | partial | not_proven | Shared classification and focused clients are covered, but claimed embodiments and live/recovery parity are not fully audited. Review task #2395 remains open. |
| F — authority-host transitions | #2376 | in_review | partial | partial | missing | missing | missing | missing | missing | missing | stale_or_unverified | not_proven | No satisfying transition-boundary execution and reconciliation evidence was found in the current task record. Review task #2397 remains open. |
| G — admission and lifecycle governance | #2377 | in_review | partial | partial | missing | missing | missing | missing | missing | missing | stale_or_unverified | not_proven | Governance acceptance and refusal-before-side-effect proof remain unverified. Review task #2398 remains open. |
| H — evidence and confirmation | #2378 | in_review | partial | partial | missing | missing | missing | missing | missing | missing | stale_or_unverified | not_proven | Durable evidence provenance and confirmation independence remain unproven. Review task #2399 remains open. |
| I — operator journey and recovery | #2379 | in_review | partial | partial | missing | missing | missing | missing | missing | missing | stale_or_unverified | not_proven | Journey/recovery coverage has not been independently executed across the claimed surfaces. Review task #2402 remains open. |
| J — operator-view policy | #2380 | in_review | partial | partial | partial | partial | partial | partial | missing | missing | partial | not_proven | Shared per-surface policy and focused client evidence exist; live/replay/interruption and review closure remain open. The latest evidence superseded an earlier report but did not close the task. |
| K — completion proof and destination matrix | #2381 | claimed | partial | partial | partial | partial | partial | missing | missing | partial | partial | not_proven | This matrix is implemented as an auditable artifact; its own unresolved cells correctly prevent a false destination-complete claim. |

## Cross-cutting matrix

| Embodiment or concern | Evidence currently available | Unresolved requirement | Status |
| --- | --- | --- | --- |
| Local NARS | Target architecture, task chapters, local runtime contracts, and package-level tests | Independent matrix-wide reconciliation of authority, replay, failure, and restart behavior | partial |
| Remote Cloudflare embodiment | Local/Cloudflare projection symmetry matrix and projection contracts | Required live/boundary proof for each claimed capability and failure/recovery path | partial |
| Agent CLI | Agent-cli typecheck and focused boundary/attach evidence | Full parity and interruption/reconciliation proof for every claimed capability | partial |
| Agent TUI | Agent-Pi-TUI typecheck/tests and shared projection use | Full journey, failure, replay, and host-boundary proof | partial |
| Agent Web UI | Web UI typecheck and shared projection use | Live browser journey and reconnect/recovery evidence tied to the matrix | partial |
| Operator Console | Surface is named by the architecture and journey matrix | Current implementation and acceptance evidence for every claimed capability | missing |
| Replay | Durable event/replay contracts are documented | Executed replay proof showing semantic equivalence after restart/surface replacement | partial |
| Failure and recovery | Failure states and recovery concepts exist in contracts/docs | Executed refusal, interruption, reconnect, and reconciliation evidence for each affected slice | partial |
| Authority-host transition | Host/epoch concepts are documented | Live transition proof, stale-writer refusal, and durable reconciliation | missing |
| Registry/ledger/task reconciliation | Concept registry, coherence ledger, and task lifecycle are identified authorities | One current reconciliation pass proving no silent row closure or stale evidence | partial |

## Evidence register

The following references define the acceptance method and the current evidence
boundary. They are not themselves proof that every row passes.

| Reference | Role in the matrix |
| --- | --- |
| `docs/architecture/narada-target-architecture.md` | Stable destination invariants and per-slice completion rule |
| `docs/operations/coherence-closure-ledger.md` | Conservative implementation/evidence ledger; open rows remain open without source plus test/runtime evidence |
| `docs/operations/cloudflare-local-nars-projection-symmetry-matrix.md` | Local/remote projection quadrants, evidence classes, and boundary asymmetries |
| `packages/operator-surface-runtime-contract/contracts/operator-journey-matrix.json` | Operator journeys, truth fields, embodiments, surfaces, disruptions, and known gaps |
| `packages/domains/concepts/records/concept-registry.concept.json` | Concept ownership and registration authority |
| `task #2371` through `task #2381` | Chapter ownership, execution notes, verification, and review state |
| Review tasks `#2382`, `#2383`, `#2384`, `#2394`, `#2395`, `#2397`, `#2398`, `#2399`, `#2402` | Independent review obligations currently preventing silent closure |

## Test evidence reconciliation

Two earlier lifecycle runs produced 3/6 failures, and one earlier
operator-surface run produced 1/4 failures. Those artifacts are retained as
historical evidence and are now invalidated by the fresh post-restart runs:
the lifecycle `all` selector is 6/6 passed and the operator-surface selector is
4/4 passed. The failures still matter as a runtime-freshness finding, but they
are no longer active blockers.

| Check | Observed result | Matrix consequence |
| --- | --- | --- |
| `Test-AcceptanceCriteriaBodyEnforcement.test.mjs` | Historical failure: fixture expected one `frontmatter_only_acceptance_criteria` issue but observed zero; fresh run passed | Invalidated after restart; no current criteria-lint blocker |
| `agent-desktop-shortcuts-authority.test.mjs` | Historical failure: PowerShell parser error at line 180; fresh run passed | Invalidated after restart; no current desktop-shortcut blocker |
| `osm-send-permission-policy.test.mjs` | Historical failure: stale/missing compatibility module path; fresh run passed | Invalidated after restart; no current OSM import blocker |
| `operator-surface-shutdown-paths.test.mjs` | Passed in both the historical and fresh runs | Current focused source evidence is proven for this check |

The historical failures are not silently discarded: they establish that the
pre-restart runtime could report stale source/dependency state. The fresh
artifacts supersede them for current test-gate purposes. The remaining matrix
gaps are architectural evidence gaps, not these three test failures.

## Current audit result

This run produces a structured matrix and records the known evidence gaps. It
does not promote any unresolved row to done. The destination remains
**incomplete** until the missing boundary/live, interruption, durable-evidence,
and independent-review cells are supplied and reconciled. In particular:

- `in_review` is not `closed` and is not `proven`;
- a focused unit/typecheck result proves only its named behavior;
- a documented contract does not prove a live crossing;
- a projection implementation does not prove replay or interruption semantics;
- an aggregate score cannot replace a missing per-slice cell;
- stale, superseded, or unreviewed evidence cannot satisfy a current cell;
- the matrix itself must be rerun after each material evidence change.

The machine-readable companion is
[`narada-target-architecture-acceptance-matrix.json`](./narada-target-architecture-acceptance-matrix.json).

