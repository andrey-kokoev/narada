/**
 * Projection Rebuild Operator Family
 *
 * Narada defines projection rebuild as an explicit member of the re-derivation
 * operator family (SEMANTICS.md §2.8). This module provides the canonical
 * surface for registering and invoking rebuildable projections.
 *
 * Coherence rules:
 * - May mutate non-authoritative derived stores
 * - Must not mutate canonical durable truth
 * - Must not create new work or external effects
 */

export interface ProjectionRebuildSurface {
  /** Human-readable projection name */
  readonly name: string;
  /** Description of the authoritative durable input for this projection */
  readonly authoritativeInput: string;
  /** Rebuild the projection from its authoritative input */
  rebuild(): Promise<void>;
}

export interface ProjectionRebuildResult {
  name: string;
  success: boolean;
  durationMs: number;
  error?: string;
}

export class ProjectionRebuildRegistry {
  private surfaces: ProjectionRebuildSurface[] = [];

  register(surface: ProjectionRebuildSurface): void {
    this.surfaces.push(surface);
  }

  /**
   * Rebuild all registered projections sequentially.
   * Failures are captured per-projection; one failure does not abort others.
   */
  async rebuildAll(): Promise<ProjectionRebuildResult[]> {
    const results: ProjectionRebuildResult[] = [];
    for (const surface of this.surfaces) {
      const start = Date.now();
      try {
        await surface.rebuild();
        results.push({ name: surface.name, success: true, durationMs: Date.now() - start });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        results.push({ name: surface.name, success: false, durationMs: Date.now() - start, error: msg });
      }
    }
    return results;
  }

  list(): ReadonlyArray<ProjectionRebuildSurface> {
    return this.surfaces;
  }
}
