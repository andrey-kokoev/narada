/**
 * Cross-Site Notification Router.
 *
 * Watches aggregated health across all Sites and emits
 * {@link OperatorNotification} when a Site transitions to `critical`
 * or `auth_failed`.
 *
 * Respects per-channel cooldown (default 15 minutes).
 * Logs suppressed notifications as structured traces.
 *
 * Advisory only — non-blocking, non-mutating.
 */

import type { SiteRegistry, RegisteredSite } from "./registry.js";
import type { SiteObservationApi } from "./site-observation.js";
import type { SiteHealthRecord } from "./types.js";
import type {
  NotificationEmitter,
  OperatorNotification,
} from "./notification.js";
import { DEFAULT_NOTIFICATION_COOLDOWN_MS } from "./notification.js";

/** Tracks the last observed health status and notification time per site. */
export class SiteHealthTracker {
  private lastStatus = new Map<string, SiteHealthRecord["status"]>();
  private lastNotifiedAt = new Map<string, number>();

  /**
   * Record the current health status for a site.
   * Returns the previous status (or undefined if first observation).
   */
  record(
    siteId: string,
    status: SiteHealthRecord["status"],
  ): SiteHealthRecord["status"] | undefined {
    const previous = this.lastStatus.get(siteId);
    this.lastStatus.set(siteId, status);
    return previous;
  }

  /** Get the last recorded status for a site. */
  get(siteId: string): SiteHealthRecord["status"] | undefined {
    return this.lastStatus.get(siteId);
  }

  /** Record that a notification was just emitted for a site. */
  recordNotification(siteId: string): void {
    this.lastNotifiedAt.set(siteId, Date.now());
  }

  /** Get the timestamp (ms since epoch) of the last notification for a site. */
  getLastNotifiedAt(siteId: string): number | undefined {
    return this.lastNotifiedAt.get(siteId);
  }

  /** Clear all tracked state. */
  clear(): void {
    this.lastStatus.clear();
    this.lastNotifiedAt.clear();
  }
}

/**
 * Check whether a health transition should trigger a notification.
 *
 * Notifications are sent when a site transitions TO `critical` or `auth_failed`
 * from any other status. Repeated observations of the same bad status do not
 * trigger new notifications (the cooldown handles that).
 */
export function shouldNotify(
  previous: SiteHealthRecord["status"] | undefined,
  current: SiteHealthRecord["status"],
): boolean {
  if (current !== "critical" && current !== "auth_failed") {
    return false;
  }
  // Notify if this is the first observation or if the status changed
  return previous !== current;
}

/**
 * Build an {@link OperatorNotification} from a site's health record.
 */
export function buildNotification(
  site: RegisteredSite,
  health: SiteHealthRecord,
  cooldownMs: number = DEFAULT_NOTIFICATION_COOLDOWN_MS,
): OperatorNotification {
  const occurredAt = health.updated_at;
  const cooldownUntil = new Date(
    Date.parse(occurredAt) + cooldownMs,
  ).toISOString();

  const summary =
    health.status === "auth_failed"
      ? `Authentication failed for site ${site.siteId}`
      : `Site ${site.siteId} is in critical state`;

  const detail = health.message;
  const suggestedAction =
    health.status === "auth_failed"
      ? `Check credentials for site ${site.siteId} and run narada status --site ${site.siteId}`
      : `Investigate site ${site.siteId} immediately. Run narada doctor --site ${site.siteId}`;

  return {
    site_id: site.siteId,
    scope_id: site.siteId,
    severity: "critical",
    health_status: health.status as "degraded" | "critical" | "auth_failed",
    summary,
    detail,
    suggested_action: suggestedAction,
    occurred_at: occurredAt,
    cooldown_until: cooldownUntil,
  };
}

/**
 * Cross-site notification router.
 *
 * On each call to `checkAndNotify()`, queries all Sites, compares their
 * health against the last known status, and emits notifications for
 * transitions to `critical` or `auth_failed`.
 */
export class CrossSiteNotificationRouter {
  private tracker = new SiteHealthTracker();

  constructor(
    private registry: SiteRegistry,
    private observationFactory: (site: RegisteredSite) => SiteObservationApi,
    private emitter: NotificationEmitter,
    private cooldownMs: number = DEFAULT_NOTIFICATION_COOLDOWN_MS,
  ) {}

  /**
   * Query all Sites and emit notifications for bad-health transitions.
   *
   * Returns the list of notifications that were emitted (not suppressed).
   */
  async checkAndNotify(): Promise<OperatorNotification[]> {
    const sites = this.registry.listSites();
    const emitted: OperatorNotification[] = [];

    for (const site of sites) {
      const api = this.observationFactory(site);
      const health = await api.getHealth();
      const previous = this.tracker.record(site.siteId, health.status);

      if (!shouldNotify(previous, health.status)) {
        continue;
      }

      // Check time-based cooldown
      const lastNotifiedAt = this.tracker.getLastNotifiedAt(site.siteId);
      const now = Date.now();
      if (
        lastNotifiedAt !== undefined &&
        now - lastNotifiedAt < this.cooldownMs
      ) {
        const cooldownUntil = new Date(
          lastNotifiedAt + this.cooldownMs,
        ).toISOString();
        console.log(
          JSON.stringify({
            event: "notification_suppressed",
            site_id: site.siteId,
            scope_id: site.siteId,
            channel: "cross_site",
            health_status: health.status,
            reason: "cooldown_active",
            cooldown_until: cooldownUntil,
          }),
        );
        continue;
      }

      const notification = buildNotification(site, health, this.cooldownMs);
      await this.emitter.emit(notification);
      this.tracker.recordNotification(site.siteId);
      emitted.push(notification);
    }

    return emitted;
  }

  /** Clear tracked health state. Used in tests. */
  reset(): void {
    this.tracker.clear();
  }
}
