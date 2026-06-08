# Cloudflare Site File Change Proposal Cutover Target

## Authority Slice

Cloudflare may record site file change proposal evidence for Sonar, but Windows remains the filesystem executor and repository publication authority.

## Admission Boundary

A site file change proposal is admitted only when the source payload declares:

- `schema = narada.sonar.site_file_change_proposal.v1`
- `authority_locus = cloudflare_carrier_site`
- `filesystem_executor_authority = windows_filesystem_executor`
- `filesystem_mutation_admission = not_admitted`
- `repository_publication_admission = not_admitted`
- at least one proposed file path

Cloudflare records this as `narada.sonar.cloudflare_site_file_change_proposal.v1` and projects it into `operation.read` as `site_file_change_proposal_cloudflare_recorded_filesystem_and_publication_windows_owned`.

## Non-Transfer

This does not admit direct filesystem mutation, repository publication, git push, package release, or mailbox mutation. Those require separate governed contracts and live evidence.

## Live Evidence

Required evidence is a live `site-file-change:proposal-smoke:live` run proving default refusal of filesystem mutation admission, successful proposal recording, list visibility, and `operation.read` projection with filesystem mutation and repository publication still `not_admitted`.
