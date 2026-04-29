# Visibility Domain Reconciliation

A **Visibility Domain** is an external membership truth that decides which objects are presently visible, reachable, active, or admissible in a host environment.

Operator-surface adapters must treat visibility domains as reconciliation boundaries. An adapter may cache, arrange, focus, tile, or present objects, but it must not treat its managed object set as authoritative when the host has an independent membership truth.

## Examples

| Domain | Authority owner | Adapter risk |
| --- | --- | --- |
| Windows virtual desktop membership | Windows shell / OS APIs | A window manager tiles HWNDs that belong to another virtual desktop. |
| Display membership | Host display server / OS | A surface places controls on a disconnected or inactive display. |
| Browser profile membership | Browser profile manager | A Site surface opens work in the wrong credential/profile context. |
| Process or session membership | Host process/session manager | A runtime binding resumes against a stale or wrong process. |
| Workspace membership | Window manager / IDE / shell | A launcher assumes the currently visible workspace matches its stored placement. |

## Rule

```text
Adapter state is reconciled against visibility-domain truth before it is treated as current.
```

This rule applies to Windows Terminal, Komorebi, YASB, browser profiles, IDE workspaces, MCP consoles, and any future operator-surface adapter that presents or recovers inhabited work.

## Reconciliation Pattern

1. Read the current visibility-domain identity from the host authority.
2. Read the adapter-managed object set.
3. Query each managed object against the host visibility-domain authority.
4. Remove, float, ignore, or mark stale any object outside the current domain.
5. Retile, relaunch, focus, or recover only objects admitted by the current domain.
6. Assert no stale objects remain in active placement state.
7. Record evidence and residuals without embedding transcript-scale host logs.

The adapter may automate those steps only through its owning authority locus. Narada proper may specify the law and shared grammar; a PC Site, User Site, browser Site, or Project Site owns local host mutation.

## Windows Virtual Desktop + Komorebi Case

The earned case is a Windows virtual desktop transition where Komorebi retained an HWND from another desktop and tiled it into the active workspace. Windows virtual desktop membership still identified the HWND as belonging to the other desktop, and Komorebi produced invalid rectangles.

The bounded reconciliation capability is:

```text
after desktop transition
-> read current Windows virtual desktop identity
-> list Komorebi-managed HWNDs for the active display/workspace
-> query each HWND's Windows virtual desktop membership
-> remove/float/unmanage HWNDs outside the current desktop
-> retile current-desktop windows
-> assert no off-desktop HWNDs or invalid rectangles remain
```

This is a `repair_recovery_action` or guarded adapter reconciliation, not a primary work action. It belongs to the Windows PC Site or User Site authority locus, depending on where Komorebi/session recovery is governed.

## Anti-Collapse Rules

- Visibility-domain truth is not inferred from adapter state.
- Adapter convenience does not override host membership authority.
- Reconciliation is not proof of Site authority mutation.
- Narada proper doctrine does not mutate Windows, Komorebi, YASB, browser, IDE, or host runtime state.
- Large raw host logs stay in the local Site evidence locus; Narada proper records bounded evidence references and invariants.

## Relationship To Operator Surfaces

Operator Surfaces make inhabited work addressable. Visibility-domain reconciliation keeps the surface adapter honest about what the host currently admits as visible or active.

```text
Site authority
-> OperatorSurface declaration
-> adapter materialization
-> visibility-domain reconciliation
-> bounded surface recovery/action
-> evidence trace
```

The adapter may help find or recover work. The Site's governed crossings still admit consequences.
