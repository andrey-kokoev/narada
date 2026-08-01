import { ref, watch, type Ref } from 'vue';
import type { SessionIdentitySummary } from './useNarsEvents';
import type { RuntimeTopologySummary } from './useRuntimeTopology';

export interface RuntimeTopologyFaultSnapshot {
  severity: 'recoverable' | 'fatal';
  previousStatus: RuntimeTopologySummary['status'];
  currentStatus: RuntimeTopologySummary['status'];
  topology: RuntimeTopologySummary;
  stream: {
    live: boolean;
    text: string;
  };
  health: {
    text: string;
    body: Record<string, unknown> | null;
  };
  sessionIdentity: SessionIdentitySummary;
  activeTurnId: string | boolean | null;
}

export interface RuntimeTopologyFailFastOptions {
  topology: Readonly<Ref<RuntimeTopologySummary>>;
  streamText: Readonly<Ref<string>>;
  streamLive: Readonly<Ref<boolean>>;
  healthText: Readonly<Ref<string>>;
  healthBody: Readonly<Ref<Record<string, unknown> | null>>;
  sessionIdentity: Readonly<Ref<SessionIdentitySummary>>;
  activeTurnId: Readonly<Ref<string | boolean | null>>;
  stop: () => void;
  onFault?: (snapshot: RuntimeTopologyFaultSnapshot) => void;
  errorSink?: (error: Error, snapshot: RuntimeTopologyFaultSnapshot) => void;
}

export function useRuntimeTopologyFailFast(options: RuntimeTopologyFailFastOptions) {
  const fault = ref<RuntimeTopologyFaultSnapshot | null>(null);
  let previousStatus = options.topology.value.status;
  let armed = previousStatus === 'live';
  let stopped = false;
  let lastReportedStatus: RuntimeTopologySummary['status'] | null = null;

  const stopWatch = watch(options.topology, (topology) => {
    if (stopped) return;

    const previous = previousStatus;
    previousStatus = topology.status;
    if (topology.status === 'live') {
      armed = true;
      lastReportedStatus = null;
      fault.value = null;
      return;
    }
    if (!armed || !isReportableStatus(topology.status) || topology.status === lastReportedStatus) return;

    lastReportedStatus = topology.status;

    const snapshot: RuntimeTopologyFaultSnapshot = {
      severity: isFatalStatus(topology.status) ? 'fatal' : 'recoverable',
      previousStatus: previous,
      currentStatus: topology.status,
      topology,
      stream: {
        live: options.streamLive.value,
        text: options.streamText.value,
      },
      health: {
        text: options.healthText.value,
        body: options.healthBody.value,
      },
      sessionIdentity: options.sessionIdentity.value,
      activeTurnId: options.activeTurnId.value,
    };
    const error = new Error(`agent_web_ui_runtime_topology_fault:${topology.status}`);

    fault.value = snapshot;
    if (snapshot.severity === 'fatal') {
      stopped = true;
      options.stop();
    }
    options.onFault?.(snapshot);
    (options.errorSink ?? defaultRuntimeTopologyErrorSink)(error, snapshot);
  });

  function stop() {
    if (stopped) return;
    stopped = true;
    stopWatch();
  }

  return { fault, stop };
}

function isReportableStatus(status: RuntimeTopologySummary['status']): boolean {
  return status === 'degraded' || status === 'stale' || status === 'unavailable';
}

function isFatalStatus(status: RuntimeTopologySummary['status']): boolean {
  return status === 'stale';
}

function defaultRuntimeTopologyErrorSink(error: Error, snapshot: RuntimeTopologyFaultSnapshot) {
  const log = snapshot.severity === 'fatal' ? console.error : console.warn;
  log(
    `[Narada Agent Web UI] ${snapshot.severity} runtime topology transition`,
    { error, snapshot },
    JSON.stringify({
      error: { name: error.name, message: error.message },
      snapshot,
    }),
  );
}
