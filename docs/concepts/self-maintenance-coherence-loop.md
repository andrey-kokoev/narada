# Self-Maintenance Coherence Loop

Narada should not treat coherence as a terminal state. Coherence is maintained by a standing observation loop that detects drift, submits bounded envelopes, and leaves repair authority behind governed crossings.

## Shape

```text
coherence scan
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
