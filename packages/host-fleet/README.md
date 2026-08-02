# Host Fleet

`@narada-core/host-fleet` is the host-only Fleet contract and authenticated read model.

It accepts host observations only through a host-scoped `host_fleet_membership_secret`, strips the proof at admission, and projects only:

- host identity;
- reachability;
- health;
- Operator Console location.

The resulting registry is immutable and exposes only `list()`. Enrollment workflows, lifecycle control, remote execution, and discovery inside a host are outside this package.

## Population Boundary

This package does not discover hosts. A host-level observation collector must authenticate observations before constructing the read model. The Operator Console accepts that read model through an explicit injection boundary and otherwise projects a valid empty snapshot; it never derives Fleet membership from a User Site or Site registry.
