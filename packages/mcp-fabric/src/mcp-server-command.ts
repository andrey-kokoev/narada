const NODE_COMMAND_PATTERN = /^(?:node|node\.exe|node\.cmd)$/i;
const NODE_EXECUTABLE_PATH_PATTERN = /[\\/]node\.exe$/i;

export function normalizedMcpNodeCommand(command: unknown): string | null {
  const value = String(command ?? '').trim();
  if (!NODE_COMMAND_PATTERN.test(value) && !NODE_EXECUTABLE_PATH_PATTERN.test(value)) return null;
  return (process.versions as { bun?: string }).bun ? 'node' : process.execPath;
}
