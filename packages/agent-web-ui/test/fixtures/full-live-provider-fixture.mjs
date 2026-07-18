import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const options = parseArgs(process.argv.slice(2));
const portFile = requiredOption(options, 'port-file');
const transcriptFile = requiredOption(options, 'transcript-file');
const controlFile = requiredOption(options, 'control-file');

let requestNumber = 0;
let stopping = false;

const server = createServer(async (request, response) => {
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const requestBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const latestMessage = Array.isArray(requestBody.messages) ? requestBody.messages.at(-1) : null;
    const userContent = typeof latestMessage?.content === 'string'
      ? latestMessage.content
      : JSON.stringify(latestMessage?.content ?? '');
    requestNumber += 1;
    await appendFile(transcriptFile, JSON.stringify({
      schema: 'narada.full_live.provider_request.v1',
      request_number: requestNumber,
      pid: process.pid,
      received_at: new Date().toISOString(),
      content: userContent,
      request_body: requestBody,
    }) + '\n', 'utf8');

    await waitForReleaseIfHeld();

    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      choices: [{
        message: {
          role: 'assistant',
          content: 'Full live provider response: ' + userContent,
        },
      }],
    }));
  } catch (error) {
    response.writeHead(500, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
  }
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    server.off('error', reject);
    resolve();
  });
});

const address = server.address();
if (!address || typeof address === 'string') throw new Error('full_live_provider_address_missing');
await writeFile(portFile, JSON.stringify({
  schema: 'narada.full_live.provider_ready.v1',
  base_url: 'http://127.0.0.1:' + address.port + '/',
  port: address.port,
  pid: process.pid,
}) + '\n', 'utf8');

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) throw new Error('unexpected_argument:' + arg);
    const key = arg.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error('missing_argument_value:' + arg);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function requiredOption(parsed, name) {
  if (typeof parsed[name] !== 'string' || parsed[name].length === 0) {
    throw new Error('missing_required_option:' + name);
  }
  return parsed[name];
}

async function readControl() {
  try {
    const value = JSON.parse(await readFile(controlFile, 'utf8'));
    return {
      hold: value?.hold === true,
      release: value?.release === true,
    };
  } catch {
    return { hold: false, release: true };
  }
}

async function waitForReleaseIfHeld() {
  const initial = await readControl();
  if (!initial.hold || initial.release) return;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const current = await readControl();
    if (!current.hold || current.release) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('full_live_provider_hold_timeout');
}

async function stop() {
  if (stopping) return;
  stopping = true;
  await new Promise((resolve) => server.close(resolve));
  process.exit(0);
}

process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
