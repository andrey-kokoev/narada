# Host Fleet

`@narada-core/host-fleet` owns the strict, host-only Fleet contracts and the
bounded read-model interface. A projected host contains only identity,
reachability, health, and Operator Console location.

The package does not discover hosts, run services, persist state, probe
endpoints, or read Site registries. Machine configuration, HMAC admission,
SQLite state, and publisher/authority processes belong to
`@narada-core/host-fleet-runtime`.

See the
[`Host Fleet Host-Only Contract`](../../docs/architecture/host-fleet-host-only-contract.md)
for the complete boundary.
