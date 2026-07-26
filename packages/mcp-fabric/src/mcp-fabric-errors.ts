export class McpFabricError extends Error {
  code: string;
  details: any;
  constructor(code: string, message: string, details: any = {}) {
    super(message);
    this.name = 'McpFabricError';
    this.code = code;
    this.details = details;
  }
}

