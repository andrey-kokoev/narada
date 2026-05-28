import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const MCP_PAYLOAD_MAX_INLINE_BYTES = 16 * 1024;
export const MCP_OUTPUT_INLINE_LIMIT_BYTES = 8 * 1024;

export interface McpRefStoreOptions {
  siteRoot: string;
  namespace?: string;
}

export interface McpStoredRef {
  ref: string;
  path: string;
  sha256: string;
  byte_length: number;
  transient_transport_not_authority: true;
}

function storeRoot(options: McpRefStoreOptions): string {
  return resolve(options.siteRoot, '.narada', 'mcp-refs', options.namespace ?? 'narada-proper');
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, sortJson(child)]));
  }
  return value;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function refPath(options: McpRefStoreOptions, family: 'payload' | 'output', hash: string): string {
  return join(storeRoot(options), family, `${hash}.json`);
}

export function writeMcpPayloadRef(options: McpRefStoreOptions, payload: unknown): McpStoredRef {
  const text = stableJson(payload);
  const byteLength = Buffer.byteLength(text, 'utf8');
  if (byteLength > MCP_PAYLOAD_MAX_INLINE_BYTES) {
    throw new Error('mcp_payload_inline_size_limit_exceeded');
  }
  const hash = sha256(text);
  const path = refPath(options, 'payload', hash);
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8');
    if (existing !== text) throw new Error('mcp_payload_ref_immutable_revision_conflict');
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, 'utf8');
  }
  return {
    ref: `mcp_payload:${hash}`,
    path,
    sha256: hash,
    byte_length: byteLength,
    transient_transport_not_authority: true,
  };
}

export function readMcpPayloadRef(options: McpRefStoreOptions, ref: string): unknown {
  const hash = parseRef(ref, 'mcp_payload');
  const path = refPath(options, 'payload', hash);
  if (!existsSync(path)) throw new Error('mcp_payload_ref_not_found');
  const text = readFileSync(path, 'utf8');
  if (sha256(text) !== hash) throw new Error('mcp_payload_ref_hash_mismatch');
  return JSON.parse(text);
}

export function writeMcpOutputRef(options: McpRefStoreOptions, output: unknown): McpStoredRef {
  const text = stableJson(output);
  const hash = sha256(text);
  const path = refPath(options, 'output', hash);
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, 'utf8');
  }
  return {
    ref: `mcp_output:${hash}`,
    path,
    sha256: hash,
    byte_length: Buffer.byteLength(text, 'utf8'),
    transient_transport_not_authority: true,
  };
}

export function boundedMcpOutput(options: McpRefStoreOptions, output: unknown, inlineLimit = MCP_OUTPUT_INLINE_LIMIT_BYTES): {
  inline: unknown | null;
  output_ref: McpStoredRef | null;
  truncated: boolean;
  transient_transport_not_authority: true;
} {
  const text = stableJson(output);
  if (Buffer.byteLength(text, 'utf8') <= inlineLimit) {
    return {
      inline: output,
      output_ref: null,
      truncated: false,
      transient_transport_not_authority: true,
    };
  }
  return {
    inline: null,
    output_ref: writeMcpOutputRef(options, output),
    truncated: true,
    transient_transport_not_authority: true,
  };
}

export function readMcpOutputRef(options: McpRefStoreOptions, ref: string): unknown {
  const hash = parseRef(ref, 'mcp_output');
  const path = refPath(options, 'output', hash);
  if (!existsSync(path)) throw new Error('mcp_output_ref_not_found');
  const text = readFileSync(path, 'utf8');
  if (sha256(text) !== hash) throw new Error('mcp_output_ref_hash_mismatch');
  return JSON.parse(text);
}

function parseRef(ref: string, expectedFamily: 'mcp_payload' | 'mcp_output'): string {
  const [family, hash] = ref.split(':');
  if (family !== expectedFamily) throw new Error('wrong_ref_family');
  if (!/^[a-f0-9]{64}$/.test(hash ?? '')) throw new Error('invalid_ref_hash');
  return hash;
}
