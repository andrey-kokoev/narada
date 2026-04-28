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
| `mutation_evidence_locus` | Where mergeable/replayable mutation evidence is recorded. | Raw SQLite is runtime substrate, not portable authority by itself. |
| `inbox_sources` | Inbound intake surfaces and their admission posture. | Arrival is inert until admitted or promoted. |
| `outbox_targets` | Outbound handoff surfaces and their authority posture. | Sending a handoff is not confirmation of external effect. |
| `effect_authority_policy` | Whether metadata can ever imply executable effect authority. | Default posture should be `metadata_only` or capability-gated. |
| `capability_grants` | References to capability sources and scopes. | Capability references do not expose raw secrets. |
| `lineage_source` | Evidence source for Site origin and relationship changes. | Lineage is evidence, not decorative graph. |
| `readiness_phase` | Bootstrap, inhabited onboarding, steady state, or archived. | Readiness must be declared; do not infer from folder existence. |
| `operator_identity` | Principal label for human authority. | Chat labels should resolve to a declared principal. |
| `agent_identity_contract` | Stable orientation for fresh architects. | Agent memory or chat habit is not the contract. |
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
      "contract_path": "/repo/.narada/AGENTS.md"
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

