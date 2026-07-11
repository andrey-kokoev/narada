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
ignored by the Site's source-control policy. Non-Site user roots use separate
User Site-owned stores under the User Site runtime area. Each root has its own
policy file and store identity, and requires an explicit `--user-site-root`
plus `--root` crossing.

## Lifecycle

1. `history enable` writes a versioned, disabled-by-default policy at the
   owning authority root and opts it in explicitly.
2. `history start --background` starts the host-local process. The process
   takes an owner lock, writes health, scans admitted roots, and polls for
   stable changes.
3. Captures use stable-read verification, SHA-256 content addressing, and
   SQLite metadata. Identical content is deduplicated.
4. Deletes become tombstone snapshots. Symlinks/reparse points, excluded
   paths, oversized files, unstable reads, and paths outside admitted roots
   are refused or skipped without content capture.
5. Retention and quota garbage collection preserve pinned snapshots and the
   latest snapshot for each file.
6. Restore is routed through the owning Site. It requires `--confirm`, takes
   a pre-restore snapshot, detects a changed target, and requires `--force`
   for a stale overwrite.

## CLI Projection

```text
narada history status --site-root <workspace>
narada history enable --site-root <workspace>
narada history configure --site-root <workspace> --watch-root src
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
