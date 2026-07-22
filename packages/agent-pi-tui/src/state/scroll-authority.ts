import type { ScrollAuthorityMode } from '../types.js';

export class ScrollAuthority {
  private currentMode: ScrollAuthorityMode = 'auto_follow';
  private offset = 0;

  get mode(): ScrollAuthorityMode {
    return this.currentMode;
  }

  get scrollOffset(): number {
    return this.offset;
  }

  setOperatorPosition(offset: number): void {
    this.offset = Math.max(0, Math.floor(offset));
    this.currentMode = 'operator_controlled';
  }

  followLatest(): void {
    this.offset = 0;
    this.currentMode = 'auto_follow';
  }

  forceFollowOnce(): void {
    this.currentMode = 'force_follow_once';
  }

  moveBy(delta: number, totalRows: number, viewportRows: number): void {
    const maximum = Math.max(0, Math.floor(totalRows) - Math.max(1, Math.floor(viewportRows)));
    this.offset = Math.min(maximum, Math.max(0, this.offset + Math.trunc(delta)));
    this.currentMode = this.offset === 0 ? 'auto_follow' : 'operator_controlled';
  }

  onRowsChanged(latestOffset: number): number {
    if (this.currentMode === 'auto_follow' || this.currentMode === 'force_follow_once') {
      this.offset = Math.max(0, latestOffset);
      if (this.currentMode === 'force_follow_once') this.currentMode = 'auto_follow';
    }
    return this.offset;
  }
}
