declare module '@narada2/nars-session-core/event-log' {
  export function readNarsEventLog(eventsPath: string | null | undefined): {
    events: Array<Record<string, unknown>>;
    corruptLineCount: number;
  };
  export function readNarsEventLogTail(eventsPath: string | null | undefined, limit?: number): {
    events: Array<Record<string, unknown>>;
    corruptLineCount: number;
  };
}
