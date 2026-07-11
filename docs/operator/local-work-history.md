# Local Work History Runbook

Local history is opt-in. No Site is captured until its owning Site policy is
created and enabled.

New policies resolve defaults in this order: non-removable privacy floor,
package baseline, optional User Site template at
`<user-site>/config/local-history.defaults.json`, then explicit command
options. Once written, the Site policy is authoritative and later User Site
template changes do not alter it. An unregistered root uses a separate
User Site-owned policy and store. There is no host-wide capture policy.

## Enable A Site

```powershell
narada history enable --site-root D:\code\my-site
narada history start --site-root D:\code\my-site --background
narada history status --site-root D:\code\my-site
```

The policy is stored at
`D:\code\my-site\.narada\local-history.json`; payloads remain under
`D:\code\my-site\.narada\runtime\local-history`.

For a Git-backed owner, `history enable` refuses until each artifact is covered
by the ignore policy of the Git repository that owns its path. A Site store
uses `.narada/runtime/local-history/`; a non-Site User Site root also requires
the workspace marker `.narada/local-history-workspace.json`. A User Site store
outside the workspace is checked against the User Site repository, rather than
against the product workspace repository. This prevents local-history payloads
and derived identity metadata from entering durable repository state. Background
start reports whether the daemon is ready; `starting` means the process is
still being supervised and should be checked with `history status`.

The background process owns the history writer lock. Read-only commands such as
`status`, `list`, `show`, and `diff` can run while it is active. Stop the
background process before writer commands such as `capture`, `configure`,
`pin`, `forget`, or `restore`, then start it again when the mutation is done.
This makes the ownership boundary explicit and prevents concurrent SQLite/blob
updates.

`--exclude` adds patterns. Use `--replace-exclusions` when the configured
additional exclusion set should be replaced; the selected posture baseline and
mandatory privacy exclusions remain active.
`--privacy-posture custom_exclusions` removes the standard generated-tree
defaults for a newly created or explicitly reconfigured policy, but never
removes the privacy floor. Stable-read settings are configurable with
`--stable-read-attempts` and `--stable-read-delay-ms`. `--poll-interval-ms`
and `--once` affect only the current daemon process.

## Inspect And Restore

```powershell
narada history list --site-root D:\code\my-site
narada history show <snapshot-id> --site-root D:\code\my-site
narada history restore <snapshot-id> --site-root D:\code\my-site --confirm
```

If the target changed since the selected snapshot, restore refuses with a
stale-target result. Review the current file and use `--force` only when the
overwrite is intentional.

## User Site Projection

To make another Site discoverable from the User Site without moving its
content:

```powershell
narada history status --site-root D:\code\my-site --user-projection-root C:\Users\Andrey\Narada
```

The projection contains metadata and snapshot pointers only. The owning Site
continues to answer `show`, `diff`, `forget`, and `restore`. If the User Site is
Git-backed, its projection directory must also be ignored; the CLI refuses to
write an unignored projection.

## Non-Site Roots

An explicitly unregistered root must use the User Site store:

```powershell
narada history enable --user-site-root C:\Users\Andrey\Narada --root D:\scratch\notes
narada history start --user-site-root C:\Users\Andrey\Narada --root D:\scratch\notes --background
narada history status --user-site-root C:\Users\Andrey\Narada --root D:\scratch\notes
narada history list --user-site-root C:\Users\Andrey\Narada --root D:\scratch\notes
```

Each non-Site root receives a separate User Site policy and runtime store.
This path is separate from Site stores and does not silently admit or capture
any repository owned by a Site. A small identity marker travels with the root,
so moving the root preserves its User Site policy and history identity. Status
reports physical stored bytes as `counts.bytes` and logical snapshot bytes as
`counts.logical_bytes`; deduplicated content is counted once toward storage
quota.
