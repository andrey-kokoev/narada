# Agent J Assignment: Webhook Real-time Sync

## Mission
Add push-based sync via Microsoft Graph webhooks for near real-time updates.

## Scope
`packages/exchange-fs-sync/` - Subscription management
`packages/exchange-fs-sync-daemon/` - Webhook receiver

## Deliverables

### 1. Subscription Management

```typescript
// src/adapter/graph/subscription.ts
export interface SubscriptionConfig {
  changeTypes: ('created' | 'updated' | 'deleted')[];
  notificationUrl: string;
  lifecycleNotificationUrl?: string;
  expirationMinutes: number;  // max 4230 min (~3 days)
}

export interface Subscription {
  id: string;
  expirationDateTime: string;
  clientState: string;  // validation token
}

export class GraphSubscriptionManager {
  constructor(
    private adapter: GraphAdapter,
    private config: SubscriptionConfig
  ) {}

  async create(): Promise<Subscription>;
  async renew(subscriptionId: string): Promise<void>;
  async delete(subscriptionId: string): Promise<void>;
  async list(): Promise<Subscription[]>;
  
  // Auto-renewal before expiration
  async setupAutoRenewal(
    subscription: Subscription,
    onRenew: (sub: Subscription) => void
  ): Promise<void>;
}
```

### 2. Webhook Receiver

```typescript
// daemon/src/webhook-server.ts
import { createServer, IncomingMessage, ServerResponse } from 'http';

export interface WebhookServerConfig {
  port: number;
  host: string;
  validationToken: string;
  path: string;  // e.g., '/webhook'
}

export interface Notification {
  subscriptionId: string;
  clientState: string;
  changeType: 'created' | 'updated' | 'deleted';
  resource: string;  // "Users('id')/Messages('id')"
  subscriptionExpirationDateTime: string;
}

export function createWebhookServer(
  config: WebhookServerConfig,
  onNotification: (notification: Notification) => void
): {
  start(): Promise<void>;
  stop(): Promise<void>;
};
```

### 3. Notification Handling

```typescript
// daemon/src/notification-handler.ts
export interface NotificationHandler {
  handle(notification: Notification): Promise<void>;
}

export class SyncOnNotification implements NotificationHandler {
  async handle(notification: Notification): Promise<void> {
    // Parse resource to get message ID
    const messageId = extractMessageId(notification.resource);
    
    switch (notification.changeType) {
      case 'created':
        await this.syncSingleMessage(messageId);
        break;
      case 'updated':
        await this.updateMessage(messageId);
        break;
      case 'deleted':
        await this.tombstoneMessage(messageId);
        break;
    }
  }
  
  private async syncSingleMessage(id: string): Promise<void> {
    // Fetch just this message, not full sync
    const message = await this.adapter.fetchMessageById(id);
    await this.store.write(message);
  }
}
```

### 4. Lifecycle Notifications

```typescript
// Handle subscription lifecycle events
export async function handleLifecycleNotification(
  notification: LifecycleNotification
): Promise<void> {
  switch (notification.lifecycleEvent) {
    case 'subscriptionRemoved':
      // Subscription expired or max renewals reached
      // Must re-create subscription
      await recreateSubscription();
      break;
    case 'reauthorizationRequired':
      // User revoked consent
      await notifyAdmin('reauth-required');
      break;
    case 'missed':
      // Notifications missed, need full sync
      await triggerFullSync();
      break;
  }
}
```

### 5. Delta Sync After Missed Notifications

```typescript
// src/runner/delta-sync.ts
export async function deltaSync(
  adapter: GraphAdapter,
  store: MessageStore,
  lastSyncTime: Date
): Promise<{
  added: number;
  updated: number;
  deleted: number;
}>;
```

Uses Graph delta query: `/me/mailFolders/{id}/messages/delta`

### 6. Webhook Security

```typescript
// daemon/src/webhook-validation.ts
import { createHmac } from 'crypto';

export function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('base64');
  return signature === expected;
}

// Also validate clientState matches
export function validateClientState(
  received: string,
  expected: string
): boolean;
```

### 7. Fallback to Polling

```typescript
// daemon/src/sync-scheduler.ts
export interface SyncSchedulerConfig {
  mode: 'webhook' | 'poll' | 'hybrid';
  pollIntervalMinutes: number;  // fallback
  webhookTimeoutMinutes: number;
}

export class HybridSyncScheduler {
  private lastWebhookReceived: Date | null = null;
  
  async start(): Promise<void> {
    if (this.config.mode === 'webhook' || this.config.mode === 'hybrid') {
      await this.startWebhookServer();
      await this.createSubscription();
    }
    
    // Always have polling as safety net
    this.startPollingFallback();
  }
  
  private startPollingFallback(): void {
    setInterval(() => {
      const sinceWebhook = this.lastWebhookReceived 
        ? Date.now() - this.lastWebhookReceived.getTime()
        : Infinity;
      
      // If no webhook for 2x expected interval, poll
      if (sinceWebhook > this.config.webhookTimeoutMinutes * 2 * 60 * 1000) {
        this.triggerFullSync();
      }
    }, this.config.pollIntervalMinutes * 60 * 1000);
  }
}
```

### 8. Ngrok for Development

```typescript
// CLI command for dev tunnel
// exchange-sync dev-tunnel --port 3000

import ngrok from '@ngrok/ngrok';

export async function startDevTunnel(
  localPort: number
): Promise<{ url: string; stop: () => Promise<void> }> {
  const listener = await ngrok.forward({
    addr: localPort,
    authtoken_from_env: true,
  });
  
  return {
    url: listener.url(),
    stop: () => listener.close()
  };
}
```

## Config

```json
{
  "webhook": {
    "enabled": true,
    "public_url": "https://api.example.com/webhook",
    "port": 3000,
    "secret": { "$secure": "webhook_secret" },
    "subscription_expiration_minutes": 1440,
    "auto_renew": true,
    "fallback_poll_minutes": 15
  }
}
```

## Definition of Done

- [ ] Subscriptions created/renewed automatically
- [ ] Webhook server validates signatures
- [ ] Notifications trigger targeted sync
- [ ] Lifecycle events handled correctly
- [ ] Missed notifications trigger delta sync
- [ ] Fallback polling works
- [ ] Dev tunnel CLI command
- [ ] Webhook security (signature validation)
- [ ] Subscription per mailbox (multi-mailbox support)

## Dependencies
- Agent H's multi-mailbox (subscription per mailbox)
- Agent F's security (webhook secret storage)
- Agent C's retry (subscription renewal retry)

## Time Estimate
6 hours
