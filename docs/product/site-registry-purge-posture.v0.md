# Site Registry Purge Posture v0

Status: posture artifact for future work.

This artifact records that purge is not part of the Site Registry relation
lifecycle implementation chapter. The current registry can withdraw a Site from
active public counting, suppress it from public visibility, retire the relation,
or reject/supersede a candidate. Those transitions change registry projection
state. They do not delete provenance, telemetry projections, transition events,
message receipts, or evidence needed for re-derivation.

## Distinctions

| Action | Current meaning | Provenance retained | Public grid effect |
| --- | --- | --- | --- |
| `withdraw` | A Site or relation owner asks to stop active public publication. | yes | hidden |
| `suppress` | Registry owner hides an otherwise active relation from public projection. | yes | hidden |
| `retire` | Registry owner closes a relation as no longer current. | yes | hidden |
| `purge` | Future destructive retention operation over stored material. | no, by definition over selected material | hidden plus material removal |

`forget` is not a primitive operation. In the current chapter, an ordinary
"forget me from the registry" request maps to `withdraw` or `suppress` unless a
separately admitted purge operation is explicitly authorized.

## Current Implementation Posture

- `purge` and `delete` are not valid relation lifecycle transitions.
- `POST /api/relations/transition` refuses purge/delete requests.
- Public read APIs filter to `state=active` and `visibility=public`.
- Protected projection reads may still return retained projection evidence after
  withdrawal.
- D1 relation events, KV projections, message receipts, and audit evidence are
  not deleted by this chapter.

## Minimum Future Purge Requirements

A future purge operation must be admitted as a high-authority operation with at
least:

- actor authority: named principal, Site owner, registry owner, or legal/privacy
  delegate with explicit standing;
- scope: exact Site, relation, tables, KV keys, event families, and time range;
- retention policy: reason code, applicable retention rule, and exception
  handling;
- evidence of request: durable source request or operator decision reference;
- dry-run preview: count and identifiers of candidate material before deletion;
- confirmation law: explicit operator confirmation after preview;
- post-purge receipt: durable record of what was purged, what was retained, and
  what could not be purged;
- re-derivation impact statement: which future rebuild/reconciliation paths are
  intentionally reduced or broken;
- raw-secret exclusion: receipt must not record raw secrets or bearer values.

## Future Task Recommendations

- Specify `Site Registry Purge Operation` as a separate governed chapter.
- Add D1/KV purge preview tooling that reports candidate keys without deleting.
- Add a retention-policy registry for hosted telemetry surfaces.
- Add post-purge receipt tests that prove retained metadata is bounded and
  non-secret.
- Add operator docs distinguishing withdrawal requests from destructive privacy
  or retention requests.
