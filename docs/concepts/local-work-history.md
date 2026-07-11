# Local Work History

Local Work History is a Site-owned recovery mechanism for file states. It is
not a Git replacement, repository source of truth, editor feature, NARS
feature, or MCP surface.

## Authority Shape

The owning Site is authoritative for:

- opt-in policy and admitted roots;
- exclusion, privacy, size, quota, and retention rules;
- immutable snapshots and content-addressed blobs;
- tombstones, pins, garbage collection, and restore;
- stale-target detection and rollback evidence.

The User Site coordinates discovery, defaults, unified navigation, and
cross-Site projection. A User Site projection may contain Site id, workspace
root, relative paths, hashes, timestamps, and snapshot ids. It must contain no
snapshot content from another Site and cannot grant Site authority.

Defaults are a creation template, not a second authority. When a new policy is
created, the package baseline is overlaid by the optional User Site file
`<user-site>/config/local-history.defaults.json`; an existing Site policy then
wins permanently. A Site policy is the effective authority for its workspace.
For an explicitly unregistered root, the User Site policy is both the template
consumer and the effective authority for that root. There is no host-wide
history policy.

The host-local process may serve multiple Sites, but each Site has a separate
policy, SQLite index, blob store, owner lock, health record, and lifecycle. It
cannot use one Site's policy or store for another Site.

## Storage

For a normal Site workspace, the volatile store is:

```text
<workspace>/.narada/runtime/local-history/
  history.sqlite
  blobs/sha256/<prefix>/<sha256>
  owner.lock
  health.json
```

The store is outside admitted roots and is volatile runtime state. It must be
ignored by the Git repository that owns the store path. Non-Site user roots use
separate User Site-owned stores under the User Site runtime area. Each root has
its own policy file and store identity, and requires an explicit
`--user-site-root` plus `--root` crossing. Status exposes physical stored bytes
as `counts.bytes` and logical snapshot bytes as `counts.logical_bytes`.

User-root identity is carried by a small ignored workspace marker. The User
Site policy and store keys therefore remain stable when the root is moved; the
absolute workspace path is refreshed as derived metadata rather than treated
as identity.

## Lifecycle

1. `history enable` writes a versioned, disabled-by-default policy at the
   owning authority root and opts it in explicitly. The resolution order is
   hard safety floor, package defaults, optional User Site defaults, existing
   persisted policy, and explicit `enable`/`configure` patches. Existing
   policies are never silently re-seeded from later User Site changes.
2. `history start --background` starts the host-local process. The process
   takes an owner lock, publishes atomic lifecycle records, writes health,
   scans admitted roots, and polls for quiet stable changes. The CLI does not
   report a successful start until the daemon publishes a matching live record.
   The daemon owns the writer lock for its lifetime. Read-only inspection can
   proceed while it runs, but writer commands (`capture`, `configure`, `pin`,
   `forget`, and `restore`) must stop the daemon first and may start it again
   afterward.
3. Captures use stable-read verification, SHA-256 content addressing, and
   SQLite metadata. Identical content is deduplicated.
4. Deletes become tombstone snapshots. Symlinks/reparse points, excluded
   paths, oversized files, unstable reads, and paths outside admitted roots
   are refused or skipped without content capture. The privacy floor always
   excludes Git metadata, Narada authority data, environment files, key/cert
   material, and secret/credential-named paths; policy edits cannot remove
   that floor. `default_exclusions` additionally excludes generated/build
   trees, while `custom_exclusions` starts without those optional exclusions.
5. Retention and quota garbage collection preserve pinned snapshots and the
   latest snapshot for each file.
6. Restore is routed through the owning Site. It requires `--confirm`, takes
   a pre-restore snapshot, detects a changed target, and requires `--force`
   for a stale overwrite.

Inspection opens an existing SQLite store read-only. If no store exists yet,
status uses an in-memory empty view and does not create persistent history
artifacts. Projection is an explicit metadata write and is subject to the
User Site's own ignore policy.

## CLI Projection

```text
narada history status --site-root <workspace>
narada history enable --site-root <workspace>
narada history configure --site-root <workspace> --watch-root src
narada history configure --site-root <workspace> --stable-read-attempts 4 --stable-read-delay-ms 75
narada history configure --site-root <workspace> --privacy-posture custom_exclusions --replace-exclusions --exclude docs/generated/**
narada history start --site-root <workspace> --background
narada history stop --site-root <workspace>
narada history list --site-root <workspace>
narada history show <snapshot-id> --site-root <workspace>
narada history diff --from <snapshot-id> --to <snapshot-id> --site-root <workspace>
narada history pin <snapshot-id> --site-root <workspace>
narada history forget <snapshot-id> --site-root <workspace>
narada history restore <snapshot-id> --site-root <workspace> --confirm --force
```

For a root that is not admitted to a Site, use the explicit User Site form:

```text
narada history enable --user-site-root <user-site> --root <unregistered-root>
```

This does not make the User Site authoritative over any Site repository.

## User Site Defaults

The optional template is:

```text
<user-site>/config/local-history.defaults.json
```

It uses `packages/local-history/defaults.schema.json` and may contain partial
values for roots, exclusions, size, debounce, stable reads, retention, quota,
and privacy posture. It affects only newly created policies. The package
baseline is used when the file is absent. `--replace-exclusions` makes the
replacement explicit; otherwise repeated `--exclude` values are additive.
`--poll-interval-ms` and `--once` remain per-daemon runtime controls and are
not persisted in the policy.
