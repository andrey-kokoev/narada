# Site Continuity Across Embodiments

Site continuity is the relation that lets a local Windows Narada Site and a Cloudflare-backed Narada Site recognize the same `site_id` without collapsing their substrates or authority loci.

This follows the doctrine in `SEMANTICS.md`: Cloudflare, Windows, Durable Objects, SQLite, and filesystems are substrates. They are not Narada and they are not the authority boundary. Narada remains recognizable across them only when durable boundaries, evidence, and authority routes stay explicit.

## Target Shape

A same-Site continuity binding records:

| Field | Meaning |
| --- | --- |
| `site_id` | The shared Site identity recognized by both embodiments. |
| `relation_kind` | `same_site_embodiment`, not ownership, absorption, or authority transfer. |
| `relation_id` | Durable relation evidence id suitable for a Site relation ledger reference. |
| `embodiments` | The concrete local Windows and Cloudflare embodiments, each with its own `site_ref` and `authority_locus`. |
| `authority_map_ref` | Optional reference to the Site Authority Map version used to classify mutation authority. |

The shared classifier lives in `@narada2/site-continuity`.

## Allowed Exchanges

| Exchange class | Action | Meaning |
| --- | --- | --- |
| `site_identity_binding` | `admit` | The embodiments may recognize the same Site relation. |
| `authority_map_projection` | `projection_only` | One embodiment may publish the authority map as a read model. |
| `read_model_projection` | `projection_only` | One embodiment may publish current-state projections with source cursor/freshness evidence. |
| `mutation_evidence_reference` | `evidence_only` | One embodiment may reference canonical mutation evidence emitted by another authority locus. |
| `cross_embodiment_mutation_execution` | `refuse` | Continuity must not be used to execute a remote mutation through the wrong embodiment. |

## Exchange Packet

`narada.site_continuity_exchange_packet.v1` is the portable artifact for crossing between embodiments. It carries:

| Field | Meaning |
| --- | --- |
| `binding` | Same-Site continuity binding. |
| `decisions` | Classifier decisions that explain what the packet is allowed to represent. |
| `projections` | Read-model or authority-map projection refs with source cursors. |
| `evidence_refs` | Canonical mutation evidence refs with authority locus disclosure. |
| `executable_mutation_requests` | Must be empty for admission; non-empty packets are refused. |

The packet is an exchange envelope, not a sync engine. Importing a packet may update a projection or record evidence, but it must not execute a mutation unless a separate Site Authority Map decision admits that mutation at the receiving authority locus.

## Boundary Rule

Continuity does not move mutation authority. It lets embodiments exchange identity, projections, and canonical evidence references. Every durable mutation still goes through the Site Authority Map and must be admitted by the authority locus for that mutation class before execution.

For v1 there is no hidden sync transport. The full operator readiness path is `pnpm cloudflare:operator:check`; its continuity step delegates to `pnpm site:continuity:loop -- sync-cloudflare --site <site_id> --url <worker-url> --token-file <path>`. It creates the Windows-to-Cloudflare packet, reads the Cloudflare-to-Windows packet from `site.read`, pushes the Windows packet through `site.continuity.packet.put`, imports the Cloudflare packet into the Windows continuity ledger, and emits one evidence report. Reports disclose the credential source, not secret token material. Packet ledgers use stable `packet_id` values derived from Site relation and embodiment direction, so repeated imports update the same packet row instead of creating timestamp duplicates; `pnpm site:continuity:loop:test` verifies that offline with a fixture packet and no Cloudflare network dependency. Cloudflare `site.read` and `operation.read` expose `site_continuity_status` as a derived status summary over durable packet rows: packet count, latest packet id/import time/admission, direction counts, expected exchange packet id, and the unchanged authority boundary. The lower-level embodiment transports remain available as `pnpm --filter @narada2/cloudflare-carrier continuity:cloudflare` and `pnpm --filter @narada2/windows-site continuity:windows`. If Cloudflare sees a local filesystem mutation request, it refuses or records evidence/projection according to the exchange class; it does not mutate the local Windows Site. If Windows sees a hosted membership or hosted carrier-session mutation request, it likewise must route through the declared Cloudflare authority rather than editing a local projection.

## Relationship To Existing Doctrine

- `SEMANTICS.md` defines substrate neutrality and Plural Embodiment, Singular Authority.
- `docs/product/site-relation-ledger.md` defines relation evidence as evidence, not authority transfer.
- `docs/deployment/windows-site-materialization.md` keeps Windows as a sibling Site substrate to Cloudflare.
- `packages/site-authority-map` decides who may execute each durable mutation class.
- `packages/site-continuity` decides what may cross between embodiments without smearing authority.
- `packages/sites/windows/src/site-observation.ts` exposes `createWindowsSiteContinuityReadModel` so the local Windows embodiment can publish the same binding and decisions as a read-only observation surface.
- `packages/cloudflare-carrier/src/cloudflare-worker.mjs` exposes `site_continuity` from `site.read` so the Cloudflare embodiment presents the same relation from its side.
