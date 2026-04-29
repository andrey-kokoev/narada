# Coverage Audit Zone

Coverage Audit is the authority zone for detecting when a Narada surface claims more than its implemented, tested, or operable behavior proves.

It exists because self-build work creates doctrine, task records, CLI labels, helper scripts, tests, and operator-facing summaries at different speeds. Without a dedicated audit zone, discovery of an overclaim tends to collapse directly into repair, blame, or silent drift. Coverage Audit keeps detection inert until a governed admission path decides what should happen.

## Authority Posture

The Coverage Audit Zone is observational and cataloging-only.

It may:

- Inspect code, docs, tests, task records, CLI help, operator-facing labels, and exported evidence.
- Compare a claimed behavior with implemented normal-path behavior.
- Record suspected underimplementation in a bounded catalog artifact.
- Recommend admission paths such as inbox observation, CAPA candidate, follow-up task, deferred entry, or rejection.

It must not:

- Rewrite implementation.
- Close, reopen, or amend tasks.
- Treat a grep hit as a defect without evidence.
- Treat fixture-only proof as normal-path proof.
- Treat discovery as automatic admission into the task lifecycle.

Repair belongs to the admitted follow-up path, not to the audit zone itself.

## Inputs

Valid inputs include:

- CLI command descriptions and help output.
- Documentation claims, diagrams, and doctrine pages.
- Task acceptance criteria, reports, reviews, and closure evidence.
- Tests and fixtures that purport to prove a capability.
- Operator-facing labels in command output, workboards, dashboards, or generated artifacts.
- Implementation surfaces such as commands, services, schemas, stores, and adapters.
- Operator corrections or inbox observations about a suspected overclaim.

## Catalog Artifact

The audit output is a bounded catalog. It is not a raw transcript.

Each entry should use this shape:

```json
{
  "entry_id": "coverage-audit:20260429:example",
  "surface": {
    "kind": "cli_command | doc | task | test | operator_label | concept | script | mcp_tool",
    "ref": "narada task work-next"
  },
  "claim_source": {
    "kind": "help_text | docs | task_acceptance | report | test_name | label | operator_memory",
    "ref": "AGENTS.md#documentation-index"
  },
  "claimed_behavior": "What the surface appears to promise.",
  "observed_behavior": "What the implementation or evidence currently proves.",
  "missing_behavior": "The smallest concrete behavior gap, if any.",
  "evidence": [
    {
      "kind": "file | command | test | operator_observation | artifact",
      "ref": "path or bounded command result",
      "summary": "Short evidence summary."
    }
  ],
  "impact": "operator_confusion | false_authority | brittle_workflow | latent_bug | docs_drift | none",
  "owner_locus": "narada-proper | user-site | pc-site | project-site | unknown",
  "confidence": "low | medium | high",
  "recommended_action": "reject | defer | inbox_observation | capa_candidate | followup_task | docs_patch | implementation_patch",
  "admission_state": "cataloged | admitted | rejected | deferred | superseded",
  "residuals": []
}
```

Required fields are `surface`, `claim_source`, `claimed_behavior`, `observed_behavior`, `missing_behavior`, `evidence`, `impact`, `owner_locus`, `confidence`, `recommended_action`, and `admission_state`.

## Discovery Methods

The audit sweep should cover:

- `TODO`, `TBD`, `placeholder`, `stub`, `fake`, `not implemented`, `manual`, `dry-run`, `fixture`, `simulation`, and `temporary` markers.
- CLI help text that names capabilities stronger than the command implements.
- Docs that describe commands, lifecycle transitions, Site behavior, MCP tools, or daemon behavior without matching code.
- Task acceptance criteria checked without matching normal-path evidence or tests.
- Tests whose names imply production behavior while proving only helpers, fixtures, mocks, or manual path behavior.
- Operator labels such as `done`, `complete`, `live`, `automatic`, `canonical`, `daemon`, or `MCP` where the surface is actually advisory, inert, or local-only.
- Adjacent operator buttons that expose implementation decomposition instead of projections of one canonical capability family.
- Operator-surface tests that prove command-local behavior but not the operator-visible invariant.

The motivating example category is display-toggle or swap-monitor style capability claims: a manual helper, fixture proof, or script stub may be valuable evidence, but it must not be labeled as a normal-path automatic capability until the normal path exists and is proven.

## Bounded Initial Sweep Protocol

A first sweep may use search, but must reduce it to an artifact before presentation:

```bash
rg -n "TODO|TBD|placeholder|stub|not implemented|manual|dry-run|fixture|simulation|temporary" docs packages scripts AGENTS.md SEMANTICS.md
```

Admission requirements for the sweep:

- Limit raw output at collection time.
- Deduplicate by surface, not by line hit.
- Classify each candidate into the catalog schema.
- Include at most the bounded evidence summary needed to reproduce the finding.
- Prefer a generated artifact such as `.ai/coverage-audits/<timestamp>.json` over chat transcript.

The protocol may be automated later, but automation must preserve the non-repair rule.

## Admission Paths

Catalog entries are inert until admitted.

Allowed admission outcomes:

- `reject`: evidence does not show an implementation gap.
- `defer`: real gap, but not actionable yet.
- `inbox_observation`: useful coherence signal without immediate task pressure.
- `capa_candidate`: process defect or recurring class of failure.
- `followup_task`: concrete repair with owner, locus, and acceptance criteria.
- `docs_patch`: claim should be weakened or clarified.
- `implementation_patch`: behavior should be implemented to match the claim.

Admission should record why the selected path is correct and what evidence was used.

## Relation To Other Zones

Coverage Audit is upstream of repair. It can feed:

- Canonical Inbox, when the finding is an inert observation or proposal.
- CAPA Operation, when the issue is systemic.
- Task lifecycle, when a concrete repair is admitted.
- Command Execution Intent Zone or Testing Intent Zone, when bounded command or test evidence is needed.
- Site Immune Sensing, when the issue is suspected authority-zone tampering rather than overclaim.

Coverage Audit does not replace reviews. Reviews decide admission for a specific artifact. Coverage Audit scans for mismatches between claim and proof across surfaces.

## First Implementation Slice

The first implementation slice should be a read-only audit command or script that:

- Runs bounded searches over declared scopes.
- Emits a catalog JSON artifact.
- Stores no lifecycle mutation by default.
- Provides optional `--submit-inbox` or `--create-task` handoff only through existing governed admission commands.
- Supports human and JSON summaries without dumping raw transcripts.

Until that command exists, agents should use the bounded manual protocol above and submit only catalog artifacts or admitted follow-up tasks.
