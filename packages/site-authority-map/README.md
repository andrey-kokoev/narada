# Site Authority Map

Shared v1 vocabulary and pure classifier for Narada Site authority routing.

The map names Site embodiments, mutation classes, authority loci, routing posture, evidence requirements, and confirmation requirements. It does not execute mutations and does not grant authority by itself.

## Invariant

Multiple embodiments may inspect, present, propose, cache, or rebuild projections for the same Site. Every durable mutation class must resolve to one declared authority locus before execution.

v1 does not define a forwarding transport between local and Cloudflare embodiments. When an embodiment is not authoritative for a durable mutation class, the classifier refuses execution instead of implying handoff.

## Verification

```powershell
pnpm --filter @narada2/site-authority-map test
```
