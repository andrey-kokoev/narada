# @narada2/local-history

Site-owned local work history for Narada.

The package stores immutable content-addressed snapshots and SQLite metadata in
the owning Site's ignored `.narada/runtime/local-history` directory. A User
Site may project metadata and pointers for navigation, but never stores the
contents of another Site's snapshots. Non-Site roots use separate per-root
User Site policies and stores. The package has no NARS, agent, MCP, or editor
dependency.
