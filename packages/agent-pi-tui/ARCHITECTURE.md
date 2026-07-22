# Agent Pi TUI ownership ledger

The topology is one NARS session with four sibling operator projections:

```text
NARS -> agent-cli
     -> agent-tui
     -> agent-web-ui
     -> agent-pi-tui
```

`pi` remains an independent runtime/carrier selection. `agent-pi-tui` is only
the terminal projection shown in the final branch above.

| Concern | Owner |
| --- | --- |
| Session journal and event sequence | NARS session core |
| Provider and model execution | NARS runtime/provider boundary |
| Tool and MCP execution | NARS admission/runtime boundary |
| Input admission and idempotency | NARS session core |
| Replay, cursor, and attachment | `agent-pi-tui` NARS client adapter |
| Event meaning and projection classes | `@narada2/nars-client-projection-contract` |
| Pi-style rows, theme, focus, and scroll | `agent-pi-tui` presentation layer |
| Terminal differential rendering | `@earendil-works/pi-tui` |

The client may request an admitted NARS control, but it never derives a
provider/tool state machine or treats a socket write as durable admission.
Socket loss after a write is ambiguous: the client reports the ambiguity and
does not resend that frame automatically.
