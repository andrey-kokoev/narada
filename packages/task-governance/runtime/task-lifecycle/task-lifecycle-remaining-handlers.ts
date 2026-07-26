export function createTaskLifecycleRemainingHandlers() : any {
  return async function dispatchRemainingDomainTool(canonicalName: any) : Promise<any> {
    throw new Error(`task_mcp_refused: ${canonicalName}`);
  };
}
