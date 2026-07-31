# Host Fleet

`@narada2/host-fleet` owns the substrate-neutral contracts for operating more
than one Narada host:

- durable `HostKey` and `RuntimeTarget` identity;
- the User Site Host Registry persistence boundary;
- host-qualified health and event projections;
- exact-target resolution with typed ambiguity refusals; and
- bounded requests through a declared Host Gateway endpoint.

It does not own Site state, NARS session state, operator-router state, or raw
credentials. Those remain owned by the target host and its Site/runtime
authority.
