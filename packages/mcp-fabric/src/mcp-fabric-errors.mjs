export class McpFabricError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'McpFabricError';
    this.code = code;
    this.details = details;
  }
}

