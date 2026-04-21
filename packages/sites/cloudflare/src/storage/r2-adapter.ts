/**
 * R2 Trace/Evidence Storage Adapter
 *
 * Reads and writes large Trace artifacts to Cloudflare R2 with Site-scoped
 * object naming.  This is the adapter boundary between Narada Site logic and
 * the R2 object store.
 *
 * Path conventions (enforced by callers via `buildArtifactPath`):
 *   {site_id}/messages/{message_id}/record.json
 *   {site_id}/snapshots/{snapshot_id}.json
 *   {site_id}/traces/{cycle_id}/evaluation-{evaluation_id}.json
 *   {site_id}/traces/{cycle_id}/decision-{decision_id}.json
 *   {site_id}/backups/{timestamp}.tar.gz
 *
 * Failure modes:
 * - R2 unavailable → errors bubble to the caller; the Cycle runner is
 *   responsible for retry/backoff and recording failure in DO health.
 * - Key collision → prevented by deterministic key generation (cycle_id,
 *   message_id, snapshot_id are UUIDs or nanosecond timestamps).
 */

export class R2Adapter {
  constructor(private bucket: R2Bucket, private siteId: string) {}

  private prefix(key: string): string {
    return `${this.siteId}/${key}`;
  }

  /**
   * Write an object to R2.
   *
   * Accepts strings, ArrayBuffers, or ReadableStreams.  Streams are passed
   * through directly to R2 — the adapter does not buffer them in memory.
   */
  async writeObject(
    key: string,
    body: ReadableStream | ArrayBuffer | string,
    metadata?: Record<string, string>,
  ): Promise<void> {
    const fullKey = this.prefix(key);
    await this.bucket.put(fullKey, body, {
      customMetadata: metadata,
    });
  }

  /** Read an object from R2. Returns `null` if the key does not exist. */
  async readObject(key: string): Promise<{ body: ReadableStream; metadata: Record<string, string> } | null> {
    const fullKey = this.prefix(key);
    const obj = await this.bucket.get(fullKey);
    if (!obj) return null;
    return {
      body: obj.body,
      metadata: obj.customMetadata ?? {},
    };
  }

  /** Delete an object from R2. */
  async deleteObject(key: string): Promise<void> {
    const fullKey = this.prefix(key);
    await this.bucket.delete(fullKey);
  }

  /** List object keys under a Site-scoped prefix. */
  async listObjects(prefix: string): Promise<string[]> {
    const fullPrefix = this.prefix(prefix);
    const result = await this.bucket.list({ prefix: fullPrefix });
    return result.objects.map((o) => o.key);
  }
}

/**
 * Build a canonical artifact path for a given artifact type.
 *
 * This helper enforces the Site-scoped path conventions so callers do not
 * need to hand-craft key strings.
 */
export function buildArtifactPath(
  siteId: string,
  type: "message" | "snapshot" | "evaluation" | "decision" | "backup",
  ids: Record<string, string>,
): string {
  switch (type) {
    case "message":
      return `${siteId}/messages/${ids.message_id}/record.json`;
    case "snapshot":
      return `${siteId}/snapshots/${ids.snapshot_id}.json`;
    case "evaluation":
      return `${siteId}/traces/${ids.cycle_id}/evaluation-${ids.evaluation_id}.json`;
    case "decision":
      return `${siteId}/traces/${ids.cycle_id}/decision-${ids.decision_id}.json`;
    case "backup":
      return `${siteId}/backups/${ids.timestamp}.tar.gz`;
    default:
      throw new Error(`Unknown artifact type: ${type}`);
  }
}
