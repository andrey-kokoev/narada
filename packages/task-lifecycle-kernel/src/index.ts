type AnyRecord = Record<string, any>;

export function normalizeToolName(name: string, aliases: AnyRecord = {}): string {
  return aliases[name] ?? name;
}

export function tool(name: string, description: string, inputSchema: AnyRecord): AnyRecord {
  return { name, description, inputSchema };
}

export function objectSchema(properties: AnyRecord, required: string[] = [], options: AnyRecord = {}): AnyRecord {
  const schemaProperties = options.payloadRef === true
    ? {
      ...properties,
      payload_ref: stringSchema('Optional MCP payload ref carrying the complete argument object, e.g. mcp_payload:<id>@v1. Use this when an inline string/object would exceed the payload limit.'),
    }
    : properties;
  return {
    type: 'object',
    properties: schemaProperties,
    additionalProperties: false,
    ...(required.length > 0 ? { required } : {}),
  };
}

export function stringSchema(description: string): AnyRecord {
  return { type: 'string', description };
}

export function nullableStringSchema(description: string): AnyRecord {
  return { type: 'string', nullable: true, description };
}

export function numberSchema(description: string): AnyRecord {
  return { type: 'number', description };
}

export function enumStringSchema(values: any[], description: string): AnyRecord {
  return { type: 'string', enum: values, description };
}

export function arraySchema(items: AnyRecord, description: string): AnyRecord {
  return { type: 'array', items, description };
}

export function authorityBasisSchema(description: string): AnyRecord {
  return {
    type: 'object',
    description,
    properties: {
      kind: stringSchema('Authority kind: operator_direct_instruction, directed_obligation, or task_owner_handoff.'),
      summary: stringSchema('Concise authority basis summary.'),
    },
    required: ['kind', 'summary'],
    additionalProperties: false,
  };
}

export function validateArgs(toolName: string, args: any, schema: AnyRecord): AnyRecord[] | null {
  const errors: AnyRecord[] = [];
  validateValue('', args, schema, errors);
  return errors.length > 0 ? errors : null;
}

function validateValue(path: string, value: any, schema: AnyRecord, errors: AnyRecord[]): void {
  if (!schema || typeof schema !== 'object') return;
  const field = path || '<root>';
  const expectedType = schema.type;

  if (value === null && schema.nullable === true) return;

  if (expectedType === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push({ field, expected: 'object', received: value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value, message: `Field ${field} must be an object, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}` });
      return;
    }
    const record = value;
    const props = schema.properties ?? {};
    const required = schema.required ?? [];
    for (const key of required) {
      if (!(key in record) || record[key] === undefined || record[key] === null) {
        const childPath = path ? `${path}.${key}` : key;
        errors.push({ field: childPath, expected: props[key]?.type ?? 'any', received: 'missing', message: `Missing required field: ${childPath}` });
      }
    }
    for (const [key, childValue] of Object.entries(record)) {
      const childSchema = props[key];
      const childPath = path ? `${path}.${key}` : key;
      if (!childSchema) {
        if (schema.additionalProperties === false) {
          errors.push({ field: childPath, expected: 'none', received: Array.isArray(childValue) ? 'array' : typeof childValue, message: `Unexpected field: ${childPath}` });
        }
        continue;
      }
      validateValue(childPath, childValue, childSchema, errors);
    }
    return;
  }

  if (expectedType === 'array') {
    if (!Array.isArray(value)) {
      errors.push({ field, expected: 'array', received: typeof value, message: `Field ${field} must be an array, got ${typeof value}` });
      return;
    }
    if (schema.items) {
      value.forEach((item: any, index: number) => validateValue(`${field}[${index}]`, item, schema.items, errors));
    }
    return;
  }

  if (expectedType === 'string' && typeof value !== 'string') {
    errors.push({ field, expected: 'string', received: typeof value, message: `Field ${field} must be a string, got ${typeof value}` });
  } else if (expectedType === 'number' && (typeof value !== 'number' || Number.isNaN(value))) {
    errors.push({ field, expected: 'number', received: typeof value, message: `Field ${field} must be a number, got ${typeof value}` });
  } else if (expectedType === 'boolean' && typeof value !== 'boolean') {
    errors.push({ field, expected: 'boolean', received: typeof value, message: `Field ${field} must be a boolean, got ${typeof value}` });
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({ field, expected: `one_of:${schema.enum.join('|')}`, received: String(value), message: `Field ${field} must be one of: ${schema.enum.join(', ')}` });
  }
}

export function validationErrorResult(validationErrors: AnyRecord[] | null): AnyRecord {
  return {
    status: 'error',
    schema: 'narada.task.mcp.validation_error.v0',
    validation_errors: validationErrors,
  };
}
