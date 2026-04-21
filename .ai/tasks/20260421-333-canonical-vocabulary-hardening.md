---
status: deferred
depends_on: [330, 331]
---

# Task 333 — Canonical Vocabulary Hardening (Deferred)

> **Status: Deferred.** Task 330's ontology closure review (`.ai/decisions/20260421-330-cloudflare-site-ontology-closure.md`) confirmed that the crystallized vocabulary `Aim / Site / Cycle / Act / Trace` is already coherent across all Cloudflare prototype artifacts. Minor drift was corrected in-place. This task is kept on file for reference but is **not in the active backlog**. It may be revived if a future substrate introduces new semantic drift that requires a dedicated hardening pass.

## Context

Task 330 confirmed that the crystallized vocabulary (`Aim / Site / Cycle / Act / Trace`) held throughout the Cloudflare prototype. The word `operation` still leaks into code labels and CLI flags, but this is implementation vocabulary with documented crystallized mappings (SEMANTICS.md §2.14.2).

The current top-level vocabulary is:

| Object | Meaning |
|--------|---------|
| **Aim** | User-level desired outcome |
| **Site** | Concrete place where an Aim is materialized and run |
| **Cycle** | Bounded wake/evaluate/act iteration |
| **Act** | Durable governed effect attempt |
| **Trace** | Inspectable evidence emitted by execution |

This task would stabilize these terms and update canonical documents. **It is deferred because Task 330 already performed this function.**

## Goal

Harden the top-level vocabulary. Update SEMANTICS.md, AGENTS.md, and related docs so that `Aim / Site / Cycle / Act / Trace` (and possibly `Runtime Locus`) are the authoritative terms and `operation` is demoted to a user-facing convenience word only.

## Required Work

### 1. Audit canonical documents for smears

Read and annotate:
- `SEMANTICS.md` — all sections referencing `operation`, `scope`, `daemon`, `deployment`
- `AGENTS.md` — all boundary descriptions and navigation tables
- `docs/deployment/cloudflare-site-materialization.md` — vocabulary usage
- `docs/concepts/runtime-usc-boundary.md` — vocabulary usage

For each instance, classify:
- **Legitimate** — the existing term is implementation vocabulary and the crystallized reading is already documented in SEMANTICS.md §2.14.2
- **Smear** — the document uses `operation` as a top-level object when it should use `Aim`, `Site`, `Cycle`, or `Act`
- **Gap** — the concept is real but has no crystallized term yet

### 2. Harden the vocabulary table

Update SEMANTICS.md §2.14 with:
- Clearer definitions of `Aim`, `Site`, `Cycle`, `Act`, `Trace`
- A definition of **Runtime Locus** if Task 330 evidence supports adding it as a hardened term
- An expanded "Current-Term Mapping" table
- An expanded "Forbidden Smears" table

### 3. Update cross-references

Update AGENTS.md and other docs to use crystallized terms in boundary descriptions, replacing smeared usage where it is not implementation vocabulary.

Do **not** rename code labels, DB columns, or API endpoints yet. Only update documentation and comments.

### 4. Produce a smear inventory

Create a list of all smears found, whether they were corrected in-place or deferred, and why.

## Non-Goals

- Do not rename existing runtime tables, CLI flags, or APIs.
- Do not invent new ontology frameworks.
- Do not remove the word `operation` from user-facing product copy (it remains a convenience word).
- Do not create derivative task-status files.

## Acceptance Criteria

- [ ] SEMANTICS.md §2.14 updated with hardened definitions and expanded mapping tables.
- [ ] At least one cross-document audit pass completed with findings documented.
- [ ] Forbidden smears table is complete and covers all prototype-discovered misuses.
- [ ] No code labels, DB columns, or APIs were renamed.
- [ ] A smear inventory exists (can be inline in the task file or a separate markdown file).

## Suggested Verification

```bash
rg -n "operation" SEMANTICS.md AGENTS.md docs/ --type md | head -50
```

Manual inspection: every instance of `operation` should be either (a) implementation vocabulary with a crystallized mapping, (b) user-facing convenience word, or (c) explicitly called out as a deferred rename.
