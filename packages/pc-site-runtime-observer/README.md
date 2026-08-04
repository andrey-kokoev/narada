# PC Site Runtime Observer

The observer is a dedicated native process that attributes memory and process resources only within one authority-bound PC Site MCP topology. It tails sanitized producer spools, samples registered PIDs and descendants, reads factory-worker V8 measurements from the authenticated PC Site service, and is the sole writer of `observations.db`.

It is evidence-only: detections create reviewable incidents and reports but never restart, replace, or terminate runtime owners. Heap snapshots remain explicit operator actions owned by the surface service.

Normal sampling is every 10 seconds. Lifecycle changes enter a 60-second one-second burst. Raw samples are retained for seven days, one-minute rollups for 90 days, and incidents until reviewed.

A per-Site native mutex enforces the single-writer invariant. Health checks validate both PID and executable identity. Each collection cycle records its duration and sampled-process count so `runtime_introspection_memory_status` can report bounded p95 latency, CPU, and private-memory overhead from evidence rather than configuration claims.
