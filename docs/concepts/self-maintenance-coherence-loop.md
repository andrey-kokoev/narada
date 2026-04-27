# Self-Maintenance Coherence Loop

Narada should not treat coherence as a terminal state. Coherence is maintained by a bounded observation loop that detects drift, submits bounded envelopes, and leaves repair authority behind governed crossings.

The coherence agent is event-summoned, not resident by default. It is not an infinite self-grooming daemon.

## Shape

```text
summoning event
-> coherence run
-> selected charter modules
-> bounded finding
-> Canonical Inbox envelope
-> proposal or task promotion
-> governed execution
-> evidence
```

## Authority Rules

- The scanner observes; it does not repair.
- Dry-run is the default.
- Inbox mutation requires an explicit `--submit`.
- Submitted envelopes use `system_observed` authority.
- Findings must carry severity, confidence, locus, evidence, and a cooldown key.
- Task candidates remain inert until promoted through the Canonical Inbox.
- False positives are evidence against the scanner, not proof that the repo must conform.
- Repair, promotion, and execution are never default scanner actions.

## Summoning Events

The coherence loop runs when an event earns it:

| Event | Default action | Escalated action |
| --- | --- | --- |
| Operator asks whether Narada is coherent | `narada coherence scan` | `narada coherence scan --submit` if findings are actionable |
| Chapter boundary after task close, before commit, or after push | `narada coherence scan` | Submit only durable findings that survive snapshot/closure refresh |
| Configuration event such as a new command surface, Zone, authority store, Site, package boundary, or guard | `narada coherence scan` | Submit task candidates for explicit authority gaps |
| Failure event such as merge conflict, stale snapshot, dirty generated artifact, CLI output violation, or accidental mutation | `narada coherence scan` | Submit observation or task candidate with concrete evidence |
| Optional scheduled cadence | `narada coherence scan` | Submit only if explicitly configured and bounded |

The loop does not run continuously. It is summoned by pressure, produces a bounded observation set, and exits.

## Chartered Module Bundle

The Coherence Agent is an umbrella for charter modules. It is not a privileged repair actor and it is not one untyped loop.

```text
coherence agent
-> operational_coherence
-> semantic_coherence
-> telos_preservation
-> documentation_coherence
```

Each module declares a scope, invariants, evidence sources, false-positive conditions, output kind, severity rules, cooldown policy, and max findings policy.

| Module | Scope | Invariants Checked | Evidence Sources | False-Positive Conditions | Output Kind | Severity Rules | Cooldown Policy | Max Findings |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `operational` | Repo/runtime drift | command-mediated mutation, fresh lifecycle snapshot, safe work selection, bounded CLI output | guards, command registration, local runtime posture, known failure traces | in-progress task mutates local DB before final snapshot refresh; fixture repos lack full scripts | `observation` or `task_candidate` | `error` for broken authority posture, `warning` for unsafe ergonomics | one active envelope per concrete drift signature | bounded by CLI `--limit` |
| `semantic` | Vocabulary and topology coherence | Zone/crossing topology remains primary; Operation/Site/Aim/Cycle/Trace do not collapse | `AGENTS.md`, `SEMANTICS.md`, concept docs | terminology migration in progress; code identifiers intentionally retain old names | `task_candidate` | `warning` unless direct authority collapse is detected | one active envelope per semantic invariant | bounded by CLI `--limit` |
| `telos` | Narada spirit and constructive invariant evolution | earned machinery, Inhabited Evolution, intelligence-authority separation, anti-autoimmune posture | `inhabited-evolution.md`, coherence docs, scanner behavior | new asymmetry is earned by a real operation and violates no explicit invariant | `task_candidate` | `warning` for unclear telos fit; `error` only for authority creep | one active envelope per telos-invariant gap | bounded by CLI `--limit` |
| `documentation` | Documentation drift | docs expose current operational doctrine; stale docs do not mislead agents/operators | concept docs, `AGENTS.md`, command help | local work not yet committed or docs intentionally defer implementation | `observation` or `task_candidate` | `info` for doc gaps, `warning` when docs contradict live behavior | one active envelope per doc locus | bounded by CLI `--limit` |

Current module selection:

```bash
narada coherence scan --module operational
narada coherence scan --module semantic,telos
narada coherence scan --module all
```

No module may repair, promote, or execute its own finding.

## Autoimmune Controls

The coherence loop must avoid becoming a purity engine:

- bound findings per run;
- dedupe active findings by cooldown key;
- distinguish transient local state from durable incoherence;
- prefer task candidates for repair work rather than direct mutation;
- do not auto-promote scanner output;
- treat earned evolution as valid unless an explicit invariant is violated.

## Current Surface

```bash
narada coherence scan
narada coherence scan --submit
```

The first surface reports findings without mutating state. The second submits active findings into the Canonical Inbox as observations or task candidates.

## Multi-Chapter Buildout

The umbrella should evolve by chapters:

1. create the coherence-run substrate;
2. add charter modules one at a time;
3. require each module to prove usefulness by finding or ruling out a real incoherence class;
4. keep scanner output inbox-only;
5. add scheduled/cadence operation only after low false-positive behavior is proven.

The invariant remains:

```text
charter observes
inbox receives
operator or governance promotes
task executes
evidence closes
```

## Documentation Coherency

A separate documentation agent is not yet earned as a resident actor. Documentation coherency is currently a specialization of the same event-summoned coherence loop.

Documentation findings should use the same envelope path:

```text
documentation drift
-> coherence finding
-> Canonical Inbox observation or task_candidate
-> governed promotion
-> documentation task
```

Create a distinct Documentation Coherency Charter only when documentation drift becomes frequent enough to need its own finding taxonomy, cooldown keys, and acceptance criteria. Until then, splitting the agent would be premature machinery.
