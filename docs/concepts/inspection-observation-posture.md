# Inspection Observation Posture

Inspection commands can be source-read-only while still admitting an observation artifact.

This means:

- They do not mutate the authority being inspected.
- They may write a bounded observation record describing what was seen.
- The observation record is evidence of inspection, not a mutation of the inspected source.

For example, `narada task evidence list` is read-only with respect to task lifecycle authority, but it writes an observation artifact so output admission is bounded and durable.
