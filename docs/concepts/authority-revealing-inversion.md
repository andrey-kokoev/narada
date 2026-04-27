# Authority-Revealing Inversion

Authority-Revealing Inversion is a Narada review move for resisting artifact-first design.

When an artifact appears primary, invert attention toward the concealed authority structure that makes it meaningful:

```text
visible artifact
  -> hidden authority / lifecycle / evidence / locus / admission / capability
  -> reintroduced artifact as embodiment, projection, substrate, transport, request, or cache
```

The inversion does not reject artifacts. It prevents Narada from mistaking an artifact for the authority grammar that governs it.

## Rule

Before treating a file, folder, command, UI, repo, message, database row, agent action, or generated output as primary, ask:

```text
What authority, lifecycle, evidence, locus, admission rule, or capability does this artifact embody?
```

If the answer is unclear, do not let the artifact become authoritative by convenience. Route it through an explicit task, inbox item, crossing, command, review, or residual.

## Narada Reading

| Appears Primary | Inverted Reading |
| --- | --- |
| Markdown task file | Projection of task authority; lifecycle truth is command-mediated and SQLite-backed where migrated. |
| Inbox SQLite DB | Local intake store plus exported envelope artifacts; envelope status changes remain governed crossings. |
| CLI command | Embodiment of an authority class; command availability does not grant mutation authority. |
| Agent response | Intelligence output; it becomes authority only through admitted artifact, command, evidence, or Operator decision. |
| Repo clone | Embodiment/read locus unless it is the declared mutation authority for that operation. |
| UI/read model | Projection over durable state; useful for inspection but not the authority boundary itself. |
| Test output | Admission evidence only when requested, bounded, recorded, and associated with the relevant intent. |
| Secret value | Capability embodiment; authority belongs to the governed secret lifecycle and reveal/rotation regime. |

## Expected Signs

- A proposed change identifies its authority locus before mutation.
- The artifact is described as projection, embodiment, substrate, request, cache, or transport when that is what it is.
- The crossing artifact and admission rule are named.
- Evidence can be replayed or inspected without trusting conversational memory.
- Operator correction can change the next cycle because it enters through a durable path.

## Anti-Signs

- A convenient file path becomes the reason a mutation is allowed.
- A command succeeds locally but the target authority locus is ambiguous.
- A generated transcript is treated as evidence without output admission.
- A UI affordance mutates truth directly because it is ergonomic.
- An agent declares work done without lifecycle evidence.
- A clone, branch, or environment silently becomes the operative Site.

## Relationship To Existing Doctrine

Authority-Revealing Inversion is not a new runtime object, zone, lifecycle state, or package.

It is a review lens that supports:

- **Inhabited Evolution**: lift only the authority structure earned by the originating operation.
- **Plural Embodiment, Singular Authority**: many embodiments may assist, but one declared authority locus owns each governed mutation.
- **Intelligence-Authority Separation**: recognition and synthesis do not grant decision or mutation authority.
- **Zone and crossing discipline**: artifacts crossing boundaries must carry an explicit regime and confirmation rule.

## Implementation Inventory

Narada keeps a bounded, machine-readable inventory of artifact-first authority risks in [`authority-inversion-inventory.json`](authority-inversion-inventory.json).

The inventory is not a repair mechanism. It is input for coherence scanning, review prompts, and future implementation tasks. Each entry names the visible artifact, hidden authority structure, current guard, remaining gap, severity, and recommended follow-up.

## Practical Agent Rule

When a task asks for a direct fix, an ergonomic wrapper, a migration, a document, or a new operator surface, first perform the inversion:

```text
What appears to be the thing?
What actually owns authority?
What durable artifact crosses the boundary?
What confirms the crossing?
What should remain only a projection or convenience surface?
```

Then implement the smallest change that makes the authority structure explicit and keeps the originating case runnable.
