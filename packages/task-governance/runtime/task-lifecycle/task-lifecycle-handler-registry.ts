export const PAYLOAD_OUTPUT_TOOL_NAMES: any = Object.freeze([
  'mcp_payload_create',
  'mcp_payload_show',
  'mcp_output_show',
  'mcp_payload_derive',
  'mcp_payload_validate',
]);

export function createTaskLifecycleHandlerRegistry({
  toolNames,
  domainDispatch,
  payloadOutputHandlers = {},
  explicitHandlers = payloadOutputHandlers,
}: any) : any {
  const handlers: any = new Map();
  for (const name of toolNames) {
    handlers.set(name, explicitHandlers[name] ?? ((args: any, dispatchContext: any = {}) : any => domainDispatch(name, args, dispatchContext)));
  }
  return handlers;
}

export function assertTaskLifecycleHandlerCoverage({ toolNames, handlers }: any) : any {
  const missing: any = toolNames.filter((name: any) : any => !handlers.has(name));
  return {
    status: missing.length === 0 ? 'ok' : 'missing_handlers',
    tool_count: toolNames.length,
    handler_count: handlers.size,
    missing,
  };
}
