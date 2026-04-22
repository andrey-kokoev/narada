---
status: opened
depends_on: [403]
---

# Task 404 — Operator Inspection & No-Effect Proof

## Assignment

The operator inspects the live dry-run output, proves no Klaviyo mutation occurred, and documents observed behavior.

## Required Reading

- `.ai/tasks/20260422-403-controlled-live-input-and-dry-run-execution.md`
- `docs/product/operator-loop.md`
- `docs/deployment/operator-console-fit.md`
- `docs/deployment/klaviyo-intent-boundary.md`

## Context

After Task 403 executes a live Cycle, the operator must verify that:
1. The output is inspectable through generic console surfaces
2. No forbidden side effect occurred
3. The result matches expectations
4. Any anomalies are documented

## Required Work

1. Inspect the output via CLI.

   Run the operator live loop (§2 of `docs/product/operator-loop.md`):
   - `narada ops` — health, recent activity, attention queue, drafts pending review
   - `narada status --site <site-id>` — control-plane snapshot
   - `narada show-draft <outbound-id>` — full payload of the campaign brief or follow-up

2. Verify generic observation surfaces work.

   - `campaign_brief` appears as generic outbound command with `action_type: "campaign_brief"`
   - Console displays raw `action_type`; no campaign-specific labels
   - Payload summary shows `name`, `audience`, `timing` fields if present
   - `send_reply` appears the same way as helpdesk drafts

3. Prove no Klaviyo mutation occurred.

   Evidence required:
   - No `klaviyo_*` intent records exist in any store
   - No Klaviyo API requests in network logs (if logging is active)
   - `KlaviyoEffectAdapter` was never instantiated
   - `campaign_brief` status is `draft_ready` (not `submitted` to Klaviyo)
   - Document the proof methodology

4. Prove no campaign send/publish occurred.

   Evidence required:
   - `klaviyo_campaign_send` is not in `allowed_actions`
   - No `send` or `publish` actions in `foreman_decisions`
   - No outbound commands with status `sending` or `submitted` to an external campaign platform

5. Document observed behavior.

   Create a trace document in the private ops repo:
   - Input: sender, subject, thread ID, timestamp
   - Extracted fields: what the context formation found
   - Evaluation summary: what the charter proposed
   - Decision: approved action and rationale
   - Output: outbound command ID, action type, payload summary
   - Anomalies: anything unexpected (missing fields, wrong extraction, etc.)

6. Disposition any drafts.

   - If `campaign_brief`: mark as reviewed (`narada mark-reviewed`); do not approve for send
   - If `send_reply`: operator may approve for send (this is Graph draft, not Klaviyo)
   - If `no_action`: document why no action was taken

## Non-Goals

- Do not approve a `campaign_brief` for send (it is document-only in v0).
- Do not modify the public Narada repo during inspection.
- Do not create a new observation surface; use existing CLI commands.
- Do not generalize findings into a framework.

## Acceptance Criteria

- [ ] Operator inspected output via `narada ops`, `narada status`, and `narada show-draft`.
- [ ] `campaign_brief` or `send_reply` is visible through generic observation queries.
- [ ] No `klaviyo_*` actions exist in durable stores.
- [ ] No Klaviyo API calls are evidenced in logs.
- [ ] Proof methodology for no-effect is documented.
- [ ] Observed behavior trace is recorded in private ops repo.
- [ ] Any drafts are dispositioned (reviewed, not auto-approved).
