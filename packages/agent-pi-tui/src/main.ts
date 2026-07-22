import { dirname, join, resolve } from 'node:path';
import { NarsAttachClient } from './nars-client/attach-client.js';
import { JsonCursorStore } from './nars-client/reconnect.js';
import { resolveSessionDiscovery } from './nars-client/session-discovery.js';
import { createPiTuiApp } from './app.js';
import { runPiTuiApp } from './pi-tui-substrate.js';

export interface MainOptions {
  WebSocketImpl?: ConstructorParameters<typeof NarsAttachClient>[0]['WebSocketImpl'];
  cursorPath?: string;
}

function optionValue(argv: readonly string[], name: string): string | null {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? null : null;
}

export function parseMainArguments(argv: readonly string[]): { attach: string | null; launchBinding: string | null; session: string | null; help: boolean } {
  return {
    attach: optionValue(argv, '--attach'),
    launchBinding: optionValue(argv, '--launch-binding'),
    session: optionValue(argv, '--session'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

export async function main(argv = process.argv.slice(2), options: MainOptions = {}): Promise<void> {
  const args = parseMainArguments(argv);
  if (args.help) {
    process.stdout.write('Usage: narada-agent-pi-tui --attach <ws://.../events> | --launch-binding <path>\n');
    return;
  }
  if (args.attach && args.launchBinding) throw new Error('choose_one_attach_source');
  if (!args.attach && !args.launchBinding) throw new Error('nars_attach_source_required');
  const discovery = args.attach
    ? resolveSessionDiscovery(args.attach)
    : resolveSessionDiscovery(args.launchBinding!);
  if (args.launchBinding && args.session && discovery.sessionId && args.session !== discovery.sessionId) {
    throw new Error('session_override_conflicts_with_launch_binding');
  }
  const sessionId = discovery.sessionId ?? args.session;
  if (!sessionId && args.launchBinding) throw new Error('launch_binding_session_id_missing');
  const cursorPath = options.cursorPath
    ?? process.env.NARADA_AGENT_PI_TUI_CURSOR_PATH
    ?? (args.launchBinding
      ? join(dirname(resolve(args.launchBinding)), '..', 'agent-pi-tui-cursors.json')
      : join(process.cwd(), '.ai', 'runtime', 'agent-pi-tui-cursors.json'));
  const client = new NarsAttachClient({
    endpoint: discovery.eventEndpoint,
    sessionId,
    WebSocketImpl: options.WebSocketImpl,
    cursorStore: new JsonCursorStore(cursorPath),
    cursorKey: `${sessionId ?? discovery.eventEndpoint}::agent-pi-tui`,
  });
  const app = createPiTuiApp({ client });
  process.once('SIGINT', () => { void app.detach(); });
  await app.attach();
  await runPiTuiApp(app);
}
