# Cloudflare Mailbox Status Shadow Read Cutover Target

## Authority Slice

Cloudflare may record mailbox status shadow-read evidence for Sonar, but Windows remains the mailbox status source and mailbox mutation/send authority.

## Admission Boundary

A mailbox status shadow read is admitted only when the source payload declares:

- `schema = narada.sonar.mailbox_status_shadow_read.v1`
- `mailbox_read_authority = windows_mailbox_status_source`
- `mailbox_write_authority = windows_mailbox_mcp`
- `mailbox_send_admission = not_admitted`
- `mailbox_mutation_admission = not_admitted`
- `shadow_target_locus = cloudflare_carrier_site`

Cloudflare records this as `narada.sonar.cloudflare_mailbox_status_shadow_read.v1` and projects it into `operation.read` as `mailbox_status_shadow_read_cloudflare_recorded_send_and_mutation_windows_owned`.

## Non-Transfer

This does not admit Microsoft Graph authority, mailbox send authority, draft mutation, ticket mutation, filesystem mutation, or repository publication. Those require separate governed contracts and live evidence.

## Live Evidence

Required evidence is a live `mailbox:status-shadow-smoke:live` run proving default refusal of send admission, successful status shadow recording, list visibility, and `operation.read` projection with send and mutation still `not_admitted`.
