import type { AttachEventDetail, NarsAttachClient } from './nars-client/attach-client.js';
import { NarsProjectionAdapter } from './projection/projection-adapter.js';
import { TranscriptModel } from './projection/transcript-model.js';
import { buildFooterModel } from './projection/footer-model.js';
import { buildStatusModel } from './projection/status-model.js';
import { classifyOperatorInput, type LocalInputAction } from './input/operator-input.js';
import { ClientState } from './state/client-state.js';
import { ComposerHistory } from './input/composer-history.js';
import { resolveTheme } from './theme/theme.js';
import type { NarsProtocolFrame, PiTheme, ProjectionClass } from './types.js';
import { renderComposer } from './components/composer.js';
import { renderFooter } from './components/footer.js';
import { renderHelpOverlay } from './components/help-overlay.js';
import { renderStatusIndicator } from './components/status-indicator.js';
import { renderTranscript } from './components/transcript.js';
import { connectionLabel } from './state/connection-state.js';

export interface PiTuiAppOptions {
  client: NarsAttachClient;
  projection?: NarsProjectionAdapter;
  theme?: PiTheme;
  view?: ProjectionClass;
}

export class PiTuiApp {
  readonly client: NarsAttachClient;
  readonly projection: NarsProjectionAdapter;
  readonly transcript = new TranscriptModel();
  readonly state: ClientState;
  readonly history = new ComposerHistory();
  private readonly renderListeners = new Set<() => void>();
  private readonly localMessages: string[] = [];
  private readonly exitPromise: Promise<void>;
  private resolveExit!: () => void;
  private unsubscribeEvent: (() => void) | null = null;
  private unsubscribeState: (() => void) | null = null;
  private unsubscribeError: (() => void) | null = null;
  private activeTurnId: string | undefined;
  private viewportRows = 20;

  constructor(options: PiTuiAppOptions) {
    this.client = options.client;
    // Ingest the complete durable projection and let the current view decide what
    // to render.  Starting with conversation-only admission would permanently
    // discard operation/diagnostic rows before a user can switch views.
    this.projection = options.projection ?? new NarsProjectionAdapter({ verbosity: 'raw' });
    this.state = new ClientState();
    if (options.theme) this.state.setTheme(options.theme);
    if (options.view) this.state.setView(options.view);
    this.exitPromise = new Promise<void>((resolve) => { this.resolveExit = resolve; });
    this.unsubscribeEvent = this.client.onEvent((detail) => this.onEvent(detail));
    this.unsubscribeState = this.client.onState((state) => {
      this.state.setConnection(state.phase, state.lastTransportError);
      this.requestRender();
    });
    this.unsubscribeError = this.client.onTransportError(({ error }) => {
      this.state.setConnection(this.client.getState().phase, error.message);
      this.localNotice(`transport error: ${error.message}`);
      this.requestRender();
    });
  }

  async attach(): Promise<void> {
    await this.client.connect();
    this.requestRender();
  }

  async waitForExit(): Promise<void> {
    await this.exitPromise;
  }

  dispose(): void {
    this.unsubscribeEvent?.();
    this.unsubscribeState?.();
    this.unsubscribeError?.();
    this.unsubscribeEvent = null;
    this.unsubscribeState = null;
    this.unsubscribeError = null;
  }

  onRender(listener: () => void): () => void {
    this.renderListeners.add(listener);
    return () => this.renderListeners.delete(listener);
  }

  async submit(text: string): Promise<void> {
    const classification = classifyOperatorInput(text, {
      activeTurn: Boolean(this.activeTurnId),
      activeTurnId: this.activeTurnId,
      allowRawProtocol: false,
    });
    if (classification.kind === 'empty') return;
    this.state.setDraft('');
    this.history.add(text);
    this.state.addHistory(text);
    if (classification.kind === 'conversation') {
      await this.sendOperatorFrame(classification.frame, classification.content, classification.deliveryMode);
    } else if (classification.kind === 'known_slash') {
      if (classification.local) this.applyLocalAction(classification.local);
      if (classification.frame) await this.sendOperatorFrame(classification.frame);
    } else if (classification.kind === 'unknown_slash' || classification.kind === 'unavailable_shell') {
      this.applyLocalAction(classification.local);
    }
    this.requestRender();
  }

  async sendOperatorFrame(frame: NarsProtocolFrame, content?: string, deliveryMode: 'immediate' | 'admit_after_active_turn' = 'immediate'): Promise<void> {
    const result = content
      ? await this.client.sendOperatorFrame(frame, content, deliveryMode)
      : await this.client.sendFrame(frame);
    if (result.transport === 'ambiguous') this.localNotice(`transport ambiguous for ${frame.method}; no automatic resend`);
    else if (result.transport === 'not_sent') this.localNotice(`not sent: ${result.error ?? frame.method}`);
  }

  handleInput(data: string): void {
    const normalized = data.replace(/\u001b\[200~/g, '').replace(/\u001b\[201~/g, '');
    if (normalized.includes('\u0003')) {
      void this.detach();
      return;
    }
    if (normalized === '\u001b' || normalized === '\u001b\x1b') {
      this.state.setOverlay('none');
      this.state.setDraft('');
      this.requestRender();
      return;
    }
    if (normalized === '\r' || normalized === '\n') {
      void this.submit(this.state.snapshot().composerDraft);
      return;
    }
    if (normalized === '\u007f') {
      this.state.setDraft(this.state.snapshot().composerDraft.slice(0, -1));
      this.requestRender();
      return;
    }
    if (normalized === '\u001b[A') {
      this.state.setDraft(this.history.previous());
      this.requestRender();
      return;
    }
    if (normalized === '\u001b[B') {
      this.state.setDraft(this.history.next());
      this.requestRender();
      return;
    }
    if (normalized === '\u001b[5~' || normalized === '\u001b[1;5A') {
      this.state.scrollBy(-Math.max(1, this.viewportRows - 4), this.transcript.rows(this.state.snapshot().currentView).length, this.transcriptViewportRows());
      this.requestRender();
      return;
    }
    if (normalized === '\u001b[6~' || normalized === '\u001b[1;5B') {
      this.state.scrollBy(Math.max(1, this.viewportRows - 4), this.transcript.rows(this.state.snapshot().currentView).length, this.transcriptViewportRows());
      this.requestRender();
      return;
    }
    if (normalized === '\u000f') {
      this.state.setView('operations');
      this.requestRender();
      return;
    }
    if (normalized === '\u0004') {
      this.state.setView('diagnostics');
      this.requestRender();
      return;
    }
    if (normalized === '\u000c') {
      this.state.scroll.forceFollowOnce();
      this.requestRender();
      return;
    }
    if (normalized.startsWith('\u001b') || normalized.includes('\u0000')) return;
    this.state.setDraft(`${this.state.snapshot().composerDraft}${normalized}`);
    this.requestRender();
  }

  renderLines(width: number, includeComposer = true): string[] {
    const snapshot = this.state.snapshot();
    const allRows = this.transcript.rows(snapshot.currentView);
    const transcriptRows = this.transcriptViewportRows();
    const latestOffset = Math.max(0, allRows.length - transcriptRows);
    const offset = this.state.scroll.onRowsChanged(latestOffset);
    const end = Math.max(0, allRows.length - offset);
    const rows = allRows.slice(Math.max(0, end - transcriptRows), end);
    const status = buildStatusModel(this.transcript.allRows(), this.client.getState());
    const footer = buildFooterModel(status, snapshot.currentView, this.client.getPendingInputs().filter((entry) => !['completed', 'durable_rejected'].includes(entry.phase)).length);
    const lines = [
      renderStatusIndicator(status, width, snapshot.theme),
      ...this.localMessages.slice(-2).map((message) => `${snapshot.theme.warning}${message}\u001b[0m`),
      ...renderTranscript(rows, width, snapshot.theme, snapshot.expandedRows),
    ];
    if (snapshot.overlay === 'help') lines.push(...renderHelpOverlay(width, snapshot.theme));
    if (includeComposer) lines.push(renderComposer(snapshot.composerDraft, width, snapshot.theme));
    lines.push(renderFooter(footer, width, snapshot.theme));
    return lines.map((line) => line.length > width + 80 ? line.slice(0, width + 80) : line);
  }

  async detach(): Promise<void> {
    await this.client.disconnect();
    this.resolveExit();
    this.requestRender();
  }

  private onEvent(detail: AttachEventDetail): void {
    const event = detail.event;
    if (event.turn_id) this.activeTurnId = event.turn_id;
    if (event.event === 'turn_complete' || event.event === 'turn_failed' || event.event === 'carrier_turn_completed' || event.event === 'carrier_turn_failed') this.activeTurnId = undefined;
    const row = this.projection.project(event);
    if (row) this.transcript.ingest(row);
    if (event.event === 'session_closed') {
      void this.client.disconnect();
      this.resolveExit();
    }
    this.requestRender();
  }

  setViewportRows(rows: number): void {
    if (Number.isFinite(rows) && rows > 0) this.viewportRows = Math.max(4, Math.floor(rows));
  }

  private transcriptViewportRows(): number {
    return Math.max(1, this.viewportRows - 4);
  }

  private applyLocalAction(action: LocalInputAction): void {
    switch (action.kind) {
      case 'help': this.state.setOverlay('help'); break;
      case 'clear': this.transcript.clear(); this.localMessages.length = 0; break;
      case 'view': this.state.setView(action.view); break;
      case 'latest': this.state.scroll.forceFollowOnce(); break;
      case 'theme': this.state.setTheme(resolveTheme(action.name)); break;
      case 'validation': this.localNotice(action.message); break;
    }
  }

  private localNotice(message: string): void {
    this.localMessages.push(message);
    if (this.localMessages.length > 20) this.localMessages.shift();
  }

  private requestRender(): void {
    for (const listener of this.renderListeners) listener();
  }
}

export function createPiTuiApp(options: PiTuiAppOptions): PiTuiApp {
  return new PiTuiApp(options);
}

export function appConnectionLabel(app: PiTuiApp): string {
  return connectionLabel(app.client.getState().phase);
}
