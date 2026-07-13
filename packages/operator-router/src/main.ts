import { createOperatorRouterServer } from './server.js';

function option(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write('narada-operator-router --host 127.0.0.1 --port 61729 --state-root <path>\n');
    return;
  }
  const stateRoot = option(args, '--state-root', process.env.NARADA_OPERATOR_ROUTER_STATE_ROOT ?? '');
  const server = await createOperatorRouterServer({
    host: option(args, '--host', '127.0.0.1'),
    port: Number.parseInt(option(args, '--port', '61729'), 10),
    ...(stateRoot ? { state_root: stateRoot } : {}),
  });
  await server.start();
  const stop = async (): Promise<void> => {
    await server.stop();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
