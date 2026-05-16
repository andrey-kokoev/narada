# Site Telemetry Doctrine Grounding MCP v0

`narada_doctrine_grounding_refs` is a read-only Narada proper MCP tool for
grounding bounded telemetry design questions in public Narada doctrine.

The tool is liftable machinery for inquiry pressure. It does not copy private
Inquiry Space data, admit inquiry branches, mutate task state, or decide
doctrine. When a question requires private Inquiry Space records, the tool
returns `blocked` with a routing instruction.

## Tool

MCP tool name: `narada_doctrine_grounding_refs`

Input:

- `question`: bounded design question;
- `topic`: optional topic hint, such as `site_telemetry_ownership`;
- `require_inquiry_space_data`: boolean; when true, the tool refuses private
  data import and reports the required governed route.

Output schema: `narada.doctrine_grounding_refs.v0`

Output fields:

- `status`: `success` or `blocked`;
- `question`;
- `topic`;
- `doctrine_refs`: public doctrine and product docs with reasons;
- `proof_case`: populated for the telemetry ownership question;
- `mutation_attempted: false`;
- `private_inquiry_space_data_imported: false`;
- `source_runtime_authority_imported: false`;
- `raw_private_data_recorded: false`;
- `authority_limits`;
- `required_next_step` when blocked.

## Telemetry Ownership Proof Case

For questions about hosted Site Telemetry ownership, monitoring, alerting, or
secret rotation, the tool returns public refs including:

- `docs/product/site-telemetry-operations-posture.v0.md`;
- `docs/product/site-telemetry-readiness.v0.md`;
- `docs/product/site-telemetry-publication-outcome-shapes.md`;
- `docs/concepts/capability-governed-secret-management.md`;
- `docs/concepts/governed-crossing.md`;
- `docs/concepts/canonical-inbox.md`.

The grounded answer posture is:

```text
The owning Site governs surface policy and monitoring assignment; Cloudflare
owns deployment coordinates; publisher and receiving Sites keep their own
truth/admission authority.
```

## Blocked Private Inquiry Space Path

If `require_inquiry_space_data` is true, the tool returns `blocked` and does not
attempt to read or summarize private Inquiry Space records. The next step is to
route an `inquiry_branch_candidate` or `doctrine_lift_candidate` through
Canonical Inbox / Inquiry Space authority once that intake machinery is
admitted.

## Authority Limits

- Doctrine grounding refs are read-only.
- Public doctrine refs do not admit an inquiry branch.
- Private Inquiry Space data must not be copied into MCP output.
- Telemetry surface ownership is not Site authority transfer.
