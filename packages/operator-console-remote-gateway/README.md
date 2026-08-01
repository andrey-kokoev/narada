# @narada-core/operator-console-remote-gateway

The local crossing boundary for a remote Operator Console projection.

The gateway binds to loopback, authenticates a dedicated bridge token, and
forwards only the explicitly declared Operator Console and read-only leased
workspace routes from the local parity inventory to the stable local Operator Router. It
loads that inventory from `GET /console/routes` before listening and refuses to
start, or to forward after the inventory becomes stale, when the inventory is
missing or incomplete. `POST` is admitted only for routes declared as Console
intent endpoints; all other mutation methods are refused.

Declared WebSocket routes use a separate upgrade path. The gateway rewrites
the upstream Host and loopback Origin for the local Router and relays frames;
browser Origin, cookies, and authority credentials are not forwarded.

The gateway never accepts a caller-supplied upstream URL and never exposes the
Router's registration token to the remote caller. The local Console route
table is the source of truth; the parity document is evidence of its remote
disposition, not a second hand-maintained route authority.

Cloudflare Tunnel should terminate at this gateway, not at the raw Operator
Router. The Cloudflare Worker supplies the bridge token on the server side.
