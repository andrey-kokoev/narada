# Site Lifecycle Transformations

Site lifecycle transformations are governed changes to Narada runtime loci. They are not raw folder copy, rename, sync, or delete operations.

In the Site factorization, lifecycle transformations are governed crossings over Site authority objects and their realizations. See [`site-factorization.md`](site-factorization.md).

A Site transformation must preserve or explicitly change:

- authority locus;
- provenance;
- operation binding;
- config and substrate posture;
- inbox/task/lifecycle state;
- evidence trace;
- derived projections;
- re-instantiation proof where a reusable form is being lifted.

The continuity record for those changes is Site provenance lineage. See [`site-provenance-lineage.md`](site-provenance-lineage.md).

Relation evidence is recorded separately from lifecycle mutation. See [`site-relation-ledger.md`](site-relation-ledger.md).

## Transformation Kinds

| Kind | Meaning | Authority Rule |
| --- | --- | --- |
| `clone` | Create another embodiment of a Site. | Must declare whether the clone is read-only, forwarding, or an authority migration target. |
| `fork` | Create a divergent Site lineage. | New authority must be explicit and provenance must remain linked. |
| `split` | Extract a sub-locus from a Site. | Each mutation class must transfer, remain, or become residual linkage. |
| `absorb` | Admit sidecar/local Site material into another Site or Narada proper. | Requires governed admission and re-instantiation evidence. |
| `migrate` | Move Site authority or substrate. | Requires cutover plan, old-locus retirement posture, and read-back confirmation. |
| `re-instantiate` | Rebuild a Site from template, trace, config, and evidence. | Originating case must still run through the rebuilt form. |
| `archive` | Retire a Site from active operation. | Must preserve trace and record non-authority posture. |

## Required Plan Shape

Before any transformation mutates filesystem, registry, config, task lifecycle, inbox, or authority state, it needs a governed plan artifact with:

1. source Site reference;
2. target Site reference when applicable;
3. transformation kind;
4. authority mode;
5. provenance source;
6. state classes included and excluded;
7. residual links;
8. read-back confirmation method;
9. rollback or refusal posture;
10. evidence required for closure.

The plan must also name the lineage event or events it will produce. Lifecycle commands may use graph views for inspection, but the authority-bearing record is the append-only lineage event log.

## CLI Surface

The initial command surface is intentionally inspection/preflight only:

```bash
narada sites lifecycle kinds
narada sites lifecycle preflight clone --source-site user --target-site user-copy --authority-mode read_only
narada sites relation record --kind absorbed --source-site sidecar --target-site narada-proper --by architect
narada sites relation validate
```

These commands do not mutate Site state. Lifecycle preflight makes the transformation grammar explicit and forces authority-mode declaration before any future mutation command exists. Relation commands record durable edge evidence without moving authority or editing Site configs.

## Relation To Plural Embodiment

Site clone and Site migration are where Plural Embodiment, Singular Authority becomes operationally important. A clone may be an ergonomic embodiment, read-only projection, forwarding surface, or authority migration target. It must not silently become a second mutation authority.

## Relation To Inhabited Evolution

Site absorption and re-instantiation are admissible only when the originating case can still run through the lifted form. If a sidecar Site, PC Site, client Site, data Site, or ELT Site exposes useful machinery, Narada proper may absorb the invariant only through governed admission and evidence.

## Current Boundary

This document and the `sites lifecycle` CLI define the transformation grammar and preflight boundary. They do not yet implement mutating lifecycle operators. Future mutation commands must consume the same kind taxonomy and must produce durable transformation artifacts before changing Site state.
