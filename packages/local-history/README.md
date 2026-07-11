# @narada2/local-history

Site-owned local work history for Narada.

The package stores immutable content-addressed snapshots and SQLite metadata in
the owning Site's ignored `.narada/runtime/local-history` directory. A User
Site may project metadata and pointers for navigation, but never stores the
contents of another Site's snapshots. Non-Site roots use separate per-root
User Site policies and stores. The package has no NARS, agent, MCP, or editor
dependency.

The core store enforces policy opt-in for all snapshot mutations, rejects
canonical and reparse-point escapes, and publishes daemon metadata atomically.
The CLI verifies Git-backed Site runtime storage and the User Site identity
marker are ignored before enabling history. New policies use the package
baseline plus the optional User Site template
`<user-site>/config/local-history.defaults.json`; persisted Site policies are
authoritative afterward. A mandatory privacy floor excludes authority data,
environment files, key/certificate material, and secret/credential-named
paths regardless of policy edits.
