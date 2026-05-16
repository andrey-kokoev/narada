# Local Site Telemetry Surface Fixture

This fixture is a non-Cloudflare realization of
`site_telemetry_surface_realization.v0`.

`events/*.json` are bounded telemetry events that can be replayed by tests
without network transport. `projections/*.json` are expected read-model outputs
derived from those events.

The fixture proves the Telemetry Surface contract does not depend on Cloudflare
Worker, D1, KV, route, domain, or process identity. File paths here are fixture
coordinates, not Site authority.
