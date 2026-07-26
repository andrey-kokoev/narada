import { readFileSync } from 'node:fs';

export interface McpJsonRpcContract {
  schema: 'narada.mcp.json_rpc_contract.v1';
  jsonrpc_version: '2.0';
  methods: {
    initialize: 'initialize';
    initialized_notification: 'notifications/initialized';
    tools_list: 'tools/list';
    tools_call: 'tools/call';
  };
}

export function loadMcpJsonRpcContract(
  url: URL = new URL('../contracts/json-rpc.json', import.meta.url),
): Readonly<McpJsonRpcContract> {
  return Object.freeze(JSON.parse(readFileSync(url, 'utf-8')) as McpJsonRpcContract);
}
