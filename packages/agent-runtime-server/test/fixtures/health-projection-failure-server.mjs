import { startHealthProjection } from '../../src/server-wrapper.mjs';

const transitions = [];
const projection = await startHealthProjection({
  childStdin: { writable: false },
  host: '127.0.0.1',
  port: 0,
  runtimeContext: { session: 'health-projection-failure-fixture' },
  sessionSupervisor: {
    async health() {
      throw new Error('fixture_health_transport_failure');
    },
  },
  onRequestTransition: (transition) => transitions.push(transition),
});

try {
  const response = await fetch(projection.url);
  const body = await response.json();
  process.stdout.write(`${JSON.stringify({ body, transitions })}\n`);
} finally {
  await new Promise((resolve) => projection.server.close(resolve));
}
