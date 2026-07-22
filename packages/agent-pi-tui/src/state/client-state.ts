import type { AttachPhase, PiClientLocalState, PiTheme, ProjectionClass } from '../types.js';
import { darkPiTheme } from '../theme/theme.js';
import { ScrollAuthority } from './scroll-authority.js';

export class ClientState {
  readonly scroll = new ScrollAuthority();
  private readonly local: PiClientLocalState = {
    composerDraft: '',
    composerHistory: [],
    focus: 'composer',
    currentView: 'conversation',
    theme: darkPiTheme,
    expandedRows: new Set<string>(),
    selectedRow: null,
    overlay: 'none',
    scrollMode: 'auto_follow',
    scrollOffset: 0,
    connection: 'idle',
    transportError: null,
  };

  snapshot(): PiClientLocalState {
    return { ...this.local, expandedRows: new Set(this.local.expandedRows), scrollMode: this.scroll.mode, scrollOffset: this.scroll.scrollOffset };
  }

  setConnection(connection: AttachPhase, error: string | null = null): void {
    this.local.connection = connection;
    this.local.transportError = error;
  }

  setView(view: ProjectionClass): void {
    this.local.currentView = view;
  }

  scrollBy(delta: number, totalRows: number, viewportRows: number): void {
    this.scroll.moveBy(delta, totalRows, viewportRows);
  }

  setTheme(theme: PiTheme): void {
    this.local.theme = theme;
  }

  setDraft(value: string): void {
    this.local.composerDraft = value;
  }

  addHistory(value: string): void {
    if (value.trim() && this.local.composerHistory.at(-1) !== value.trim()) this.local.composerHistory.push(value.trim());
  }

  toggleExpanded(renderKey: string): void {
    const next = new Set(this.local.expandedRows);
    if (next.has(renderKey)) next.delete(renderKey); else next.add(renderKey);
    this.local.expandedRows = next;
  }

  setOverlay(overlay: PiClientLocalState['overlay']): void {
    this.local.overlay = overlay;
    this.local.focus = overlay === 'none' ? 'composer' : 'overlay';
  }
}
