# @narada2/site-lift

Descriptor contracts for advisory Site lift catalogs and receiving-Site adoption packets.

This package models liftable artifact metadata, adoption plans, and adoption command packets. It does not copy files, install packages, register MCP servers, mutate receiving Sites, import source runtime state, or grant authority from catalog membership.

## First Slice

- Build advisory lift catalog artifact descriptors.
- Produce descriptor-only adoption plans.
- Produce pending receiving-Site adoption command packets.
- Refuse runtime databases, generated projections, histories, local roots, credentials, and live authority as portable state.

Receiving Sites must admit any lift locally before copying, installing, bootstrapping, registering, or executing anything.
