# Capability Announcement

A **Capability Announcement** is Site-local discovery metadata for an admitted or observed capability. It tells other roles or Sites that a capability exists, where it is owned, how it is entered, what evidence supports it, and what constraints bound it.

It is not a capability grant, secret, consent record, or execution authority. A role may discover an announcement and still be unable to execute the capability until the relevant crossing law, runtime binding, and capability consent checks admit use.

## Grammar

The v0 registry lives at:

```bash
.ai/capability-announcements.json
```

Each announcement records:

| Field | Meaning |
| --- | --- |
| `capability_id` | Stable capability announcement id. |
| `summary` | Human-readable capability summary. |
| `owner_site` | Site that owns the capability and its runtime truth. |
| `authority_scope` | Boundary where the capability is valid. |
| `usable_by` | Roles or identities that may discover or use it, subject to law. |
| `entrypoints` | Commands, scripts, UI paths, or MCP tools that present the capability. |
| `prerequisites` | Required runtime binding, consent, posture, or environment. |
| `evidence` | Evidence references proving the capability exists. |
| `constraints` | Safety, no-secret, no-autonomy, or locality limits. |
| `safety_posture` | Safety posture label. |
| `adoption_posture` | `manual_helper`, `operator_entrypoint`, `event_driven_automation`, or `fully_integrated`. |
| `supersedes` / `superseded_by` | Version/supersession relation. |

## Command Surface

```bash
narada capability announce --id <id> --summary "<text>" --owner-site <site> --authority-scope "<scope>" --by <principal>
narada capability announcements --format json
narada capability announcement show <id> --format json
narada capability announcement publish <id> --by <principal>
narada capability announcement supersede <id> --replacement <new-id> --by <principal>
```

`publish` submits an inert Canonical Inbox observation. Arrival at another Site is not admission, and discovery is not execution.

## Operator Surface Message Passing

The first inhabited test case is `operator_surface_message_passing`.

Its coherent announcement includes:

- entrypoints such as `Send-Os.ps1` or `Send-OperatorSurfaceInput.ps1`;
- prerequisite runtime identity binding;
- a named submit strategy such as `operator_confirmed_submit` or `known_surface_submit`;
- no raw secrets in announcement content;
- no blind submit probing;
- evidence references for observed successful sends.

An agent discovering this announcement may use it as orientation. It still must obey the Operator Surface, CEIZ, capability consent, and local Site authority rules before sending input.
