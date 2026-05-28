# Carrier Action Admission

Carrier-neutral v0 implementation of the Carrier Action Admission Boundary.

This module converts non-read-only carrier tool requests into durable request/decision evidence. It does not execute mutating actions and does not create canonical candidates in v0.

NARS server mode is the first integration. Claude Code mediation currently has a carrier-specific implementation under `tools/agent-start`; it should later consolidate onto this module after NARS evidence semantics are stable.

