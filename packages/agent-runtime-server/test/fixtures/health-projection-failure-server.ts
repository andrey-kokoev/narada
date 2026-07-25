import { startHealthProjection } from '../../src/server-wrapper.js';

const transitions: any = [];
const projection: any = await startHealthProjection({
  childStdin: { writable: false },
  host: '127.0.0.1',
  port: 0,
  runtimeContext: { session: 'health-projection-failure-fixture' },
  sessionSupervisor: {
    async health() {
      throw new Error('fixture_health_transport_failure');
    },
  },
  onRequestTransition: (transition: any) => transitions.push(transition),
});

try {
  const response: any = await fetch(projection.url);
  const body: any = await response.json();
  process.stdout.write(`${JSON.stringify({ body, transitions })}\n`);
} finally {
  await new Promise((resolve: any) => projection.server.close(resolve));
}
