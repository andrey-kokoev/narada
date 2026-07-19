// Worker-safe canonical OpenAI-compatible chat-completions request shape.
// Pure module: no node builtins, no process.env, no mutable module context.
// Local NARS (nars-provider-runtime) and the Cloudflare provider executor both
// build provider requests through this module so there is one wire vocabulary.

export function reasoningEffort(thinking) {
  if (thinking === 'none') return null;
  if (thinking === 'low') return 'low';
  if (thinking === 'high') return 'high';
  return 'medium';
}

export function isKimiProvider(provider) {
  return provider === 'kimi-api' || provider === 'kimi-code-api';
}

export function normalizeKimiJsonSchema(schema) {
  if (Array.isArray(schema)) return schema.map((item) => normalizeKimiJsonSchema(item));
  if (!schema || typeof schema !== 'object') return schema;
  const normalized = Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, normalizeKimiJsonSchema(value)]));
  if (Array.isArray(normalized.anyOf) && normalized.type !== undefined) {
    const parentType = normalized.type;
    delete normalized.type;
    normalized.anyOf = normalized.anyOf.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item) || item.type !== undefined) return item;
      return { type: parentType, ...item };
    });
  }
  return normalized;
}

export function flattenKimiRootAnyOf(schema) {
  const properties = { ...(schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties) ? schema.properties : {}) };
  for (const branch of schema.anyOf) {
    if (!branch || typeof branch !== 'object' || Array.isArray(branch)) continue;
    if (branch.properties && typeof branch.properties === 'object' && !Array.isArray(branch.properties)) Object.assign(properties, branch.properties);
  }
  const { anyOf, oneOf, allOf, type, required, ...rest } = schema;
  return {
    ...rest,
    type: 'object',
    properties,
  };
}

export function normalizeKimiToolParameters(schema) {
  const normalized = normalizeKimiJsonSchema(schema);
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) return { type: 'object', properties: {} };
  if (Array.isArray(normalized.anyOf)) return flattenKimiRootAnyOf(normalized);
  return { ...normalized, type: 'object' };
}

export function normalizeOpenAiCompatibleTools(tools = [], { provider } = {}) {
  if (!Array.isArray(tools) || tools.length === 0) return [];
  if (!isKimiProvider(provider)) return tools;
  return tools.map((tool) => {
    const fn = tool?.function;
    if (!fn || typeof fn !== 'object') return tool;
    return {
      ...tool,
      function: {
        ...fn,
        parameters: normalizeKimiToolParameters(fn.parameters ?? { type: 'object', properties: {} }),
      },
    };
  });
}

export function cleanOpenAiMessages(messages, { provider } = {}) {
  return messages.map((m) => {
    const clean = { role: m.role };
    if (m.role === 'tool') {
      clean.content = m.content ?? '';
      clean.tool_call_id = m.tool_call_id ?? '';
    } else if (m.role === 'assistant') {
      clean.content = m.content ?? null;
      if (m.tool_calls && m.tool_calls.length > 0) {
        clean.tool_calls = m.tool_calls;
        if (isKimiProvider(provider) || provider === 'deepseek-api') {
          clean.reasoning_content = m.reasoning_content ?? '';
        }
      }
    } else {
      clean.content = m.content ?? '';
    }
    return clean;
  });
}

export function buildOpenAiChatRequest(messages, tools, options = {}) {
  const { baseUrl, model, apiKey, thinking, provider, openrouterSiteUrl, openrouterTitle } = options;
  const requestTools = normalizeOpenAiCompatibleTools(tools, { provider });
  const body = {
    model,
    messages: cleanOpenAiMessages(messages, { provider }),
    tools: requestTools.length > 0 ? requestTools : undefined,
    tool_choice: requestTools.length > 0 ? 'auto' : undefined,
    temperature: isKimiProvider(provider) ? 1 : 0.2,
  };
  const effort = reasoningEffort(thinking);
  if (effort && provider === 'openai-api') body.reasoning_effort = effort;
  if (provider === 'deepseek-api') {
    body.thinking = { type: thinking === 'none' ? 'disabled' : 'enabled' };
    if (thinking !== 'none') {
      body.reasoning_effort = thinking === 'xhigh' ? 'max' : 'high';
    }
  }
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };
  if (provider === 'kimi-code-api') {
    headers['User-Agent'] = 'KimiCLI/1.0';
  }
  if (provider === 'openrouter-api') {
    if (openrouterSiteUrl) headers['HTTP-Referer'] = String(openrouterSiteUrl);
    if (openrouterTitle) headers['X-Title'] = String(openrouterTitle);
    body.metadata = {
      ...(body.metadata ?? {}),
      narada_provider: 'openrouter-api',
      narada_model: model,
    };
  }
  return {
    url: new URL('v1/chat/completions', baseUrl),
    body,
    headers,
  };
}

// Normalize an OpenAI-compatible chat-completions response body into the
// Narada provider-turn reply record ({ content, tool_calls }). Tool call
// arguments arrive as a JSON string and are parsed leniently.
export function extractOpenAiChatReply(body) {
  const root = body && typeof body === 'object' ? body : {};
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const message = choices[0] && typeof choices[0] === 'object' ? choices[0].message : null;
  const record = message && typeof message === 'object' ? message : {};
  const toolCallsRaw = Array.isArray(record.tool_calls) ? record.tool_calls : [];
  const tool_calls = toolCallsRaw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const fn = entry.function && typeof entry.function === 'object' ? entry.function : {};
    const toolName = typeof fn.name === 'string' && fn.name.trim() ? fn.name.trim() : null;
    if (!toolName) return [];
    let args = {};
    if (typeof fn.arguments === 'string' && fn.arguments.trim()) {
      try { const parsed = JSON.parse(fn.arguments); if (parsed && typeof parsed === 'object') args = parsed; } catch { args = {}; }
    } else if (fn.arguments && typeof fn.arguments === 'object') {
      args = fn.arguments;
    }
    return [{ tool_name: toolName, arguments: args }];
  });
  const content = typeof record.content === 'string'
    ? record.content
    : typeof root.output_text === 'string'
      ? root.output_text
      : '';
  return { content, tool_calls, raw: body };
}
