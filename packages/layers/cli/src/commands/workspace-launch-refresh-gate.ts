export function createWorkspaceLaunchRefreshGate<T>(minIntervalMs: number) {
  let inFlight: Promise<T> | null = null;
  let lastStartedAt = 0;

  return {
    run(task: () => Promise<T>, fallback: () => T): Promise<T> {
      if (inFlight) return inFlight;
      const now = Date.now();
      if (now - lastStartedAt < minIntervalMs) return Promise.resolve(fallback());
      lastStartedAt = now;
      const current = task();
      inFlight = current;
      const clear = (): void => {
        if (inFlight === current) inFlight = null;
      };
      current.then(clear, clear);
      return current;
    },
  };
}
