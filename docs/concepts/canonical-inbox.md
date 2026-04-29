# Canonical Inbox

Canonical Inbox is Narada's typed-envelope intake zone. It is not an email mailbox; email is one source among chat, diagnostics, agent reports, file drops, CLI submissions, webhooks, and system observations.

Inbox envelopes are inert. Submitting an envelope does not create a task, execute a command, mutate Site configuration, or author knowledge. An envelope can only be inspected or promoted across an explicit governed crossing.

Canonical Inbox is a stabilized Governed Crossing form for arrivals that may or may not become consequential. See [`governed-crossing.md`](governed-crossing.md).

## CLI Surface

```bash
narada inbox doctor
narada inbox submit-observation --source-ref codex-session:pc-friction --title "PC Site identity mismatch" --summary "hostname and COMPUTERNAME differ" --evidence "hostname=desktop-sunroom-2" --evidence "COMPUTERNAME=DESKTOP-SUNROOM" --principal architect
narada inbox submit --source-kind diagnostic --source-ref site-doctor:desktop-sunroom-2 --kind observation --authority-level system_observed --payload-file /tmp/site-observation.json
narada inbox ingest-files --from .ai/inbox-drop
narada inbox ingest-files --from .ai/inbox-drop --admit --by operator
narada inbox publish
narada inbox publish --execute
narada inbox publish --execute --push
narada inbox work-next --claim --by operator
narada inbox list
narada inbox show <envelope-id>
narada inbox architect-process <envelope-id> --by architect
narada inbox task <envelope-id> --title "Fix PC Site identity policy" --by operator --assign builder
narada inbox triage <envelope-id> --action archive --by operator
narada inbox pending <envelope-id> --to site_config_change:site:desktop-sunroom-2 --by operator
```

Prefer `submit-observation` for routine observations from chat, diagnostics, and agent reports. It builds the typed payload from flags, writes the envelope, reads it back, confirms payload equivalence, and returns the Git-visible envelope artifact path for portable visibility.

Use `--principal <id>` to set `authority.principal`. `--authority-principal <id>` is accepted as a compatibility alias on `inbox submit` and `inbox submit-observation` for callers that name the field by its envelope location.

Use low-level `submit` when the caller already has a complete typed envelope payload. Prefer `--payload-file` or `--payload-stdin` for non-trivial payloads. Inline JSON is acceptable for tiny POSIX-shell examples, but it is brittle across PowerShell, chat copy/paste, and multi-line payloads. Empty object payloads are rejected for observations and task candidates unless `--allow-empty-payload` is explicit.

Successful `inbox submit` and `inbox submit-observation` write two surfaces:

| Surface | Role |
| --- | --- |
| `.ai/inbox.db` | Local runtime substrate for the current embodiment. It is ignored and must not be merged as authority. |
| `.ai/inbox-envelopes/*.json` | Git-visible portable handoff artifact. Other embodiments see the envelope by importing these artifacts. |

If another embodiment, clone, or Site actor must see the inbox item, publish the exported `.ai/inbox-envelopes/*.json` artifact. `narada inbox publish` is dry-run by default; `narada inbox publish --execute` exports/replays local envelopes, stages only `.ai/inbox-envelopes`, and commits those portable artifacts. `narada inbox publish --execute --push` also pushes. The command refuses raw `.ai/inbox.db` publication because the SQLite database is local runtime substrate, not merge authority.

`inbox publish` is an ergonomic helper for the Repository Publication Intent Zone posture. Its commit/push steps are substrate operations for the inbox-envelope handoff crossing; they do not make raw Git the governing authority. For broader code, task, or doctrine changes, use the normal repo publication path rather than treating `inbox publish` as a generic commit command.

Running `narada inbox export --format json` remains valid and idempotent as a bulk/replay export for older or repaired local SQLite rows, but normal submission writes the per-envelope artifact immediately to avoid local-only invisible work.

For pre-fix or externally created envelopes that exist only in `.ai/inbox.db`, run:

```bash
narada inbox publish
narada inbox publish --execute --push
```

Then, in the receiving embodiment:

```bash
git pull
narada inbox import
narada inbox work-next
```

`narada inbox doctor` reports whether `.ai/inbox-envelopes/*.json` artifacts are uncommitted or whether the current branch has unpushed commits that may contain portable inbox artifacts.

Run `narada inbox doctor` before cross-environment submission or publication. It reports the working directory, Git delivery coordinates, inbox DB accessibility, Node executable, CLI entrypoint, platform/WSL posture, package root, repository dist entrypoint, delegated Narada CLI embodiment loadability, and whether canonical inbox commands are available from the current runtime.

Runtime substrate health and delegated command-surface health are separate. A Site can have an accessible inbox DB and valid runtime state while its Site-local scripts delegate to a broken Narada CLI embodiment. `inbox doctor` reports that as `delegated_cli_embodiment_loadable` instead of smearing it into inbox or daemon health.

Command responsibilities:

| Command | Responsibility |
| --- | --- |
| `narada inbox submit` / `submit-observation` | Admit an inert typed envelope into local inbox substrate and write its portable artifact. |
| `narada inbox export` | Bulk/replay generation of portable artifacts from local SQLite rows. |
| `narada inbox publish` | Bounded handoff helper: export/replay, stage `.ai/inbox-envelopes`, commit, and optionally push. |
| `narada inbox import` | Replay portable artifacts from Git-visible handoff into local inbox substrate. |
| `narada inbox doctor` | Inspect local delivery, runtime, import refresh, and publication posture without publishing. |
| `narada inbox architect-process` | Architect-side handoff: create a detailed Builder-owned task from a task envelope, claim it for Builder, route the envelope to the task, and stop before implementation/report/closure. |
| `narada publication *` | General Repository Publication Intent Zone handoff/confirmation for broader repo mutation bundles. |

## Human File-Drop Intake

`narada inbox ingest-files` is the human-authored file-drop adapter. It treats a configured folder as a source surface, not as a second inbox authority.

By default it is read-only:

```bash
narada inbox ingest-files --from .ai/inbox-drop
```

Mutation requires explicit admission:

```bash
narada inbox ingest-files --from .ai/inbox-drop --admit --by operator
```

Each candidate item must be named `YYYYMMDD-NNN-slug`. An item may be:

| Item | Admission rule |
|------|----------------|
| `.md` or `.txt` file | The file body becomes one envelope payload. Optional front matter may set `kind`, `title`, `summary`, `authority_level`, or `principal`. |
| Folder | The folder is one message. `README.md`, `message.md`, or `intent.md` supplies the body. Other child files are recorded as supporting-file metadata. |

Front matter `kind` should use canonical envelope kinds such as `observation`, `task_candidate`, or `command_request`. The human shorthand `request` is accepted as an alias for `command_request` so file-drop authors do not have to know the internal enum name. Unsupported kinds fall back to `observation` in candidate inspection rather than inventing a new envelope kind.

Admission writes exactly one `file_drop` envelope per item path and content digest. Re-running admission skips already-admitted path/digest pairs. Invalid names, unsupported file extensions, empty bodies, and folders without a canonical body file are reported as rejected candidates in dry-run output.

## Envelope Axes

| Axis | Purpose |
|------|---------|
| `source` | Where the item arrived from |
| `kind` | What the item means |
| `authority` | What force the item has |
| `status` | Intake lifecycle state |
| `promotion` | Optional target after governed promotion |
| `handling` | Optional claim/lease metadata while a principal handles the envelope |
| `capability` | Optional inert capability metadata for requirements, requests, claims, references, grant evidence, refusals, or revocations |

## Capability Metadata

Inbox envelopes may carry typed capability metadata. This metadata is a crossing artifact, not executable authority.

Capability metadata can express:

| Field | Meaning |
| --- | --- |
| `capability_requirements` | Capabilities the target crossing would need before consequence, such as `github.repo:write`. |
| `capability_requests` | Requests for the receiving authority to consider granting or binding a capability. |
| `capability_claims` | Sender claims about capability posture; these require local verification before use. |
| `capability_references` | Receiver-local references such as `env:NARADA_GRAPH_TOKEN` or `credential-manager:Narada/mailbox`; never raw values. |
| `capability_grant_evidence` | Evidence that an operator or authority granted something elsewhere. Evidence is not a local grant until admitted. |
| `capability_refusals` | Explicit refusal to provide or exercise a capability. |
| `capability_revocations` | Notice that a previous capability should be distrusted, expired, or reviewed. |

The receiving Site resolves actual power through its local capability authority, normally the Canonical Capability Consent Registry and secret-management policy. A signed envelope may prove origin; it does not grant mutation authority.

Raw API keys, passwords, bearer tokens, private keys, refresh tokens, and long-lived secrets are forbidden in normal inbox envelopes. If Narada ever supports encrypted secret transfer, that must be a separate high-risk, consent-governed path with explicit capability and trust admission.

### Capability Examples

Proposal requiring repository write:

```json
{
  "kind": "proposal",
  "capability": {
    "capability_requirements": [
      {
        "capability_kind": "github.repo",
        "scope": { "repo": "andrey-kokoev/narada" },
        "actions": ["commit", "push"]
      }
    ]
  }
}
```

Operator grant evidence for an agent:

```json
{
  "kind": "observation",
  "capability": {
    "capability_grant_evidence": [
      {
        "principal_id": "andrey",
        "agent_id": "architect",
        "capability_kind": "github.repo",
        "actions": ["push"],
        "expires_at": "2026-04-28T23:59:59.000Z",
        "evidence_ref": "operator-chat:grant-001"
      }
    ]
  }
}
```

Receiver-local credential reference:

```json
{
  "kind": "proposal",
  "capability": {
    "capability_references": [
      {
        "capability_kind": "mail.graph",
        "credential_ref": "credential-manager:Narada/help-mailbox",
        "resolution_locus": "receiver"
      }
    ]
  }
}
```

Revocation or refusal notice:

```json
{
  "kind": "observation",
  "capability": {
    "capability_refusals": [
      { "capability_kind": "filesystem.write", "reason": "outside declared Site root" }
    ],
    "capability_revocations": [
      { "grant_ref": "cap_123", "reason": "operator revoked access" }
    ]
  }
}
```

Related doctrine: [`canonical-capability-consent-registry.md`](canonical-capability-consent-registry.md), [`capability-governed-secret-management.md`](capability-governed-secret-management.md), and [`verifiable-envelope-trust.md`](verifiable-envelope-trust.md).

## Example

The Windows PC-locus friction where `hostname` reports `desktop-sunroom-2` while `%COMPUTERNAME%` reports `DESKTOP-SUNROOM` should enter as an observation envelope first. It can later be promoted to a task or site configuration policy only after the operator accepts that crossing.

## Promotion Semantics

Promotion is the governed crossing out of the Inbox. It must not imply more than actually happened.

| Target kind | Behavior |
|-------------|----------|
| `task` | Executed for `task_candidate`, `upstream_task_candidate`, `proposal`, and `observation` envelopes by calling the sanctioned task creation command. Prefer `narada inbox task <envelope-id> --by <principal>`; `inbox promote --target-kind task` remains the canonical compatibility path. The envelope records `enactment_status: enacted` and `target_ref: task:<number>`. Repeating the promotion returns the existing promotion and does not create a duplicate task. |
| `archive` | Records the envelope as `archived` with no target-zone mutation. `--target-ref` is optional. |
| `decision`, `operator_action`, `knowledge_entry`, `site_config_change` | Recorded as `enactment_status: pending` and `pending_kind: recorded_pending_crossing` until those target zones have explicit executable promotion operators. |

An unsupported or not-yet-executable target may be recorded as a pending crossing, but it must not be reported as enacted.

For task promotion, CLI overrides take precedence over payload fields:

```bash
narada inbox task <envelope-id> --by operator --title "..." --goal "..." --criteria "First criterion" --criteria "Second criterion"
```

Use `--assign <principal>` when the created task should be claimed immediately:

```bash
narada inbox task <envelope-id> --by architect --assign builder
```

Generated tasks preserve source envelope id, source ref, envelope kind, summary/body/evidence/proposal/recommendation context, detailed required work, and acceptance criteria when payload structure provides them. The command must not leave `TBD` placeholders when the envelope contains enough structure to derive the task specification.

## Work-Next

`narada inbox work-next` is the bounded operator/agent surface for deciding what to do next. Without `--claim`, it returns the next received envelope plus admissible actions and does not mutate the Inbox. With `--claim --by <principal>`, it atomically moves the selected envelope to `handling` so another worker does not receive it as unclaimed work.

```bash
narada inbox work-next --kind task_candidate --format json
narada inbox work-next --claim --by operator --format json
```

The normal loop is:

```bash
narada inbox work-next
narada inbox triage <envelope-id> --action task --by operator
narada inbox triage <envelope-id> --action archive --by operator
narada inbox pending <envelope-id> --to site_config_change:site:desktop-sunroom-2 --by operator
```

When the next envelope should become Builder work, the Architect path is:

```bash
narada inbox architect-process <envelope-id> --by architect
```

This command is deliberately a handoff boundary. It may create a task, claim it for Builder, route the source envelope to `task:<number>`, and export portable inbox/lifecycle artifacts. It must not execute the Builder work, submit a Builder report, close the task, or self-review.

If handling must be abandoned without taking an action:

```bash
narada inbox release <envelope-id> --by operator
```

## First-Use Ergonomics

Canonical Inbox first use should not require ad hoc repair work.

| Friction | Canonical Surface |
| --- | --- |
| Shell-hostile JSON quoting, especially in PowerShell | Use `inbox submit-observation` for observations, or `inbox submit --payload-file <path>` / `--payload-stdin` for low-level typed envelopes; avoid inline JSON for real payloads. |
| Submission succeeds but semantic payload was lost | Use `submit-observation` for read-back payload confirmation; low-level `submit` rejects empty observation/task-candidate payloads by default. |
| Submission exists in one embodiment but not another | Commit and push the generated `.ai/inbox-envelopes/*.json` artifact, then run `narada inbox import` or any inbox read command in the receiving embodiment. Do not copy or merge `.ai/inbox.db`. |
| Human wants to leave a message without JSON or shell quoting | Put a dated numbered file or folder in `.ai/inbox-drop`, run `inbox ingest-files` for dry-run, then rerun with `--admit --by <principal>`. |
| Windows/WSL shell uses the wrong `narada`, `node`, or package shim | Run `narada inbox doctor` and inspect `Node`, `CLI entrypoint`, `Platform`, and `Runtime posture` before submitting or publishing envelopes. |
| Fresh checkout missing dependencies, build output, CLI shim, or native SQLite binding | Run `narada doctor --bootstrap --format json` and follow its `repair_plan`. |
| Git/worktree uncertainty before publishing an inbox-backed chapter | Run `narada chapter preflight <range> --expect-commit --expect-push`. |
| Unsure whether inbox artifacts are visible to another embodiment | Run `narada inbox doctor`; inspect `publication.uncommitted_envelope_artifacts_count`, `publication.unpushed_commit_count`, and `publication.next_steps`. |
| Inbox entry is informative but not executable | Use `inbox triage <id> --action archive --by <principal>` after durable guidance or residuals are recorded. |
| Inbox entry targets a zone without executable promotion | Use `inbox pending <id> --to <kind>:<ref> --by <principal>`; do not report it as enacted. |
