import { appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const logPath = process.env.PI_RPC_FIXTURE_AMBIENT_LOG ?? process.argv[2] ?? null;
const version = 'pi-ambient-isolation-1.0.0';

function log(record) {
  if (logPath) appendFileSync(logPath, `${JSON.stringify(record)}\n`);
}

function send(record) {
  process.stdout.write(`${JSON.stringify(record)}\n`);
}

function latestUser(params) {
  const messages = Array.isArray(params?.messages) ? params.messages : [];
  const message = [...messages].reverse().find((entry) => entry?.role === 'user');
  return typeof message?.content === 'string' ? message.content : '';
}

function respond(id, content) {
  send({
    id,
    result: {
      admission: 'acknowledged',
      transportSubmitted: true,
      response: { choices: [{ message: { role: 'assistant', content } }] },
    },
  });
}

process.stdin.setEncoding('utf8');
let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const newline = buffer.indexOf('\n');
    if (newline < 0) break;
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const request = JSON.parse(line);
    if (request.method === 'start') {
      log({
        type: 'startup',
        cwd: process.cwd(),
        ambient_extensions: process.env.NARADA_PI_AMBIENT_EXTENSIONS ?? null,
        native_tools: process.env.NARADA_PI_NATIVE_TOOLS ?? null,
        session_storage: process.env.NARADA_PI_SESSION_STORAGE ?? null,
        site_root: process.env.NARADA_SITE_ROOT ?? null,
        workspace_root: process.env.NARADA_WORKSPACE_ROOT ?? null,
        intelligence_context_path: process.env.NARADA_INTELLIGENCE_CONTEXT_PATH ?? null,
        intelligence_registry_db: process.env.NARADA_INTELLIGENCE_REGISTRY_DB ?? null,
        narada_api_key: process.env.NARADA_AI_API_KEY ?? null,
        kimi_api_key: process.env.KIMI_CODE_API_KEY ?? null,
        openai_api_key: process.env.OPENAI_API_KEY ?? null,
        pi_home: process.env.PI_HOME ?? null,
        pi_config: process.env.PI_CONFIG ?? null,
        pi_profile: process.env.PI_PROFILE ?? null,
        relative_decoy_exists: existsSync(join(process.cwd(), '.pi', 'skills', 'ambient-decoy.mjs')),
      });
      send({
        id: request.id,
        result: {
          negotiation: {
            pi_version: version,
            mode: 'rpc',
            capabilities: ['provider-cognition', 'tool-proxy-visibility', 'cancellation'],
            supported_event_kinds: ['assistant_token', 'tool_call', 'tool_result', 'turn_complete'],
          },
        },
      });
      continue;
    }
    if (request.method === 'turn') {
      const prompt = latestUser(request.params);
      log({ type: 'turn', prompt, cwd: process.cwd() });
      respond(request.id, `PI_AMBIENT_ISOLATION_${prompt}`);
      continue;
    }
    respond(request.id, 'PI_AMBIENT_DEFAULT');
  }
});
