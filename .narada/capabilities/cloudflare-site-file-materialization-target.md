# Cloudflare Site File Materialization Target

This target admits one narrow site-file authority slice on Cloudflare: a durable Cloudflare site-file-store materialization record.

It does not admit Windows filesystem mutation and does not admit repository publication.

## Contract

`site_file_materialization.admit` may record a materialization only when the request carries:

- `cloudflare_site_file_materialization_cutover = true`;
- a proposal id or proposal ref;
- file path and content SHA-256;
- `materialization_authority_ref`;
- `cutover_point_ref`;
- `governed_write_contract_ref`;
- `confirmation_evidence_ref`;
- `filesystem_executor_authority = cloudflare_site_file_store`;
- `windows_filesystem_mutation_admission = not_admitted`;
- `repository_publication_admission = not_admitted`.

The admitted write effect is `cloudflare_site_file_materialization_record`.

## Boundary

This is a Cloudflare-substrate materialization record, not a local file write. The next authority slices remain separate: actual Windows filesystem mutation admission, repository publication admission, and any mailbox send/draft boundary.
