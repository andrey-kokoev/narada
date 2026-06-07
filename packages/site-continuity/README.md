# Site Continuity

Shared v1 vocabulary and pure classifier for continuity between embodiments of the same Narada Site.

This package does not implement a sync transport, a generic Site abstraction, or remote mutation execution. It names which exchanges are identity binding, projection-only, evidence-only, or refused. The productized operator loop lives above the classifier as `pnpm site:continuity:loop -- sync-cloudflare ...`; concrete embodiments still own their lower-level transports, such as Cloudflare `continuity:cloudflare` and Windows `continuity:windows`.

`narada.site_continuity_exchange_packet.v1` is the portable exchange artifact. It may carry the same-Site binding, classifier decisions, read-model projection refs, and canonical mutation evidence refs. Packet admission refuses executable mutation requests.

## Invariant

A local Windows Site and a Cloudflare-backed Site may recognize the same `site_id` and exchange authority maps, read-model projections, and canonical mutation evidence references. That continuity does not move mutation authority. Each durable mutation still resolves through the Site Authority Map before execution.

## Verification

```powershell
pnpm --filter @narada2/site-continuity test
```
