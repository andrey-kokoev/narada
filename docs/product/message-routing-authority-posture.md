# Message Routing Authority Posture

`message_routing_authority` is the Site governance coordinate that decides
whether an incoming inbox, handoff, or MCP submission may be written into the
target local intake substrate.

It governs routing admission for inert messages. It is not effect authority,
task authority, knowledge authority, Site Registry authority, or capability
authority by itself.

## Rule

```text
Local legacy submission may remain compatible.
Cross-locus routing must be declared.
Cross-Site delegated routing must be declared and capability-gated.
```

Canonical Inbox and Inbox MCP both use this rule. MCP does not get a separate
routing law.

## Compatibility And Enforcement

When `message_routing_authority` is absent, local submissions are admitted for
compatibility. Current CLI/MCP output reports:

```text
configured=false
default_policy=allow_when_unconfigured
authority_posture=direct_target_authority for local_site
reason=No message_routing_authority policy configured; legacy local submission posture admits the route.
```

This compatibility is acceptable only for direct local submissions into the
current authority Site, such as:

- `narada inbox submit-observation` from the authority clone;
- local agent report or system observation into the same Site;
- local file-drop admission through the owning Site's CLI surface.

It must not be used to claim that cross-locus or cross-Site delivery is
governed. A route with `target_locus != local_site`, a remote target Site, or a
delegated source-site submission needs an explicit configured policy.

## Required Policy Shape

`message_routing_authority` may live at the root of `config.json` or under
`governance.message_routing_authority`.

Minimum shape:

```json
{
  "message_routing_authority": {
    "default_policy": "deny_cross_locus_unless_allowed",
    "principals": {
      "builder": {
        "may_send": [
          {
            "target_locus": "local_user_site",
            "kinds": ["observation", "task_handoff", "review_request"],
            "authority_levels": ["agent_reported"],
            "condition": "always"
          }
        ],
        "may_not_send": [
          {
            "target_locus": "narada_proper",
            "kinds": ["*"],
            "reason": "Builder reports locally; Architect escalates upstream."
          }
        ]
      },
      "architect": {
        "may_send": [
          {
            "target_locus": "narada_proper",
            "kinds": ["observation", "proposal", "task_candidate"],
            "authority_levels": ["agent_reported", "operator_confirmed"],
            "condition": "after_local_admission_or_explicit_operator_instruction",
            "capability_kind": "canonical_inbox_cross_site_submission",
            "capability_action": "inbox.submit"
          }
        ]
      }
    }
  }
}
```

Required fields for route entries:

| Field | Required | Meaning |
| --- | --- | --- |
| `principal` map key | yes | Principal or role-shortname whose route policy is being evaluated. Implementations may match exact principal, short suffix, or `*`. |
| `target_locus` or `target_loci` | yes | Target authority locus. Use `local_site` for the current Site; use explicit Site/locus ids for cross-locus routes. |
| `kinds` | yes | Envelope/message kinds admitted by the route. `*` is allowed only with a bounded reason. |
| `authority_levels` | yes for `may_send` | Authority levels admitted by the route, such as `agent_reported`, `system_observed`, or `operator_confirmed`. |
| `condition` | yes for `may_send` | Admission condition. `always` is direct admission; conditions containing approval/escalation should surface as requiring escalation approval. |
| `capability_kind` | required for delegated cross-Site mutation | Capability family required before writing through this route. |
| `capability_action` | required when `capability_kind` is present | Action checked against the capability grant. Defaults may exist, but doctrine should name it explicitly. |
| `reason` | required for `may_not_send`; recommended for broad rules | Human-readable refusal reason. |

`may_not_send` rules take precedence over `may_send` rules. A matching
`may_not_send` must refuse without considering a later allow rule.

## Default Policies

| Policy | Meaning | Use |
| --- | --- | --- |
| `allow_when_unconfigured` | Compatibility default when no policy exists. | Direct local legacy submission only. |
| `deny_cross_locus_unless_allowed` | Local direct routes may remain compatible; cross-locus routes require an allow rule. | Recommended transitional Site posture. |
| `deny_unless_allowed` | All routes require an allow rule, including local routes. | Mature/high-control Sites. |

Cross-Site delegated submission should use `deny_cross_locus_unless_allowed` or
stricter and must include capability checks.

## Refusal Posture

A refused route must return bounded output and write no envelope.

Refusal output should include:

| Field | Meaning |
| --- | --- |
| `status` | `refused` or command-level `error`. |
| `principal` | Principal evaluated. |
| `target_locus` | Target locus requested. |
| `envelope_kind` | Envelope/message kind requested. |
| `authority_level` | Authority level requested. |
| `authority_posture` | `direct_target_authority` or `source_site_delegated_authority`. |
| `required_capability_kind` | Capability kind when a route requires one. |
| `capability_action` | Capability action checked. |
| `capability_status` | `not_required`, `active`, `missing`, `expired`, or `revoked`. |
| `capability_grant_id` | Active grant id when admitted through capability. |
| `reason` | Specific bounded reason; do not dump raw payload or secrets. |

Missing, expired, or revoked capability grants must refuse before inbox
mutation.

## Doctor And Preflight Output

Doctor/preflight surfaces should distinguish these cases:

| Case | Required output posture |
| --- | --- |
| No config, local direct submission | `configured=false`, `default_policy=allow_when_unconfigured`, compatible local direct authority. |
| No config, cross-locus attempt | Refuse or warn that no governed cross-locus route is declared; do not present legacy allowance as reusable delegated routing. |
| Configured, local route allowed | Show matched principal/rule, target locus, and `direct_target_authority`. |
| Configured, cross-locus route allowed without capability | Show `source_site_delegated_authority` only when the route is intra-Site/role-locus and no capability is required by policy. |
| Configured, cross-Site route allowed with capability | Show required capability, active grant id, and action. |
| Configured, capability missing/expired/revoked | Refuse before mutation and return exact capability status. |
| Configured, no rule matched | Refuse under `deny_cross_locus_unless_allowed` for non-local targets; refuse under `deny_unless_allowed` for all targets. |

`narada inbox doctor` should keep current local operational posture separate
from route authority. Pending inbox artifact publication is visibility posture,
not permission to bypass routing.

## Examples

### Local CLI Submission

```bash
narada inbox submit-observation \
  --source-ref codex-session:local-note \
  --title "Local observation" \
  --principal narada.builder \
  --target-locus local_site
```

Acceptable compatibility when no policy is configured:

```text
authority_posture=direct_target_authority
capability_status=not_required
```

The envelope is still inert until inbox promotion.

### Builder-To-Architect Handoff

For a local role handoff, the route may target a role/locus such as
`narada-proper.architect` or a Site-local queue. Recommended posture:

```json
{
  "target_locus": "narada-proper.architect",
  "kinds": ["task_handoff", "review_request", "observation"],
  "authority_levels": ["agent_reported"],
  "condition": "always"
}
```

This admits the handoff envelope only. It does not perform task review,
evidence admission, or closure.

### Hosted Message Pull

A hosted registry message preserved as Remote Candidate Exchange state is not a
local inbox route yet. The receiving Site puller should use a declared route
from hosted candidate state to local decision:

```json
{
  "target_locus": "local_site",
  "kinds": ["observation", "proposal", "task_candidate"],
  "authority_levels": ["system_observed", "operator_confirmed"],
  "condition": "remote_candidate_validated_and_target_site_puller"
}
```

If validation fails, record a ledger decision rather than forcing an envelope.

### Cross-Site Delegated Submission

For Narada proper submitting into `narada-andrey` Canonical Inbox through a
delegated route:

```json
{
  "target_locus": "site:narada-andrey:canonical_inbox",
  "kinds": ["observation", "proposal", "task_candidate"],
  "authority_levels": ["agent_reported", "operator_confirmed"],
  "condition": "target_route_admitted",
  "capability_kind": "canonical_inbox_cross_site_submission",
  "capability_action": "inbox.submit"
}
```

Required posture:

- routing registry resolves `site:narada-andrey`;
- `message_routing_authority` admits the principal/locus/kind/authority level;
- capability consent registry has an active grant for the principal, target
  Site/locus, capability kind, and action;
- target Site local admission remains separate.

Without the capability grant, the route must refuse before writing the target
inbox.

## Relationship To Existing Surfaces

| Surface | Relationship |
| --- | --- |
| [Canonical Inbox](../concepts/canonical-inbox.md) | Uses this posture before writing inert envelopes. |
| [Narada MCP Facade](../concepts/narada-mcp-facade.md) | Mutating inbox tools delegate to the same routing decision as CLI. |
| [Site Governance Coordinates](site-governance-coordinates.md) | Carries the `message_routing_authority` governance coordinate. |
| [Incoming Message Intake Edge](incoming-message-intake-edge.md) | Intake edges describe the source path; routing authority decides whether a submitted message may enter the target intake artifact. |
| [Canonical Capability Consent Registry](../concepts/canonical-capability-consent-registry.md) | Provides active grants when a route requires capability. |
