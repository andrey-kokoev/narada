export function createCancellationAdapter() {
  let controller = null;
  let requested = false;
  return Object.freeze({
    begin() {
      controller = new AbortController();
      requested = false;
      return controller;
    },
    request(reason = 'cancel_requested') {
      requested = true;
      controller?.abort(reason);
      return { requested: true, signal_aborted: Boolean(controller?.signal.aborted), reason };
    },
    currentSignal() { return controller?.signal ?? null; },
    requested: () => requested,
    clear() { controller = null; requested = false; },
  });
}

