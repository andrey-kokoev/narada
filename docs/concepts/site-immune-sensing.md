# Site Immune Sensing

Site Immune Sensing is the Narada doctrine for detecting tamper-suspected authority-zone posture inside a Site without turning detection into autonomous repair.

Its central rule is:

```text
Observe.
Classify.
Report.
Do not self-repair.
```

The pattern applies when a Site has authority-bearing substrates that can drift or be touched outside sanctioned crossings:

- task lifecycle SQLite state;
- exported task lifecycle snapshots;
- mutation-evidence records;
- canonical inbox state and exported envelopes;
- routing and capability registries;
- Site config and authority-locus declarations;
- derived projections over authority stores.

## Boundary

Immune sensing is an observation zone.

It may:

- inspect authority surfaces;
- detect malformed, stale, missing, or suspicious evidence;
- classify findings by severity;
- recommend sanctioned next commands;
- emit observations or task proposals.

It may not:

- silently rewrite SQLite;
- delete or quarantine files;
- repair registries;
- roll back Git;
- admit or reject work;
- execute capability-bearing effects.

Repair remains a separate governed crossing through task, inbox, reconcile, lifecycle, or operator authority.

## Command Surface

The v1 command is:

```bash
narada sites immune scan --cwd <site-root> --format json
```

It returns:

- `status`: `ok`, `attention`, or `tamper_suspected`;
- `immune_posture`: always `observe_classify_report_only`;
- scanned zones;
- bounded findings;
- recommended next commands when available.

The command is intentionally read-only.

## Initial Predicates

| Zone | Predicate | Finding |
|------|-----------|---------|
| Site config | `config.json` exists, parses, and declares `site_id` | malformed or missing identity is tamper-suspected |
| Task lifecycle snapshot | SQLite DB and exported snapshot posture | missing/stale snapshot is attention |
| Mutation evidence | evidence JSON parses and validates against mutation-evidence schema | malformed evidence is tamper-suspected |
| Authority registries | routing, capability, and relation registry JSON parses | malformed registry is tamper-suspected |

These predicates are not complete. They are the smallest useful immune surface that preserves the anti-autoimmune boundary.

## Anti-Autoimmune Rule

The immune system must not become a second authority.

Invalid:

```text
detect malformed evidence
-> delete evidence
-> rewrite lifecycle
```

Valid:

```text
detect malformed evidence
-> classify tamper_suspected
-> recommend sanctioned inspection or repair command
-> leave authority unchanged
```

The Site can become healthier only through its existing authority surfaces.

## Relation To Other Doctrine

- Governed Crossing: tamper suspicion means a consequence may have crossed without a sanctioned regime.
- Canonical Mutation Evidence: SQLite and Git-visible evidence must remain reconcilable.
- Plural Embodiment, Singular Authority: multiple shells or clones may inspect, but mutation authority remains singular.
- Self-Maintenance Coherence Loop: immune findings can become observations or task proposals, not automatic repairs.
- Capability Consent: sensing may identify missing grants, but it does not grant capability.

## Expansion Rule

Add immune predicates when all are true:

1. The predicate checks an authority-bearing zone or projection over one.
2. The check is read-only.
3. The finding can name a sanctioned next command or explicit residual.
4. The scanner does not mutate the zone it inspects.
5. The predicate reduces authority collapse risk without creating autonomous repair authority.

In shortest form:

```text
Sense illicit crossings.
Preserve local authority.
Route repair through governance.
```
