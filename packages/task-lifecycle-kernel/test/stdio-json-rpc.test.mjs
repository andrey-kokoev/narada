import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { drainJsonRpcFrames, runJsonRpcStdioServer } from '../src/stdio-json-rpc.mjs';

const request = { jsonrpc: '2.0', id: 1, method: 'ping', params: {} };
const body = JSON.stringify(request);
const framed = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
assert.deepEqual(drainJsonRpcFrames(framed), { requests: [request], remaining: '' });

let output = '';
const stdin = Readable.from([`${body}\n`]);
const stdout = new Writable({
  write(chunk, _encoding, callback) {
    output += chunk.toString();
    callback();
  },
});

await runJsonRpcStdioServer({
  stdin,
  stdout,
  parseJsonRpcInput: (input) => input.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)),
  handleRequest: async (item) => ({ jsonrpc: '2.0', id: item.id, result: { ok: true } }),
});

assert.deepEqual(JSON.parse(output.trim()), { jsonrpc: '2.0', id: 1, result: { ok: true } });

console.log('task lifecycle stdio JSON-RPC kernel tests passed');
