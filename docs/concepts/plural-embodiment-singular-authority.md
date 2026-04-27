# Plural Embodiment, Singular Authority

Plural Embodiment, Singular Authority is the Narada discipline for operating through many ergonomic surfaces while admitting each governed mutation through exactly one declared authority locus.

Its rule is:

```text
Many embodiments may present, inspect, or assist.
One declared authority locus must own each governed mutation.
```

## Embodiment And Authority

An embodiment is a way Narada becomes operationally present: a Windows shell, WSL shell, local clone, browser console, daemon, agent session, script, projection, or generated artifact.

An authority locus is the place where a durable transition becomes true: a Site registry, task lifecycle store, inbox database plus exported envelopes, event log, configured state-bearing clone, or effect queue.

The same physical thing may carry both roles, but the roles must not be collapsed. A clone can be useful for inspection without being the task mutation authority. A UI can request a change without owning truth. An agent can formulate a command without becoming the authority for its effect.

## Mutation Routing

Every mutating surface should follow this sequence:

```text
caller embodiment
-> classify authority class
-> resolve declared authority locus
-> check caller embodiment against that locus
-> execute, forward, or refuse
-> read back durable result
-> emit audit evidence
```

If the current embodiment is not the authority locus, it may inspect, dry-run, forward with disclosure, or refuse with a precise routing explanation. It must not silently mutate local state merely because local execution is possible.

## Mode Distinctions

| Mode | Rule |
| --- | --- |
| Inspection | May run from plural embodiments when freshness and locus are disclosed. |
| Proposal | May be formed anywhere, but must name the intended authority locus. |
| Mutation | Must execute at, or be routed through, the declared authority locus. |
| Projection rebuild | May run outside authority only when the output is derived and disposable. |

Read plurality is not write plurality. A stale clone can be useful for reading docs and unsafe for task allocation.

## Narada Consequences

- `narada doctor` should be able to report embodiment, authority locus, runtime origin, freshness, and mutation safety.
- Inbox submission should disclose target inbox authority before accepting payload.
- Task, chapter, lifecycle, roster, evidence, dispatch, and publication mutations should refuse or route when invoked from a non-authority locus.
- Cross-environment wrappers should route to the configured state-bearing clone instead of duplicating state.
- Read-only commands may run from replicas, but their output should identify the read locus and freshness posture when ambiguity is possible.

## Admission Test

A Narada surface satisfies this discipline for a mutation class when it can answer:

1. Which embodiments can present this command?
2. Which locus is authoritative for the mutation?
3. Where is the routing policy stored?
4. What happens from a non-authority embodiment?
5. How is freshness checked?
6. How is forwarding disclosed?
7. What read-back confirms the mutation?
8. What audit record identifies caller, authority locus, and result?
9. How can authority migrate later without split-brain state?
10. Which embodiments are read-only projections rather than authority-bearing substrates?

If these questions cannot be answered, plural embodiment is likely to become authority ambiguity.

## Relationship To Inhabited Evolution

This doctrine was earned by Narada self-build friction across Windows and WSL callers, multiple clones, canonical inbox state, task mutations, and agent sessions.

Inhabited Evolution allows that friction to lift into doctrine because the originating case can now run through the lifted rule: before mutation, identify the target locus; after mutation, read back evidence from the authority locus; when uncertain, record a proposal or pending crossing rather than mutating the wrong place.

## Summary

Plural embodiment is allowed and often necessary for ergonomic operation. Singular authority is required for governed consequence.

```text
Many front doors. One mutation locus.
```
