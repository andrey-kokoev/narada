/**
 * Progress reporting types for long-running operations
 */

export type SyncPhase = 
  | 'setup'      
  | 'fetch'      // Fetching from Graph API
  | 'process'    // Applying events
  | 'commit'     // Committing cursor
  | 'cleanup';   // Cleanup/rebuild views

export interface ProgressEvent {
  phase: SyncPhase;
  current: number;
  total: number;
  message?: string;
}

export type ProgressCallback = (event: ProgressEvent) => void;

export interface ProgressTracker {
  onProgress(callback: ProgressCallback): void;
  report(event: ProgressEvent): void;
}
