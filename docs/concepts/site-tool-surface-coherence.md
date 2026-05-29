# Site Tool Surface Coherence

Narada Sites may hold state and declarations. Reusable executable logic should be package-owned or generated from a package template. A Site-local tool file is coherent only when its ownership class is explicit.

## Classes

- `canonical_package`: implementation lives in a Narada package and is invoked through the package contract.
- `legacy_package_mirror`: Site-local copy matches `@narada2/site-tool-surface-legacy` by path and hash; this is quarantine evidence, not a canonical API contract.
- `generated_wrapper`: Site-local wrapper generated from a package template, with version/hash evidence.
- `site_owned`: executable logic intentionally owned by this Site.
- `test_surface`: executable tests and conformance checks. These are governed evidence, not runtime tool authority.
- `retired_refusal`: legacy entrypoint kept only to refuse and point at the replacement.
- `runtime_state`: runtime artifact, not executable authority.

## Root Semantics

- `NARADA_USER_SITE_ROOT`: operator/user Site.
- `NARADA_SITE_ROOT`: current target Site.
- `NARADA_WORKSPACE_ROOT`: workspace containing the target Site.
- `NARADA_PC_SITE_ROOT`: machine-local PC Site runtime.
- `NARADA_PROPER_ROOT`: Narada proper checkout or package source root.

`TargetSiteRoot` must not default from `NARADA_USER_SITE_ROOT`. Hardcoded local topology is allowed only as explicit operator configuration or inert historical evidence.

## Manifest

Each Site has a `site-tool-surface.manifest.json` at the Site control root. It declares executable tool files, ownership class, package/version/hash evidence where applicable, and allowed root references.

The manifest is enforced by the user-site `Sync-SiteToolSurfaceManifest.ps1` validator. Non-git Sites also receive a `site-tool-surface-updates.jsonl` ledger when manifests are reconciled.

Broad executable declarations such as `tools/**/*.ps1` are refused. They hide copied implementation drift. Transitional `site_owned` declarations must be per-file so the remaining copied surface is visible and countable.

## Duplicate Site-Owned Surfaces

Repeated `site_owned` executable hashes across Sites are incoherent by default. Same bytes in multiple Sites means the file is acting like a package without a package contract.

The user-site duplicate audit groups manifest entries by content hash and fails unless every cross-Site duplicate group has an explicit exception record. Exceptions must name an owner, reason, and expiry. Expired exceptions fail. Stale exceptions with no current duplicate also fail.

The exception ledger is transitional evidence, not permission to keep copied toolsets indefinitely. It exists to make the remaining cutover work concrete and auditable while package-owned replacements are introduced.

Copied legacy runtime tools that have not yet been split into domain packages are mirrored by `@narada2/site-tool-surface-legacy`. Site manifests may classify a local copy as `legacy_package_mirror` only when its path and content hash match the package mirror manifest. This removes duplicate-authority debt without pretending the Site owns the copied implementation or that the mirror is a canonical runtime API.

Tests are classified as `test_surface`, not `site_owned`, so repeated tests do not create runtime tool authority debt.

When duplicate hashes are absent, the next cutover target is selected by `site_owned` burden: the surface family with the largest number of Site-owned executable entries across inspected Sites. This keeps package extraction grounded in observed Site-local surface area rather than intuition.

## Enforcement

`narada sites doctor <site-id> --kind <client|project|windows> --root <path>` is
the read-only guardrail for this domain. It reports checks as `pass`, `warn`,
`fail`, or `declared_exception`.

The coherence audit fails when:

- executable tool files are not declared by the manifest;
- generated `agent-cli` wrappers are not declared as `generated_wrapper`;
- generated wrappers have missing or mismatched version/hash evidence;
- broad executable declarations are present;
- repeated `site_owned` executable hashes appear across Sites without an explicit unexpired exception;
- duplicate exceptions are missing owner, reason, or expiry;
- duplicate exceptions remain after the corresponding duplicate no longer exists;
- known hardcoded local root/CLI defaults appear in executable surfaces;
- `TargetSiteRoot` defaults from the user Site root.

Generated agent-cli wrappers are repaired by running `narada sites reconcile agent-cli-wrapper --root <site-root-or-workspace> --apply`. The command renders `Start-AgentCliSession.ps1` from the packaged `@narada2/agent-cli` template and stamps the normalized template hash into the Site-local wrapper.

Tool-surface manifests are repaired by running `narada sites reconcile tool-surface-manifest --root <site-root-or-workspace> --apply`. This command is Narada-proper-owned; it replaces profile-local manifest sync as the canonical finite repair surface.

It reports a declared exception when a Site-local executable surface is
manifested as `site_owned` but does not yet carry full owner, scope, reason,
and review metadata.

The current transitional posture still permits per-file `site_owned` declarations for copied toolsets. That is not the final architecture; it is a declared state from which surfaces can be cut over one at a time to package-owned implementations and generated wrappers.
