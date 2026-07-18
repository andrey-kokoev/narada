# Launch Artifact Integrity

## Status

This document defines the integrity contract for generated artifacts consumed
by Narada-owned launch paths. It is an implementation-facing architecture
contract, not an operator runbook and not a package-specific build guide.

The contract prevents a launcher from serving or executing generated output
whose source inputs have changed since that output was built. It preserves the
existing ownership split: build targets own their source and build declarations,
Narada CLI owns launch planning and verification, and User Site PowerShell
entrypoints remain thin adapters.

## Invariant

For a requested launch target `T`, launch admission requires all of the
following:

1. The artifact manifest is a supported `narada.launch_artifact.v1` document.
2. The target identity in the manifest matches `T`.
3. The source closure resolved from the current workspace has the same digest
   as the manifest's recorded source closure.
4. The build recipe and relevant toolchain identity match the recorded values.
5. Every required output exists and matches its recorded content digest.
6. The artifact was produced by the canonical build path for `T`.

If any condition fails, launch must be refused or the canonical build must be
run and verified before launch. A stale, incomplete, or partially verified
artifact must never be used as a fallback.

Formally:

```text
admit(T, A) iff
  manifest_supported(A)
  and target(A) == T
  and closure_digest(resolve_closure(T)) == source_digest(A)
  and toolchain_digest(T) == recorded_toolchain_digest(A)
  and outputs_match(A)
  and build_authority(A) == canonical_build_path(T)
```

## Ownership

The contract uses centralized enforcement with decentralized declarations:

| Owner | Responsibility |
| --- | --- |
| Build target package | Declares the target identity, build script, output root, and required outputs. |
| Narada CLI | Resolves transitive workspace closure, builds targets, writes manifests, and verifies launch admission. |
| User Site launcher | Resolves the User Site and delegates to Narada CLI. It does not reproduce closure or freshness logic. |
| Runtime and operator surface | Consume only the verified result selected by the launcher. They do not decide artifact freshness. |

The CLI verifier must be generic over target, runtime, operator surface, and
artifact layout. Adding a new UI, runtime, or operator-surface variant, or
packaged launch target should add a declaration and tests, not a new verifier
branch or a hardcoded package list.

## Source Closure

The closure resolver is the authority for current inputs. It must expand the
target's transitive workspace dependencies and include, where relevant:

- source files;
- shared UI or runtime package sources;
- package manifests and workspace metadata;
- build configuration and build scripts;
- lockfiles and package-manager configuration;
- toolchain identity that can affect output.

The resolver must detect relevant untracked files without depending on Git
cleanliness. Paths are normalized relative to the workspace and content is
hashed; mtimes, directory mtimes, and commit ids are not freshness authorities.

Generated output directories such as `dist` and dependency directories such as
`node_modules` are not source inputs. The output manifest records their
verified result instead of allowing generated files to participate in their own
input closure.

The manifest may include an expanded file list for diagnostics, but the
closure resolver remains authoritative. A hand-maintained file list in the
launcher is not an acceptable substitute for closure resolution.

## Manifest

The build path writes a generated manifest only after the target outputs have
been produced and verified. The minimum shape is:

```json
{
  "schema": "narada.launch_artifact.v1",
  "target": "narada-cli",
  "package": "@narada2/cli",
  "package_root": "packages/layers/cli",
  "output_root": "dist",
  "required_outputs": ["main.js", "index.js", "mcp-main.js", "ui/workbench.html"],
  "build_script": "build",
  "built_at": "2026-07-14T00:00:00.000Z",
  "source_closure": {
    "algorithm": "sha256",
    "source_hash": "...",
    "input_count": 42,
    "inputs": ["packages/layers/cli/src/main.ts"],
    "packages": ["@narada2/cli"]
  },
  "toolchain": {
    "node": "...",
    "package_manager": "pnpm@..."
  },
  "recipe": {"package": "@narada2/cli", "build_script": "build"},
  "recipe_hash": "...",
  "outputs": {
    "algorithm": "sha256",
    "tree_hash": "...",
    "file_count": 2,
    "files": [{"path": "index.html", "bytes": 1234, "sha256": "..."}],
    "required_missing": []
  }
}
```

Absolute paths, credentials, transient runtime state, and unbounded command
output do not belong in the manifest. Build timestamps may be retained as
diagnostic metadata but must not affect admission.

## Build And Launch Flow

The canonical flow is:

```text
target declaration
  -> resolve source closure
  -> compute source and recipe identity
  -> acquire the target build lock
  -> build the declared output
  -> verify required outputs
  -> write the manifest atomically
  -> re-verify launch admission
  -> launch
```

The launcher may invoke an `ensure` operation that rebuilds a missing or stale
target. It must not launch until the post-build verification succeeds. A build
failure produces a typed refusal with the target, mismatch category, and
canonical recovery command.

Consumers must not resolve arbitrary package `dist` paths before this boundary.
Source fallback is permitted only as an explicit development mode and must not
silently bypass production launch verification.

The target build lock prevents concurrent ensure operations from rebuilding the
same output simultaneously. Manifest publication is temporary-file plus rename;
the manifest is never accepted while partially written. A target that requires
stronger versioned output publication can add that as a package-owned build
contract without changing the verifier's target branches.

## Extension And CIS Rules

This contract preserves Narada's Constructive Invariant System by constraining
invalid launch state without closing valid transformation paths.

Future targets may differ in:

- UI framework or compiler;
- output directory and entrypoint shape;
- runtime host or operator surface;
- local, packaged, or other admitted artifact provider.

They must still provide the same target declaration, source closure, build
identity, required outputs, and verification result. The verifier must not
assume Vue, Vite, `dist/index.html`, one runtime, or one operator surface.

The following changes violate the intended extension boundary:

- adding target-specific freshness branches to the verifier;
- making all surfaces share one mandatory monolithic build;
- making the manifest a second owner of package source policy;
- coupling artifact validity to a carrier or provider name;
- requiring a content-addressed artifact store before an operational need exists.

## Non-Goals

This contract does not introduce:

- a content-addressed artifact store;
- committed generated `dist` output;
- Git cleanliness enforcement as a build prerequisite;
- a replacement for semantic typechecking;
- a second process-launch posture contract;
- a requirement that every target use the same build tool.

## Verification Requirements

The contract is not proven by testing only a helper that receives an inline
HTML fixture. Verification must exercise the real target manifest and output
boundary.

At minimum, coverage must prove:

1. A changed UI source file is refused until rebuilt.
2. A changed shared package, build config, package script, or lockfile is also
   detected.
3. A relevant untracked source file is included in the closure.
4. Missing, corrupted, or partially published outputs are refused.
5. A clean target builds and launches successfully.
6. Concurrent ensure operations do not expose partial output.
7. A new target can be added through declaration without changing verifier
   target branches.

## Related Contracts

- [`Build Toolchain Posture`](../concepts/build-toolchain-posture.md) defines
  authoritative compiler and build-tool policy.
- [`Process Launch Posture`](process-launch-posture.md) defines process
  visibility and lifecycle ownership after artifact admission.
- `C:\Users\Andrey\Narada\docs\operator\agent-start.md` defines
  operator-facing launcher behavior and recovery guidance.
- [`Narada Operator Workspace Target`](operator-workspace-target.md) defines
  browser workspace composition; it does not own artifact freshness.
