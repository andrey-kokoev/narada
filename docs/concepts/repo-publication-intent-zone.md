# Repository Publication Intent Zone

The Repository Publication Intent Zone (RPIZ) governs the crossing from local repository state to remote publication.

Raw `git commit` and `git push` are not the authority boundary. They are substrate operations that may be unavailable to an agent because Git metadata is mounted read-only, network is blocked, credentials are absent, or publication requires operator confirmation.

RPIZ separates three states:

1. `prepared`: Narada created a durable publication handoff, usually a Git bundle plus patch, and recorded it in SQLite.
2. `pushed`: a principal confirmed that the handoff reached the remote publication target.
3. `failed` / `abandoned`: a principal recorded that publication did not happen.

The invariant is: artifact creation is not remote publication.

## Crossing Artifacts

- `RepoPublicationIntent`: requester, repo root, branch, remote, task linkage, and commit message.
- `RepoPublicationHandoff`: commit hash, bundle path, patch path, base ref, and staged file list.
- `RepoPublicationConfirmation`: pushed / failed / abandoned status, confirming principal, remote ref, and failure reason when relevant.

## Relationship To CEIZ

CEIZ owns generic command execution. RPIZ owns the semantic publication crossing.

A Git command may be executed through CEIZ, but CEIZ success only means the command ran. RPIZ confirmation is what says the repository publication crossing completed.

## CLI Surface

```bash
narada publication prepare --message "..." --by <principal> --include <path>
narada publication list --status prepared
narada publication confirm <publication-id> --status pushed --by <principal> --remote-ref origin/main
```

`publication prepare` writes a durable bundle under `.ai/publications/<publication-id>/` and records the row in `.ai/task-lifecycle.db`. It does not claim that the remote was updated.
