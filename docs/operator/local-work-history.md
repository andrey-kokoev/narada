# Local Work History Runbook

Local history is opt-in. No Site is captured until its owning Site policy is
created and enabled.

## Enable A Site

```powershell
narada history enable --site-root D:\code\my-site
narada history start --site-root D:\code\my-site --background
narada history status --site-root D:\code\my-site
```

The policy is stored at
`D:\code\my-site\.narada\local-history.json`; payloads remain under
`D:\code\my-site\.narada\runtime\local-history`.

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
continues to answer `show`, `diff`, `forget`, and `restore`.

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
any repository owned by a Site.
