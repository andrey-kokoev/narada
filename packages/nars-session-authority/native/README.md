# Native NARS session authority

This crate owns the SQLite authority row, singleton admission, lease and
heartbeat updates, fencing token/epoch checks, reclamation, and authority
event journal for the NARS runtime. It preserves the public
`narada.nars.session_authority.v1` and principal schemas used by the
TypeScript compatibility surface.
