/**
 * Progress bar display for CLI
 */

import { MultiBar, SingleBar, Presets } from 'cli-progress';
import type { ProgressEvent, SyncPhase } from 'exchange-fs-sync';

interface BarState {
  phase: SyncPhase;
  bar: SingleBar;
}

export class ProgressDisplay {
  private multiBar: MultiBar | null = null;
  private currentBars: Map<SyncPhase, SingleBar> = new Map();
  private enabled: boolean;

  constructor(enabled: boolean = true) {
    this.enabled = enabled && process.stdout.isTTY;
  }

  start(): void {
    if (!this.enabled) return;
    
    this.multiBar = new MultiBar({
      clearOnComplete: true,
      hideCursor: true,
      format: '{phase} |{bar}| {percentage}% | {value}/{total} {message}',
      barsize: 30,
    }, Presets.shades_classic);
  }

  update(event: ProgressEvent): void {
    if (!this.enabled || !this.multiBar) return;

    const { phase, current, total, message } = event;
    
    // Get or create bar for this phase
    let bar = this.currentBars.get(phase);
    
    if (!bar) {
      // Complete previous phases
      for (const [p, b] of this.currentBars) {
        if (p !== phase) {
          b.stop();
        }
      }
      
      bar = this.multiBar.create(total, current, {
        phase: this.formatPhase(phase),
        message: message || '',
      });
      this.currentBars.set(phase, bar);
    } else {
      bar.update(current, { message: message || '' });
      
      // If complete, stop this bar
      if (current >= total && phase !== 'process') {
        bar.stop();
        this.currentBars.delete(phase);
      }
    }
  }

  stop(): void {
    if (!this.enabled || !this.multiBar) return;
    
    // Stop all bars
    for (const bar of this.currentBars.values()) {
      bar.stop();
    }
    this.currentBars.clear();
    
    this.multiBar.stop();
    this.multiBar = null;
  }

  private formatPhase(phase: SyncPhase): string {
    const labels: Record<SyncPhase, string> = {
      setup: 'Setup     ',
      fetch: 'Fetch     ',
      process: 'Process   ',
      commit: 'Commit    ',
      cleanup: 'Cleanup   ',
    };
    return labels[phase] || phase;
  }
}

// Simple progress tracker for non-TTY fallback
export class SimpleProgress {
  private lastMessage: string = '';
  private enabled: boolean;

  constructor(enabled: boolean = true) {
    this.enabled = enabled && !process.stdout.isTTY;
  }

  update(event: ProgressEvent): void {
    if (!this.enabled) return;
    
    const { phase, current, total, message } = event;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    const msg = `[${phase}] ${current}/${total} (${percent}%) ${message || ''}`;
    
    // Only log every 10% or on phase change to avoid spam
    if (msg !== this.lastMessage && (percent % 10 === 0 || phase !== this.lastPhase)) {
      console.error(msg);
      this.lastMessage = msg;
    }
  }
  
  private lastPhase: string = '';
}
