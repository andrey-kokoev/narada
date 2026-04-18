/**
 * Intent types for `ops-kit want workflow`.
 *
 * These capture the user voice "I want Narada to do this periodically"
 * and shape it into Narada structure.
 */

import type { PosturePreset } from "./posture.js";

/** User intent to create or update a timer-backed workflow. */
export interface WantWorkflowIntent {
  /** Workflow identifier (kebab-case recommended). */
  workflowId: string;

  /** Primary charter to bind. */
  primaryCharter?: string;

  /** Cron expression or interval string. */
  schedule: string;

  /** Safety posture preset. */
  posture?: PosturePreset;

  /** Data directory root. */
  rootDir?: string;

  /** Whether to create the directory scaffold. */
  scaffold?: boolean;

  /** Optional description. */
  description?: string;
}

/** Result of shaping a workflow intent. */
export interface ShapedWorkflow {
  /** The scope_id that will be used. */
  scopeId: string;

  /** The context_id that will be used. */
  contextId: string;

  /** Paths that will be created or touched. */
  touchedPaths: string[];

  /** Summary of the resulting configuration. */
  summary: string;

  /** Whether the target already existed. */
  existed: boolean;
}
