export interface SessionTransport {
  readonly activeTurnId: string | boolean | null;
  readonly lastSequence: number | null;
  getSocket(): WebSocket | null;
  sendFrame(frame: unknown): boolean;
  readEventsPage(options: { beforeSequence?: number; afterSequence?: number; direction?: 'forward' | 'backward'; limit?: number }): boolean;
  close(): void;
}
