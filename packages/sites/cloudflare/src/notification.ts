/**
 * Operator notification emission surface.
 *
 * Advisory side effects — non-blocking, rate-limited, actionable.
 * Does not control work opening, resolution, outbound mutation, or confirmation.
 *
 * Matches docs/product/unattended-operation-layer.md §4.
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
  recordSent(siteId: string, scopeId: string, channel: string, healthStatus: string): void;
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
    console.warn(JSON.stringify({ event: "operator_notification", channel: this.channel, ...notification }));
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

/** No-op emitter for tests or when notifications are disabled. */
export class NullNotificationEmitter implements NotificationEmitter {
  async emit(_notification: OperatorNotification): Promise<void> {
    // intentionally empty
  }
}
