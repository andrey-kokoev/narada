# Operator Console Contract

Shared UI-neutral descriptors for the Narada Operator Console surface catalog.

The contract describes concepts, ownership, routes, and default availability. A
runtime projects current availability into `OperatorSurfaceProjection` records.
The CLI and browser UI consume the same catalog; neither owns a second list of
operator surfaces.

The same package carries the redacted `OperatorSessionWireRecord` contract used
by the read-only Agent Session inventory. Session authority remains in the NARS
session index; the console contract does not grant lifecycle control.
