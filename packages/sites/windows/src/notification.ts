/**
 * Operator notification emission surface.
 *
 * Advisory side effects — non-blocking, rate-limited, actionable.
 * Does not control work opening, resolution, outbound mutation, or confirmation.
 *
 * Mirrors the Cloudflare-site notification contract so operator surfaces
 * are substrate-agnostic.
 */

export interface OperatorNotification {
  site_id: string;
  scope_id: string;
  severity: "warning" | "critical";
  health_status: "degraded" | "critical" | "auth_failed";
  summary: string;
  detail: string;
  suggested_action: string;
  occurred_at: string;
  cooldown_until: string;
}

export interface NotificationAdapter {
  readonly channel: string;
  emit(notification: OperatorNotification): Promise<void>;
}

export interface NotificationRateLimiter {
  isCooldownActive(
    siteId: string,
    scopeId: string,
    channel: string,
    healthStatus: string,
    cooldownMs: number,
  ): boolean;
  recordSent(
    siteId: string,
    scopeId: string,
    channel: string,
    healthStatus: string,
  ): void;
}

export interface NotificationEmitter {
  emit(notification: OperatorNotification): Promise<void>;
}

/** Default cooldown: 15 minutes. */
export const DEFAULT_NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000;

/** Structured-log adapter — zero-config default. */
export class LogNotificationAdapter implements NotificationAdapter {
  readonly channel = "log";

  async emit(notification: OperatorNotification): Promise<void> {
    console.warn(
      JSON.stringify({
        event: "operator_notification",
        channel: this.channel,
        ...notification,
      }),
    );
  }
}

/**
 * Coordinates adapter emission with rate limiting.
 * Adapter failures are logged but never thrown.
 */
export class DefaultNotificationEmitter implements NotificationEmitter {
  constructor(
    private adapters: NotificationAdapter[],
    private rateLimiter: NotificationRateLimiter,
    private cooldownMs: number = DEFAULT_NOTIFICATION_COOLDOWN_MS,
  ) {}

  async emit(notification: OperatorNotification): Promise<void> {
    for (const adapter of this.adapters) {
      const cooldownActive = this.rateLimiter.isCooldownActive(
        notification.site_id,
        notification.scope_id,
        adapter.channel,
        notification.health_status,
        this.cooldownMs,
      );

      if (cooldownActive) {
        console.log(
          JSON.stringify({
            event: "notification_suppressed",
            site_id: notification.site_id,
            scope_id: notification.scope_id,
            channel: adapter.channel,
            health_status: notification.health_status,
            reason: "cooldown_active",
            cooldown_until: notification.cooldown_until,
          }),
        );
        continue;
      }

      try {
        await adapter.emit(notification);
        this.rateLimiter.recordSent(
          notification.site_id,
          notification.scope_id,
          adapter.channel,
          notification.health_status,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          JSON.stringify({
            event: "notification_adapter_failed",
            site_id: notification.site_id,
            scope_id: notification.scope_id,
            channel: adapter.channel,
            error: message,
          }),
        );
      }
    }
  }
}

/** Webhook adapter — POSTs JSON to a configured URL. */
export class WebhookNotificationAdapter implements NotificationAdapter {
  readonly channel = "webhook";
  private url: string;
  private headers: Record<string, string>;

  constructor(options: { url: string; headers?: Record<string, string> }) {
    this.url = options.url;
    this.headers = options.headers ?? { "Content-Type": "application/json" };
  }

  async emit(notification: OperatorNotification): Promise<void> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(notification),
    });
    if (!res.ok) {
      throw new Error(`Webhook returned ${res.status}: ${res.statusText}`);
    }
  }
}

/** Rate limiter backed by the SQLite coordinator. */
export class SqliteNotificationRateLimiter implements NotificationRateLimiter {
  constructor(private coordinator: { getLastNotification(siteId: string, channel: string): { health_status: string; occurred_at: string } | null }) {}

  isCooldownActive(
    siteId: string,
    _scopeId: string,
    channel: string,
    _healthStatus: string,
    cooldownMs: number,
  ): boolean {
    const last = this.coordinator.getLastNotification(siteId, channel);
    if (!last) return false;
    const lastAt = new Date(last.occurred_at).getTime();
    return Date.now() - lastAt < cooldownMs;
  }

  recordSent(
    _siteId: string,
    _scopeId: string,
    _channel: string,
    _healthStatus: string,
  ): void {
    // Persistence is handled by the caller calling coordinator.recordNotification
    // after successful emit. This method is a no-op for the SQLite-backed limiter.
  }
}

/** No-op emitter for tests or when notifications are disabled. */
export class NullNotificationEmitter implements NotificationEmitter {
  async emit(_notification: OperatorNotification): Promise<void> {
    // intentionally empty
  }
}

/**
 * Emit an operator notification if the health status warrants it
 * and rate limiting permits.
 */
export async function notifyOperator(
  siteId: string,
  scopeId: string,
  healthStatus: string,
  coordinator: {
    getLastNotification(siteId: string, channel: string): { health_status: string; occurred_at: string } | null;
    recordNotification(siteId: string, channel: string, healthStatus: string, summary: string, occurredAt: string): void;
  },
  adapters?: NotificationAdapter[],
  cooldownMs?: number,
): Promise<void> {
  if (healthStatus !== "critical" && healthStatus !== "auth_failed") {
    return;
  }

  const resolvedAdapters = adapters ?? [new LogNotificationAdapter()];
  const resolvedCooldownMs = cooldownMs ?? DEFAULT_NOTIFICATION_COOLDOWN_MS;
  const now = new Date().toISOString();

  const rateLimiter = new SqliteNotificationRateLimiter(coordinator);
  const emitter = new DefaultNotificationEmitter(resolvedAdapters, rateLimiter, resolvedCooldownMs);

  const severity: OperatorNotification["severity"] = "critical";
  const summary =
    healthStatus === "auth_failed"
      ? `Auth failure on site ${siteId}`
      : `Site ${siteId} health is critical`;
  const detail =
    healthStatus === "auth_failed"
      ? `Authentication failed for site ${siteId}. Sync is paused until credentials are restored.`
      : `Site ${siteId} has reached critical health after repeated cycle failures or stuck-cycle recovery.`;
  const suggestedAction =
    healthStatus === "auth_failed"
      ? `narada retry-auth-failed --site ${siteId}`
      : `narada doctor --site ${siteId}`;

  const notification: OperatorNotification = {
    site_id: siteId,
    scope_id: scopeId,
    severity,
    health_status: healthStatus as "critical" | "auth_failed",
    summary,
    detail,
    suggested_action: suggestedAction,
    occurred_at: now,
    cooldown_until: new Date(Date.now() + resolvedCooldownMs).toISOString(),
  };

  await emitter.emit(notification);

  // Persist notification record for rate-limiting
  for (const adapter of resolvedAdapters) {
    coordinator.recordNotification(siteId, adapter.channel, healthStatus, summary, now);
  }
}
