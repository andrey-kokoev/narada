# Task 1240 Packages Doctrinal Review

## Scope

Review target: `D:\code\narada\packages`.

Source plan: `.narada/audit/task-1239-doctrinal-review-plan.md`.

Sampling method:

- Enumerated package manifests and README/docs paths under `packages/`.
- Searched package text for doctrine-sensitive terms: SQLite, source Site state, runtime state, narada-andrey, WSL, operator-surface, secrets, credentials, arbitrary SQL, direct shell, and native shell.
- Checked immediate package manifest names for reusable Narada package set coverage.
- Reviewed representative descriptor packages: `site-task-lifecycle`, `agent-context-memory`, `site-inbox`, `site-config`, `site-lift`, `crew-startup-shortcut`, Windows machinery packages, MCP shell/test/supervisor packages.
- Reviewed runtime-owning package families as separate zones: `layers/control-plane`, `layers/cli`, `sites/linux`, mailbox/search verticals.

## Doctrine Lenses

- Authority-homogeneous zones and governed crossings.
- Intelligence-Authority Separation.
- Plural Embodiment, Singular Authority.
- Inhabited Evolution.
- Constructive universalization by re-instantiation.
- Canonical Mutation Evidence.
- Governed Crossing.

## Findings

### P1: Package Role Classification Is Mostly Implicit

Package posture is broadly coherent, but the package set does not yet have a single machine-readable catalog that classifies packages by authority role:

- pure descriptor/contract package;
- runtime/control-plane authority package;
- platform template package;
- MCP boundary package;
- vertical implementation package;
- CLI exposure package.

The distinction is present in README/docs and tests, especially in the newer reusable Site packages, but future agents still need to infer it package-by-package.

Risk: agents may overgeneralize a runtime-owning package such as `@narada2/control-plane` or `@narada2/sites-linux` into the descriptor-only posture used by `@narada2/site-task-lifecycle` and `@narada2/agent-context-memory`, or conversely treat descriptor packages as live authority carriers.

Recommended follow-up: create a package role catalog under `packages/` or `.narada/capabilities/` and add a small check that descriptor packages do not acquire SQLite, shell, secret, or runtime mutation dependencies without an explicit role change.

## Coherent Postures Observed

- `@narada2/site-task-lifecycle` states adapter-interface-only posture, no package-owned SQLite dependency, no SQLite mutation, source-state refusal, MCP request/result contracts, and Windows PowerShell consuming-Site guidance.
- `@narada2/agent-context-memory` states descriptor/contract posture, no SQLite dependency ownership, no live hydration execution, and refusal guards for source DBs, checkpoint history, rosters, task/inbox state, operator-surface state, PC-locus state, secrets, and identity-specific runtime state.
- `@narada2/site-inbox`, `@narada2/site-config`, and `@narada2/site-lift` preserve descriptor/admission/refusal posture and reject source DB/history/runtime/credential imports.
- Windows machinery packages carry refusal tests/docs for PC-locus state, WSL crossings, credentials, operator-surface runtime copying, and source Site state imports.
- `@narada2/mcp-shell-windows` is correctly framed as a boundary/policy package, not a live shell execution grant.
- Runtime-owning packages such as `@narada2/control-plane`, `@narada2/cli`, and `@narada2/sites-linux` legitimately include SQLite/credential/runtime concepts as implementation zones rather than descriptor-only reusable packages.

## Non-Findings

- No reviewed reusable descriptor package appeared to import narada-andrey runtime databases, task/inbox history, rosters, checkpoints, operator-surface runtime, PC-locus runtime, secrets, or credentials as package truth.
- No reviewed Windows MCP package appeared to silently admit raw WSL crossing as current Narada proper mutation authority.
- No package source behavior was changed by this review.

## Residual Risks

- This was bounded sampling, not a full formal proof of every source file in `packages/`.
- Some old control-plane/mailbox fixture strings contain test secrets or customer-like text; they appear to be test fixtures in runtime vertical zones, not reusable package imports, but a dedicated fixture-doctrine review could classify them more finely.

## Verification

- `rg --files packages -g package.json -g README.md -g "*.md" | Sort-Object`
- `rg "sqlite|better-sqlite|node:sqlite|source Site|runtime state|narada-andrey|WSL|wsl|operator-surface|secret|credential|arbitrary SQL|direct shell|native shell" packages -n`
- `Get-ChildItem packages -Directory | ForEach-Object { ... package.json ... } | ConvertTo-Json -Depth 4`
