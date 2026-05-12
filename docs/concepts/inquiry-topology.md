# Inquiry Topology

Status: provisional concept proposal.

This note records a candidate substrate exposed by live Narada construction work: conversations can traverse a branching inquiry, finish one leaf, and then lose the return junction unless the branch topology is durable outside conversation memory.

It is not canonical terminology. Canonical vocabulary remains in [`../../SEMANTICS.md`](../../SEMANTICS.md). This proposal should be promoted only if the originating cases can be re-instantiated through the topology without forcing premature task lifecycle, doctrine canonicalization, or implementation machinery.

## Pressure

Current substrates preserve pieces of the work but not the whole shape of unfinished inquiry:

- task lifecycle captures assigned work, but not live ambiguity before taskification;
- chapters capture authored narrative, but not machine-queryable branch state;
- inbox captures inert incoming candidates, but not exploration traversal;
- doctrine captures admitted concepts, but not the branch path that earned them;
- checkpoints preserve resume notes, but not the reusable DAG of splits, leaves, and return junctions.

The local pressure was a direct operational question after a depth-first exploration: what was the last split of thought branches that still has an open branch? Answering that from conversation memory is fragile. A durable substrate should answer it directly.

## Hypothesis

Inquiry Topology is the durable DAG-shaped structure of live inquiry.

It preserves:

- where the inquiry started;
- where it split;
- which branches are open, blocked, deferred, closed, or residualized;
- which leaf was just reached;
- which junction should be resumed next;
- what evidence, task, proposal, doctrine candidate, or implementation branch each inquiry node generated.

Compactly:

```text
Inquiry Topology = durable DAG of live ambiguity, branch lineage, traversal posture, evidence, closure, and residuals
```

## Core Terms

| Term | Meaning |
| --- | --- |
| Inquiry node | A durable inquiry state: pressure, question, branch point, leaf, closure, residual, or return junction. |
| Inquiry edge | A one-way relation between nodes: split, refinement, continuation, dependency, supersession, generated-work, or return-to. |
| Branch point | A node where one inquiry line produced multiple materially different continuations. |
| Leaf | A current endpoint of a branch. A leaf may be open, blocked, deferred, closed, or residualized. |
| Return junction | The nearest still-relevant branch point that should be resumed after a leaf closes. |
| Frontier | The projection of open leaves plus open return junctions. |
| Traversal posture | The current policy for choosing the next branch: depth-first, breadth-first, opportunistic, blocked, deferred, or closed. |
| Closure | A state where further refinement would not change admissible action or evaluation under the current decision context. |
| Residual | Explicit remaining pressure that is real but not admitted into immediate action or canonical doctrine. |

## Motion: Teleological Refinement Pressure

Inquiry Topology should not be described primarily as entropy, gradient, or frontier doctrine. Those words may be useful metaphors, but they are not current Narada doctrine.

The grounded motion is **teleological refinement pressure**:

```text
live ambiguity
-> locate the active ambiguity
-> split, refine, parameterize, quotient, execute, close, or residualize
-> preserve the branch topology and evidence
-> resume from the next earned frontier point
```

The pressure combines two existing disciplines:

- Progressive De-Arbitrarization: locate live ambiguity, separate bundled structure, parameterize residual freedom, quotient inert distinctions, and stop when remaining freedom is forced, explicit policy, or decision-inert.
- Constructive Coherence Coordinates / Teleological Counterweighting: choose the next move according to which coherence coordinate is underweighted or overweighted for the next admissible transformation.

The key traversal question is:

```text
Which open branch or return junction most reduces hidden arbitrariness while preserving coherent future transformation?
```

## Query Vocabulary

Inquiry Topology should support a small canonical query vocabulary so agents can navigate without relying on conversation memory.

The vocabulary is not a ritual. Agents should not enumerate all possible query kinds before every move. Use it when traversal is ambiguous, after restart or compaction, after closing a leaf, or before promoting a branch into task, doctrine, or implementation.

When traversal is ambiguous, select at most three query types relevant to the ambiguity, answer them, then choose the next move.

| Query family | Examples | Use When |
| --- | --- | --- |
| Navigation | current frontier, return junction, depth-first next, breadth-first next | Choosing where to move after a leaf, restart, or branch closure. |
| Readiness | taskification check, doctrine lift check, closure test | Deciding whether a branch is ready to become task, doctrine, implementation, or closure. |
| Risk | evidence gap, authority gap, stale branch, scope drift | Preventing premature promotion, hidden authority, or continuation from stale memory. |
| Output | generated work, residual pressure, concept lifecycle query | Deciding what durable artifact an inquiry branch produced or should produce. |

### Movement Question Factorization

Candidate operational invariant:

```text
Do not ask "what next?" over an inquiry graph without binding enough movement factors to make the answer admissible.
```

A movement question should expose which factor it is asking for:

| Factor | Question It Answers | Example |
| --- | --- | --- |
| State | What exists in the topology now? | What is the current frontier? |
| Position | Where are we relative to the graph? | What leaf did we just reach? |
| Return | Where should we go back to? | What is the nearest open junction? |
| Traversal | Which branch should be visited next? | What is the next depth-first branch? |
| Readiness | Is this branch ready to become another artifact? | Is this ready to become a task? |
| Risk | What would make movement unsafe or premature? | What evidence gap blocks promotion? |
| Output | What durable thing should this branch emit? | Should this become a concept note, task, residual, or closure? |
| Closure | Can this branch be considered done? | Is this branch closed or only paused? |
| Policy | What traversal policy should govern movement? | Should we continue depth-first or switch breadth-first? |
| Recovery | What must survive restart or compaction? | What minimum state must a fresh agent recover? |

A de-arbitrarized movement question usually binds several factors, for example:

```text
Given current position and frontier, under depth-first traversal, what branch is ready and safe to traverse next?
```

Useful current queries include:

- What is the current frontier?
- What is the nearest open return junction?
- If continuing depth-first, what branch should be descended next?
- If switching breadth-first, what sibling branch should be inspected before deeper descent?
- Which residuals are strong enough to become proposals or tasks?
- Which open branches are not yet well-formed enough to become tasks?
- Which provisional concepts have enough re-instantiation evidence for canonicalization review?
- Which branches have claims without evidence or re-instantiation cases?
- Which branches imply durable authority but currently live only in prose or chat?
- What minimum state must a fresh agent recover to continue correctly?
- Are we better served by depth-first, breadth-first, or opportunistic traversal?
- Which branches are actually closed, and which are merely paused because a satisfying phrase was found?
- Did finishing this branch expose a new sibling branch?
- What tasks, proposals, concept notes, or residuals were generated by each branch?
- Which concepts are provisional, admitted, canonical, superseded, or residual-only?

## Relationship To Existing Substrates

Inquiry Topology is adjacent to existing Narada surfaces, but should not collapse into them.

| Surface | Relationship |
| --- | --- |
| Task lifecycle | A branch may generate a task when action is well-formed, but inquiry should not be forced into a task before that. |
| Chapter | A chapter may narrate inquiry, but authored prose is not a queryable frontier. |
| Inbox | An inbox envelope may start or affect inquiry, but inquiry traversal is not itself intake admission. |
| Doctrine | Inquiry may produce doctrine candidates, but provisional branches are not canonical semantics. |
| Checkpoint | A checkpoint may point at current inquiry state, but it should not be the only durable branch memory. |
| Site factorization | Site kinds may be explored as one branch inside a broader inquiry topology. |

## Re-instantiation Cases

| Case | Inquiry Topology Reading | What Must Work |
| --- | --- | --- |
| Agent lifecycle and Site factorization split | The branch point was "agent lifecycle as authority-zone topology." One branch explored Site/Operation factorization and reached a provisional concept note; the open branch is Agent Lifecycle Authority Topology, captured in the User Site concept note `docs/concepts/agent-lifecycle-authority-topology.md`. | A fresh agent can answer "what was the last open junction?" without rereading chat. |
| Restart recovery | Conversation memory, compaction, or session restart can drop tactical branch detail. | Rehydration can recover the current frontier, last leaf, and next return junction from durable state. |
| Concept lifecycle pressure | Concepts are authored prose, but their use has status, admission evidence, dependencies, canonicality, supersession, and residuals. | The pressure is preserved as a follow-up without prematurely making it canonical doctrine or direct implementation. |
| Taskification pressure | Inquiry often becomes a task too early because task lifecycle is the available durable substrate. | The topology can hold live ambiguity until the branch is well-formed enough to produce a task, proposal, or closure. |
| Doctrine lift pressure | A provisional concept can feel right before it has re-instantiation evidence. | The topology can remember required re-instantiation cases and admission criteria before `SEMANTICS.md` changes. |

## Future Authority Shape

This note does not implement storage. If Inquiry Topology becomes machinery, authoritative state should live in SQLite or another declared authority substrate, with JSON only as projection.

A future implementation likely needs:

- append-only inquiry events;
- node and edge projections;
- frontier projection;
- traversal posture projection;
- evidence references;
- generated-work references;
- closure and residual records.

A minimal future event might record:

```text
actor
source_node
edge_kind
target_node
status
authority_basis
evidence_refs
created_at
```

The implementation should preserve the authority split:

```text
SQLite owns inquiry lifecycle and topology state.
Markdown owns authored semantic explanation.
JSON, dashboards, and startup summaries are projections.
```

## Concept Lifecycle Residual

This inquiry exposed a separate but related pressure: concepts themselves want durable managed lifecycle.

Today, concept markdown behaves as authored prose. But actual use already involves lifecycle state:

- sensed pressure;
- provisional naming;
- proposal drafting;
- re-instantiation cases;
- admission criteria;
- canonical lift or rejection;
- residuals;
- later revision;
- supersession or retirement;
- downstream documentation and implementation migration.

Candidate invariant:

```text
Concept markdown owns authored meaning.
Concept lifecycle authority should own status, canonicality, admission evidence, dependencies, transitions, and supersession.
```

This is a residual, not an implemented feature and not canonical doctrine. A future proposal should design a durable concept lifecycle authority substrate, probably SQLite-backed, and test it against existing concept docs, `SEMANTICS.md`, task lifecycle, chapters, and doctrine promotion.

## Admission Criteria For Canonical Lift

Inquiry Topology should not be promoted to canonical semantics until these criteria are met:

- It can recover the current frontier after restart or compaction.
- It can represent both completed and open branches without rereading conversation transcripts.
- It prevents premature taskification by holding live ambiguity as inquiry state.
- It can generate tasks, proposals, doctrine candidates, and residuals without becoming any one of them.
- It preserves the PDA closure rule: stop when further refinement is decision-inert under the current decision context.
- It preserves authority separation: agent memory does not become durable topology authority.
- It can re-host the Site factor profile branch and the agent lifecycle branch as originating cases.

## Residuals

- Decide whether Inquiry Topology belongs as a Site factor, an Operation-level substrate, an agent-context extension, or a separate governed substrate.
- Decide the first SQLite authority home if implemented.
- Decide whether traversal posture is advisory metadata or an admitted policy field.
- Design the durable concept lifecycle authority substrate.
- Determine how Inquiry Topology should interact with agent startup summaries and checkpoints.
