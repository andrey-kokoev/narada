# Execute Operation Intake Routing for Shared Mailboxes

Kind: task_candidate
Source: codex-user-site
Authority: operator_confirmed
Principal: andrey

## Trigger

The Staccato Narada mailbox admitted an email from Willem Driessen with subject `test`.

The intended meaning was to test email campaign creation by the Staccato email-marketing Operation. The current runtime handled it as generic support mail under `support_steward`, producing `clarification_needed` and no draft. The coherent behavior would have been to route it into the Staccato email-marketing Operation and create a draft reply asking for missing campaign inputs.

## Execution Request

Create and execute Narada proper work to support operation-intake routing from shared mailbox scopes into subordinate Operations.

## Desired Behavior

For a shared/client-service mailbox:

```text
incoming admitted message
  -> classify operation intent
  -> route campaign/email-marketing intent to campaign_producer
  -> produce either campaign_brief or missing-information draft reply
  -> never send or mutate external marketing systems without explicit activation/effect authority
```

For Willem's message, expected draft shape:

```text
I assume you mean you want to test the email campaign creation workflow.
To proceed, please provide campaign goal, audience/segment, desired send date or timing,
offer/message, required exclusions or compliance notes, and approval owner.
```

## Existing Substrate

Narada appears to already have much of the substrate:

- `campaign_brief` action type is present in control-plane docs/tests.
- Email-marketing live dry-run boundary docs describe producing `campaign_brief` or `send_reply` from an allowed-sender email.
- Staccato has `.narada/operations/email-marketing/` with `campaign_producer`.
- Generic outbound/draft machinery exists.

## Missing Bridge

The missing piece is the routing bridge:

```text
mailbox message
  -> operation-intent classifier/router
  -> operation-specific charter invocation
  -> action mapping from request_missing_information/campaign intent to mailbox draft_reply
```

## Suggested Acceptance

- A Site can declare that a mailbox scope is an intake source for one or more subordinate Operations.
- A message can be routed to `campaign_producer` instead of the default mailbox `support_steward` based on configured operation-intent signals.
- Missing campaign inputs can materialize as a governed mailbox `draft_reply`.
- `campaign_brief` remains document-only and non-executable in v0.
- The same mechanism is generic enough for other subordinate Operations, not hard-coded to Staccato.

## Safety Boundary

This should not activate autonomous campaign sends, Klaviyo mutation, customer-list import, or any other external marketing effect. It should only produce governed drafts/briefs unless a separate activation decision grants more authority.
