# Graph Adapter

## Overview

The Graph Adapter translates Microsoft Graph API delta queries into `NormalizedBatch` objects. It handles authentication, pagination, and the conversion from Graph's data model to the internal normalized format.

---

## Component Structure

```
adapter/graph/
├── auth.ts           # Token providers (static, client credentials)
├── client.ts         # HTTP client with auth and immutable IDs
├── delta.ts          # Delta pagination walker
├── adapter.ts        # Main adapter implementing GraphAdapter interface
└── scope.ts          # (if present) Scope resolution utilities
```

---

## Authentication

### StaticBearerTokenProvider

Use pre-obtained access tokens:

```typescript
const provider = new StaticBearerTokenProvider({
  accessToken: "eyJ0eXAiOiJKV1Qi...",
});

// Or with function for dynamic tokens
const provider = new StaticBearerTokenProvider({
  accessToken: () => getTokenFromCache(),
});
```

### ClientCredentialsTokenProvider

OAuth 2.0 client credentials flow:

```typescript
const provider = new ClientCredentialsTokenProvider({
  tenantId: "contoso.onmicrosoft.com",
  clientId: "a1b2c3d4-...",
  clientSecret: "secret",
  scope: "https://graph.microsoft.com/.default",  // Optional
});

const token = await provider.getAccessToken();
```

**Token Caching**:
- Automatically caches tokens
- Refreshes 60 seconds before expiry
- Thread-safe for concurrent requests

---

## HTTP Client

### GraphHttpClient

```typescript
const client = new GraphHttpClient({
  tokenProvider,
  baseUrl: "https://graph.microsoft.com/v1.0",  // Optional
  preferImmutableIds: true,                      // Recommended
  fetchImpl: fetch,                              // Optional (for testing)
});
```

### Immutable IDs

The client always requests immutable IDs:

```
GET /users/{userId}/mailFolders/{folderId}/messages/delta
Headers:
  Authorization: Bearer {token}
  Accept: application/json
  Prefer: IdType="ImmutableId"
```

Immutable IDs remain constant when messages are moved between folders, essential for reliable sync.

### Delta Query URL

```typescript
const url = client.buildFolderMessagesDeltaUrl(userId, folderId);
// https://graph.microsoft.com/v1.0/users/{userId}/mailFolders/{folderId}/messages/delta
```

---

## Delta Walker

### GraphDeltaWalker

Handles pagination through delta results:

```typescript
const walker = new GraphDeltaWalker({
  client,
  userId: "user@example.com",
  folderId: "inbox",
});

const result = await walker.walkFromCursor(cursor);
// { messages: [...], nextCursor: "https://graph.microsoft.com/..." }
```

### Pagination Logic

```typescript
async walkFromCursor(cursor?: string | null): Promise<GraphDeltaWalkResult> {
  let url = cursor ?? this.client.buildFolderMessagesDeltaUrl(...);
  const messages: GraphDeltaMessage[] = [];

  while (url) {
    const page = await this.client.getDeltaPage(url);
    messages.push(...page.value);
    
    // Continue to next page or finish
    url = page["@odata.nextLink"] ?? "";
  }

  // Must have deltaLink to track position
  const deltaLink = page["@odata.deltaLink"];
  if (!deltaLink) {
    throw new Error("Delta query did not return @odata.deltaLink");
  }

  return { messages, nextCursor: deltaLink };
}
```

### Delta Link Format

The `nextCursor` is the full URL from `@odata.deltaLink`:

```
https://graph.microsoft.com/v1.0/users/{userId}/mailFolders/{folderId}/messages/delta?
  $deltatoken=0A0A0A..."
```

This URL is stored as the cursor and used directly for subsequent requests.

---

## Graph Types

### GraphDeltaMessage

Raw message from delta API:

```typescript
interface GraphDeltaMessage {
  id: string;
  conversationId?: string;
  receivedDateTime?: string;
  subject?: string;
  body?: {
    contentType: string;
    content: string;
  };
  from?: {
    emailAddress?: { name?: string; address?: string };
  };
  toRecipients?: Recipient[];
  ccRecipients?: Recipient[];
  bccRecipients?: Recipient[];
  attachments?: GraphAttachment[];
  isRead?: boolean;
  isDraft?: boolean;
  internetMessageId?: string;
  changeKey?: string;        // Version identifier
  parentFolderId?: string;   // Current folder
  flag?: { flagStatus?: string };
  "@removed"?: { reason: string };  // Deletion marker
}
```

### GraphDeltaPage

Paginated response:

```typescript
interface GraphDeltaPage<T> {
  value: T[];
  "@odata.deltaLink"?: string;  // Final URL (store as cursor)
  "@odata.nextLink"?: string;   // Next page URL
}
```

---

## DefaultGraphAdapter

### Configuration

```typescript
const adapter = new DefaultGraphAdapter({
  mailbox_id: "user@example.com",
  user_id: "user@example.com",
  client,
  adapter_scope: {
    mailbox_id: "user@example.com",
    included_container_refs: ["inbox"],
    included_item_kinds: ["message"],
    attachment_policy: "metadata_only",
    body_policy: "text_only",
  },
  body_policy: "text_only",
  attachment_policy: "metadata_only",
  include_headers: false,
  normalize_folder_ref: (parentFolderId) => [parentFolderId ?? "unknown"],
  normalize_flagged: (flag) => flag?.flagStatus === "flagged",
});
```

### Sync Operation

```typescript
const batch = await adapter.fetch_since(cursor);
// Returns: NormalizedBatch with events and next_cursor
```

**Process**:
1. Walk delta pages starting from cursor (or initial)
2. Normalize each message to `NormalizedEvent`
3. Deduplicate by event_id
4. Return batch with next cursor

---

## Delta Change Types

### Created/Updated Messages

Messages without `@removed` are upserts:

```json
{
  "id": "AAMkAD...",
  "changeKey": "CQAAABY...",
  "subject": "Hello",
  ...
}
```

→ `event_kind: "upsert"`

### Deleted Messages

Messages with `@removed` are deletes:

```json
{
  "id": "AAMkAD...",
  "@removed": { "reason": "deleted" }
}
```

→ `event_kind: "delete"`

The `classify_removed_as_delete` callback can filter which removals become deletes (e.g., ignore soft deletes).

---

## Error Handling

### HTTP Errors

```typescript
if (!response.ok) {
  const text = await response.text();
  throw new Error(`Graph request failed ${response.status}: ${text.slice(0, 500)}`);
}
```

Common status codes:
- `401 Unauthorized`: Token expired or invalid
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: User or folder doesn't exist
- `429 Too Many Requests`: Rate limited

### Token Errors

```typescript
// Client credentials failure
throw new Error("Token request failed 401: ...");

// Empty token
throw new Error("Graph access token is empty");
```

### Delta Errors

```typescript
// No deltaLink in response (shouldn't happen)
throw new Error("Delta query did not return @odata.deltaLink");
```

---

## Rate Limiting

Graph API returns rate limit headers:

```
Retry-After: 120
```

The current adapter doesn't automatically retry; the runner treats 429 as `retryable_failure`.

**Best Practices**:
- Use reasonable polling intervals (≥ 60 seconds)
- Monitor for 429 responses
- Consider backing off on repeated failures

---

## Testing the Adapter

### Mock Client

```typescript
const mockClient = {
  buildFolderMessagesDeltaUrl: () => "https://...",
  getDeltaPage: vi.fn().mockResolvedValue({
    value: [mockMessage],
    "@odata.deltaLink": "https://.../delta?$deltatoken=abc123",
  }),
};

const adapter = new DefaultGraphAdapter({
  client: mockClient as GraphHttpClient,
  ...otherConfig,
});
```

### Integration Testing

For real Graph API testing, use a dedicated test tenant with limited data:

```typescript
// Requires: GRAPH_ACCESS_TOKEN or credentials in env
const config = await loadConfig({ path: "test-config.json" });
const tokenProvider = buildGraphTokenProvider({ config });
const client = new GraphHttpClient({ tokenProvider });
const adapter = new DefaultGraphAdapter({ client, ... });

const batch = await adapter.fetch_since(null);
console.log(`Fetched ${batch.events.length} events`);
```

---

## Known Limitations

### Single Folder Only

Current implementation supports exactly one folder:

```typescript
if (refs.length !== 1) {
  throw new Error("Exactly one included_container_ref is required");
}
```

Multi-folder support requires architectural changes for proper delta tracking.

### No Batch Size Control

Graph API controls page size; the adapter follows `nextLink` until exhaustion. Large folders may result in many pages.

### No Automatic Retry

Transient failures (network, rate limit) return as errors. The runner may retry based on `RunResult.status`.

---

## Extension Points

### Custom Token Provider

Implement `GraphTokenProvider`:

```typescript
interface GraphTokenProvider {
  getAccessToken(): Promise<string>;
}

class OnBehalfOfProvider implements GraphTokenProvider {
  async getAccessToken(): Promise<string> {
    // Implement OBO flow
  }
}
```

### Custom Normalization

Extend `DefaultGraphAdapter` and override normalization hooks:

```typescript
class CustomAdapter extends DefaultGraphAdapter {
  protected normalizeFolderRef(parentFolderId?: string): string[] {
    // Custom folder naming
    return [parentFolderId?.toLowerCase() ?? "unknown"];
  }
}
```

---

## See Also

- [02-architecture.md](02-architecture.md) — Where the adapter fits in component layers
- [04-identity.md](04-identity.md) — How delta entries become normalized events
- [06-configuration.md](06-configuration.md) — Configuring the adapter
- [08-quickstart.md](08-quickstart.md) — Writing code to run the adapter
