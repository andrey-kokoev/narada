# @narada2/site-registry-contract

Canonical, browser-safe types and boundary parsers for the User Site registry.

The durable registry implementation remains owned by `@narada2/windows-site`.
This package owns the shared type vocabulary and the conversion from the
snake_case HTTP/CLI envelopes to canonical `RegistrySiteRecord` values. It does
not open the registry database, mutate a Site, or define UI view models.

`@narada2/site-config` remains a separate contract for Site awareness and
event-derived projections. Its read models are not interchangeable with the
durable User Site registry records here.
