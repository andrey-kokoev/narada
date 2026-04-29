# Runtime Identity Binding

A **Runtime Identity Binding** is a governed relationship between a durable identity and a volatile runtime handle.

It answers this question:

```text
Which durable identity, if any, is this live runtime object currently allowed to represent?
```

It does not make the runtime handle authoritative. It prevents ergonomic carriers such as titles, process names, window classes, profile names, or transcript labels from becoming naming authority by convenience.

## Split

Runtime identity binding separates four things:

| Layer | Meaning | Authority posture |
| --- | --- | --- |
| Durable identity | Stable Site, role, surface, participant, or workflow identity. | Owned by the Site or identity registry that governs the identity. |
| Volatile substrate handle | Runtime-local handle such as HWND, process id, session id, tab id, WebSocket id, MCP client id, or API thread id. | Owned by the runtime/host locus that observes or allocates the handle. |
| Carrier evidence | Title, terminal profile, class name, process metadata, launch args, URL, transcript label, or other matching hints. | Evidence only; never naming authority by itself. |
| Projection consumer | Overlay, bar, terminal portal, browser profile, MCP client, session inspector, or dashboard that displays or uses the binding. | May present the binding; does not create or admit it. |

The canonical shape is:

```text
runtime_handle -> durable_identity -> presentation_label
```

For Windows operator surfaces:

```text
HWND -> identity_name -> label
```

The PC Site or Windows runtime locus owns `HWND -> identity_name` because HWND values are machine-local runtime facts. The User Site owns `identity_name -> label` when the label is part of user-facing identity or preference. Narada proper may specify the grammar but must not mutate the local Windows binding by convenience.

## Admission Rule

A runtime identity binding is admitted only when the handle is observed in the owning runtime locus and the target identity is recognized by the governing identity authority.

Carrier evidence may support admission:

- visible window title;
- terminal profile;
- tab title;
- process id or executable name;
- class name;
- launch command;
- URL or browser profile;
- transcript or API thread reference.

Carrier evidence must not replace admission. If the runtime handle cannot be bound, the correct result is explicit absence:

```text
no_runtime_binding
```

Unknown objects remain unlabeled by default.

## Reconciliation

Runtime identity bindings are current-state projections. They can go stale whenever a host reallocates handles, windows move across desktops, processes restart, browser sessions change, or API conversations are resumed through a different channel.

Before a projection consumer treats a binding as current, it should reconcile:

1. Read the durable identity authority.
2. Read the runtime handle from the runtime/host authority.
3. Check relevant visibility or membership domains.
4. Re-admit or reject the binding.
5. Emit bounded evidence and residuals.

Use [`Visibility Domain Reconciliation`](visibility-domain-reconciliation.md) when host membership truth can veto adapter state.

## Anti-Collapse Rules

- A title is not an identity.
- A process id is not an identity.
- A window handle is not an identity.
- A terminal profile is not proof of role or Site.
- A transcript label is not runtime authority.
- A projection consumer must not invent identity when binding is absent.
- Narada proper doctrine does not mutate local runtime bindings outside the owning Site.

## First Fixture

The earned fixture is the Windows overlay case:

- title-based matching failed after Windows Terminal titles became dynamic;
- overlay inspection reported `no_runtime_binding` for visible but unbound terminal windows;
- an explicit focused-window assertion bound a live HWND to `narada-andrey.architect`;
- the stable display path became `HWND -> identity_name -> label`.

This fixture generalizes to other runtime projections without making Windows the primitive.

## Relationship To Operator Surfaces

Operator Surfaces make inhabited work addressable. Runtime identity bindings let an Operator Surface or projection consumer identify which live runtime object currently corresponds to a durable identity.

```text
Site identity authority
-> runtime handle observation
-> runtime identity binding
-> projection consumer display
-> bounded evidence trace
```

The binding helps a surface be found and labeled. It does not admit task mutation, effect execution, evidence closure, or capability access.
