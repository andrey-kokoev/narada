# Host Fleet Runtime

`@narada-core/host-fleet-runtime` owns the machine-level Host Fleet authority
and publisher services. It provides validated machine configuration, HMAC
heartbeat admission, replay protection, SQLite persistence, independent
reachability probes, loopback health/read endpoints, and Windows/Linux service
plans.

It never reads a Site registry and never projects Sites, users, agents,
sessions, launchers, or runtimes inside a host.

See:

- [`Host Fleet Host-Only Contract`](../../docs/architecture/host-fleet-host-only-contract.md)
- [`Host Fleet Operations`](../../docs/operator/host-fleet.md)
