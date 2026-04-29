# Site Governance Coordinates

Site governance coordinates are the explicit declaration of where a Site gets law, where it may mutate, how its embodiments relate, and which evidence surfaces make its mutations portable.

They do not grant runtime authority by themselves. They make authority inspectable before a command, agent, UI, MCP facade, or clone acts.

## Coordinate Set

| Coordinate | Meaning | Anti-Collapse Rule |
| --- | --- | --- |
| `governing_law_source` | Site or external source whose law artifacts govern this Site. | Law inheritance is not mutation authority. |
| `law_admission_mode` | How law is admitted: inherited, overlaid, federated, or referenced. | Local overlays must be explicit. |
| `authority_locus` | The Site locus that owns governed mutation. | Current shell, clone, or process is not authority by convenience. |
| `embodiments` | Known concrete presences: roots, runtimes, projections, forwarding surfaces. | Multiple embodiments do not create multiple authorities. |
| `site_participant_roles` | Declared human/agent participant roles such as resident, architect, builder, receptionist, or inspector. | Role declaration is not capability grant, runtime existence, or mutation authority. |
| `operator_surfaces` | Optional addressable interfaces for inhabiting or observing Site work. | Surfaces improve launch/focus/recovery; they do not grant mutation, effect, or capability authority. |
| `session_bindings` | Optional continuity links between role, runtime, channel, surface, task/chapter, and trace references. | Session continuity does not claim work, admit evidence, or prove completion. |
| `mutation_evidence_locus` | Where mergeable/replayable mutation evidence is recorded. | Raw SQLite is runtime substrate, not portable authority by itself. |
| `inbox_sources` | Inbound intake surfaces and their admission posture. | Arrival is inert until admitted or promoted. |
| `outbox_targets` | Outbound handoff surfaces and their authority posture. | Sending a handoff is not confirmation of external effect. |
| `effect_authority_policy` | Whether metadata can ever imply executable effect authority. | Default posture should be `metadata_only` or capability-gated. |
| `capability_grants` | References to capability sources and scopes. | Capability references do not expose raw secrets. |
| `lineage_source` | Evidence source for Site origin and relationship changes. | Lineage is evidence, not decorative graph. |
| `readiness_phase` | Bootstrap, inhabited onboarding, steady state, or archived. | Readiness must be declared; do not infer from folder existence. |
| `operator_identity` | Principal label for human authority. | Chat labels should resolve to a declared principal. |
| `agent_identity_contract` | Stable orientation for fresh architects. | Agent memory or chat habit is not the contract. |
| `agent_role_contracts` | Role-specific bootstrap contracts for currently inhabited AI roles. | Role orientation metadata does not grant mutation, effect, or admission authority. |
| `local_overlays` | Site-local law, guidance, or policy overlays. | Local additions must not silently fork global doctrine. |
| `federation_policy` | Receive/publish posture with peer Sites. | Federation is influence and handoff, not authority replication. |

## Minimal Shape

```json
{
  "governance": {
    "governing_law_source": {
      "source_site_id": "narada-proper",
      "law_artifacts": ["AGENTS.md", "SEMANTICS.md"],
      "mode": "inherited",
      "admission": "declared"
    },
    "law_admission_mode": "local_overlay",
    "authority_locus": {
      "locus_kind": "project",
      "authority_site_id": "smart-scheduling",
      "mutation_policy": "direct_only_at_locus"
    },
    "embodiments": [
      {
        "embodiment_id": "contained-site-root",
        "role": "authority",
        "root": "/repo/.narada",
        "substrate": "filesystem",
        "mutation_policy": "may_mutate_at_authority_locus"
      },
      {
        "embodiment_id": "visible-workspace",
        "role": "read_only",
        "root": "/repo",
        "substrate": "filesystem",
        "mutation_policy": "read_only"
      }
    ],
    "site_participant_roles": [
      {
        "role_id": "resident",
        "role_class": "resident",
        "status": "active",
        "purpose": "Use the Site to produce its intended value and surface lived operational friction.",
        "runtime_kind": "human",
        "authority_posture": "value_use"
      },
      {
        "role_id": "architect",
        "role_class": "architect",
        "status": "active",
        "purpose": "Specify governed work, preserve topology and doctrine, and frame review posture.",
        "runtime_kind": "codex_cli",
        "authority_posture": "specification"
      },
      {
        "role_id": "builder",
        "role_class": "builder",
        "status": "active",
        "purpose": "Execute approved local construction work packages and report verification evidence.",
        "runtime_kind": "codex_cli",
        "authority_posture": "construction"
      },
      {
        "role_id": "inspector",
        "role_class": "inspector",
        "status": "planned",
        "purpose": "Independently inspect evidence before admission when the Site has earned that separation.",
        "runtime_kind": "api_agent",
        "authority_posture": "inspection"
      }
    ],
    "operator_surfaces": [
      {
        "surface_id": "smart-scheduling-architect",
        "purpose": "Project Site architect work surface",
        "site_id": "smart-scheduling",
        "role_id": "architect",
        "workflow_binding": "project_governance",
        "locus_binding": "project",
        "embodiment_id": "visible-workspace",
        "adapter": {
          "kind": "vscode_workspace",
          "materialization": "manual_or_external"
        },
        "launch": {
          "command": "code /repo",
          "identity": "smart-scheduling.code-workspace"
        },
        "focus_identity": {
          "kind": "workspace",
          "value": "smart-scheduling"
        },
        "placement_hints": {
          "desktop": "Narada",
          "workspace": "Project"
        },
        "recovery_posture": "focus_if_present",
        "authority_limits": [
          "surface_is_not_authority_locus",
          "surface_does_not_grant_effect_capability",
          "surface_does_not_grant_operator_authority"
        ]
      }
    ],
    "session_bindings": [
      {
        "binding_id": "smart-scheduling-architect-current",
        "site_id": "smart-scheduling",
        "role_id": "architect",
        "surface_id": "smart-scheduling-architect",
        "agent_runtime": {
          "runtime_id": "architect-cli",
          "runtime_kind": "codex_cli",
          "principal_ref": "architect"
        },
        "control_channel": {
          "channel_id": "architect-terminal",
          "channel_kind": "terminal",
          "admission_posture": "messages_are_advisory_until_sanctioned_command"
        },
        "continuity_refs": {
          "task_refs": [],
          "chapter_refs": [],
          "trace_refs": ["AGENTS.md", ".ai/task-lifecycle-snapshot.json"]
        },
        "continuity_posture": "recoverable",
        "authority_limits": [
          "binding_does_not_claim_work",
          "binding_does_not_admit_evidence",
          "binding_does_not_close_tasks"
        ]
      }
    ],
    "mutation_evidence_locus": {
      "kind": "git",
      "path": "/repo/.narada",
      "required": true
    },
    "inbox_sources": [
      {
        "source_id": "canonical-file-drop",
        "kind": "file_drop",
        "path": "/repo/.narada/.ai/inbox-drop",
        "admission": "inert_until_promoted"
      }
    ],
    "outbox_targets": [
      {
        "target_id": "canonical-envelope-export",
        "kind": "git_export",
        "authority": "handoff_only"
      }
    ],
    "effect_authority_policy": "metadata_only",
    "capability_grants": [],
    "lineage_source": {
      "kind": "operator_declaration",
      "path": "/repo/.narada/config.json"
    },
    "readiness_phase": "bootstrap",
    "operator_identity": {
      "principal_id": "operator",
      "role": "Operator"
    },
    "agent_identity_contract": {
      "default_agent_name": "architect",
      "operator_label": "Operator",
      "contract_path": "/repo/.narada/AGENTS.md",
      "compatibility": "legacy shorthand for agent_role_contracts.architect"
    },
    "agent_role_contracts": {
      "admitted_roles": ["architect", "builder"],
      "deferred_roles": ["inspector", "clerk", "superintendent", "project_manager"],
      "architect": {
        "role_id": "architect",
        "bootstrap_contract": {
          "path": "/repo/.narada/AGENTS.md",
          "section": "Architect Thread Bootstrap"
        },
        "default_first_actions": [
          "read_site_contract",
          "identify_target_locus",
          "inspect_task_inbox_evidence_posture",
          "formulate_or_refine_spec_and_acceptance_criteria"
        ],
        "authority_limits": [
          "does_not_inherit_operator_authority",
          "does_not_execute_by_convenience",
          "uses_sanctioned_mutation_surfaces_only"
        ],
        "handoff_obligations": [
          "produce_governed_work_package",
          "name_acceptance_criteria",
          "review_or_admit_only_through_configured_evidence_path"
        ]
      },
      "builder": {
        "role_id": "builder",
        "bootstrap_contract": {
          "path": "/repo/.narada/AGENTS.md",
          "section": "Builder Thread Bootstrap"
        },
        "default_first_actions": [
          "read_site_contract",
          "confirm_assigned_task_and_acceptance_criteria",
          "inspect_minimum_required_implementation_context",
          "execute_approved_work_package",
          "run_verification"
        ],
        "authority_limits": [
          "does_not_redesign_by_convenience",
          "does_not_admit_own_work_without_evidence",
          "does_not_expand_active_role_set"
        ],
        "handoff_obligations": [
          "report_changed_files",
          "report_verification",
          "report_residuals_and_blockers",
          "return_field_conditions_to_architect_or_operator"
        ]
      }
    },
    "local_overlays": [
      {
        "overlay_id": "site-local-agents-contract",
        "path": "/repo/.narada/AGENTS.md",
        "admission": "site_local"
      }
    ],
    "federation_policy": {
      "posture": "receive_only",
      "admission": "local_admission_required"
    }
  }
}
```

## Narada Proper Inheritance With Local Overlays

A project Site can inherit Narada proper law while remaining locally sovereign over its task, inbox, and evidence state:

```text
governing_law_source.source_site_id = narada-proper
governing_law_source.mode = inherited
law_admission_mode = local_overlay
authority_locus.locus_kind = project
authority_locus.mutation_policy = direct_only_at_locus
effect_authority_policy = metadata_only
```

This means the Site follows Narada law and may carry Site-local overlays such as `.narada/AGENTS.md`, but mutations still belong to the declared project Site locus. Narada proper is law source, not automatic runtime authority for the project Site.

## Runtime Consequence

Commands may use these coordinates for preflight, routing, and explanation. A coordinate declaration alone must not execute effects, reveal secrets, repair state, or mutate another Site.

## Site Participant Roles

`site_participant_roles` declares who inhabits or works on the Site. It is broader than `agent_role_contracts`: it may include humans, AI threads, API agents, reception/intake roles, inspection roles, daemons, or future project-specific names.

The canonical value-producing role is `resident`.

Resident is the participant who lives in or uses the Site for its intended purpose: handling the client, running the business workflow, operating the project, or otherwise producing the value for which the Site exists. Resident can surface observations, command requests, and friction. Resident is not the same as Operator authority unless the Site separately declares the same principal in both roles.

Default role posture:

| Role | Meaning | Authority posture |
| --- | --- | --- |
| `resident` | Value-producing inhabitant/user of the Site. | May surface lived work and friction; does not gain mutation or effect authority by role declaration. |
| `architect` | Specifies topology, doctrine fit, work packages, and acceptance criteria. | Specification/review posture only unless separately granted. |
| `builder` | Executes approved construction work. | Construction posture only; must report evidence. |
| `receptionist` | Intake/routing role for envelopes and first contact. | Intake-only until promotion/admission. |
| `inspector` | Independent evidence/admission review role. | Inspection posture; should stay independent from Builder. |

`site_participant_roles` may declare planned roles so startup posture is explicit, for example an API-based Inspector or CLI-based Receptionist. Planned/deferred roles are inert until an inhabited operation actually uses them and the Site config gives them a bounded contract.

## Agent Role Contracts

`agent_role_contracts` is orientation metadata for fresh AI threads. It is not an authorization table and must not be treated as proof that a role may mutate, execute effects, admit evidence, or close work.

The currently admitted role keys are:

| Role key | Bootstrap section | Responsibility |
| --- | --- | --- |
| `architect` | `Architect Thread Bootstrap` | Interpret Operator pressure into governed work, preserve topology/doctrine, specify and review. |
| `builder` | `Builder Thread Bootstrap` | Execute approved work packages, verify, and report changed files, field conditions, residuals, and blockers. |

`agent_identity_contract` remains as a backward-compatible shorthand for legacy consumers that expect one default agent identity. New consumers should read `agent_role_contracts.architect` for the default architect bootstrap and `agent_role_contracts.builder` when the Operator explicitly starts a builder thread.

Deferred roles are intentionally listed only as non-admitted names. A Site may record them as proposals or residuals, but they are not valid bootstrap roles until inhabited operation evidence admits them.

## Operator Surfaces And Session Bindings

`operator_surfaces` and `session_bindings` are optional orientation and recovery metadata. Sites that do not declare them remain coherent; callers should treat missing arrays as `[]`.

`operator_surfaces` names addressable interfaces such as Windows Terminal profiles, Komorebi window identities, YASB buttons, VS Code workspaces, browser profiles, MCP consoles, daemon panels, or HTTP consoles. These are adapter examples. The primitive is the [`Operator Surface`](../concepts/operator-surface.md): a stable way to inhabit or observe a Site/role/workflow.

`session_bindings` names continuity relationships across role, task/chapter context, AgentRuntime, ControlChannel, Operator Surface, and trace references. API conversations, transcripts, inbox envelopes, file drops, and MCP tool calls may appear here as control-channel or trace references without requiring a spatial UI surface.

Declarations are advisory unless a separate governed command admits or materializes them. For example:

- a Windows Terminal profile is materialized only by a future adapter/materializer command;
- a Komorebi rule is an external window-management adapter, not Site truth;
- a YASB launch button is an operator convenience, not effect authority;
- an MCP console is a facade/control channel, not a second Site authority;
- a transcript or inbox envelope is trace/control-channel material, not a runtime by itself.

Surface and session declarations must not contain raw secrets. If a surface needs an executable capability, the capability belongs in `capability_grants` or a capability registry, not in the surface declaration.

The authority rule is unchanged:

```text
Surface may focus.
Runtime may reason.
Channel may carry.
Binding may resume.
Only the declared Site authority locus admits governed mutation.
```

Inspection commands for these declarations should be read-only and bounded. They may list or show declared surfaces and bindings, but must not launch adapters, focus windows, mutate profile files, hydrate runtimes, or persist live session state.

Materialization commands are future governed crossings. They should default to dry-run, require explicit `--execute`, route adapter side effects through CEIZ or an equivalent governed execution boundary, and write mutation evidence with read-back confirmation. Until such commands exist, `operator_surfaces` and `session_bindings` are declarations only.

For the first concrete spatial adapter posture on Windows, see [`windows-operator-surface-adapter-path.md`](windows-operator-surface-adapter-path.md). That plan treats Windows Terminal, Komorebi, YASB, and AHK as adapters owned by the Windows User or PC authority locus, not by Narada proper by convenience.
