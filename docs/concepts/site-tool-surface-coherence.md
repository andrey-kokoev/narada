# Site Tool Surface Coherence

Narada Sites may hold state and declarations. Reusable executable logic should be package-owned or generated from a package template. A Site-local tool file is coherent only when its ownership class is explicit.

## Classes

- `canonical_package`: implementation lives in a Narada package and is invoked through the package contract.
- `generated_wrapper`: Site-local wrapper generated from a package template, with version/hash evidence.
- `site_owned`: executable logic intentionally owned by this Site.
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

## Enforcement

`narada sites doctor <site-id> --kind <client|project|windows> --root <path>` is
the read-only guardrail for this domain. It reports checks as `pass`, `warn`,
`fail`, or `declared_exception`.

The coherence audit fails when:

- executable tool files are not declared by the manifest;
- generated `agent-cli` wrappers are not declared as `generated_wrapper`;
- generated wrappers have missing or mismatched version/hash evidence;
- broad executable declarations are present;
- known hardcoded local root/CLI defaults appear in executable surfaces;
- `TargetSiteRoot` defaults from the user Site root.

It reports a declared exception when a Site-local executable surface is
manifested as `site_owned` but does not yet carry full owner, scope, reason,
and review metadata.

The current transitional posture still permits per-file `site_owned` declarations for copied toolsets. That is not the final architecture; it is a declared state from which surfaces can be cut over one at a time to package-owned implementations and generated wrappers.
