---
"@narada-core/nars-capability-gateway": patch
"@narada-core/pc-site-surface-service": patch
---

Add the authenticated, externally supervised PC Site surface service, route
explicit factory-backed NARS bindings through it only after action admission,
and provide explicit compatible generation replacement with durable event
evidence. Add reproducible hidden-watchdog install/status/remove commands and a
live acceptance suite covering cross-session sharing, authority and admission
refusal, stdio rollback, factory restoration, and watchdog recovery. Existing
stdio bindings remain the default and the rollback path.
