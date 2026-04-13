# Graph Draft Metadata Spike

## Mission
Resolve the biggest open technical risk in the outbound design: whether the chosen Microsoft Graph draft path preserves the `outbound_id` marker reliably enough to support deterministic reconciliation.

## Scope
Research and executable spike code only. No broad production implementation yet.

Likely locations:

- `packages/exchange-fs-sync/src/outbound/`
- `packages/exchange-fs-sync/test/integration/`
- supporting notes in `.ai/tasks/20260413-001-outbound-draft-worker-spec.md`

## Why This Is Next
The outbound spec treats a custom Internet header carrying `outbound_id` as the primary marker. If Graph does not preserve that across draft creation, send, and sent-item retrieval, the implementation strategy needs to change before more worker code is written.

## Questions To Answer

1. Can a custom Internet header be set on a draft through the intended Graph API path?
2. Is that header visible when reading the draft back?
3. Does the header survive `send`?
4. Is the header visible on the resulting sent item?
5. If not, what exact fallback tuple is reliable enough in practice?

## Deliverables

### 1. Spike Script Or Test

Add a small executable spike that:

- creates a draft
- stamps the candidate metadata marker
- reads the draft back
- sends it
- fetches the resulting sent artifact if available
- logs what metadata survived

### 2. Findings Note

Record findings directly in the task doc or an adjacent note:

- exact endpoints used
- exact fields preserved or dropped
- whether the spec’s primary marker stands
- whether fallback matching must become primary

### 3. Spec Update

Update the outbound spec with the result:

- keep custom header as primary marker, or
- replace it with another metadata path, or
- formally promote fallback reconciliation

## Findings

**Date:** 2026-04-13  
**Endpoint:** `POST /users/{id}/messages` (create draft)  
**Tested by:** `packages/exchange-fs-sync/test/integration/outbound/graph-draft-metadata-spike.ts`

### Results

| Question | Answer |
|----------|--------|
| Can a custom Internet header be set on a draft? | **Yes.** `internetMessageHeaders: [{ name: "X-Outbound-Id", value: "..." }]` is accepted. |
| Is the header visible on read-back? | **Yes.** `GET /users/{id}/messages/{draftId}?$select=internetMessageHeaders` returns the header intact. |
| Does the header survive `send`? | **Yes.** `POST /users/{id}/messages/{draftId}/send` succeeds. |
| Is the header visible on the sent item? | **Yes.** The resulting message in `SentItems` retains `X-Outbound-Id` exactly as set. |

### Conclusion

The custom Internet header (`X-Outbound-Id`) is a **viable primary reconciliation marker** for the v1 outbound implementation. No change to the spec’s primary matching strategy is required. Fallback matching (tuple of `reply_to_message_id`, recipients, subject, body hash, time window) remains the documented backup.

### Note on Permissions

Executing this spike required adding `Mail.ReadWrite` and `Mail.Send` application permissions to the `exchange-fs-sync` Azure AD app and granting tenant-wide admin consent.

## Definition Of Done

- [x] Graph draft metadata behavior is tested with the intended API path
- [x] results are written down in-repo
- [x] outbound spec is updated to match reality
- [x] a clear go/no-go decision exists for primary reconciliation marker

