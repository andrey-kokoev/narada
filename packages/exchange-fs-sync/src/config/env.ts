function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export interface GraphEnvConfig {
  access_token?: string;
  tenant_id?: string;
  client_id?: string;
  client_secret?: string;
}

export function loadGraphEnv(): GraphEnvConfig {
  return {
    access_token: readEnv("GRAPH_ACCESS_TOKEN"),
    tenant_id: readEnv("GRAPH_TENANT_ID"),
    client_id: readEnv("GRAPH_CLIENT_ID"),
    client_secret: readEnv("GRAPH_CLIENT_SECRET"),
  };
}

export function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing env ${name}`);
  }
  return value;
}

export interface CharterEnvConfig {
  openai_api_key?: string;
}

export function loadCharterEnv(): CharterEnvConfig {
  return {
    openai_api_key: readEnv("NARADA_OPENAI_API_KEY") ?? readEnv("OPENAI_API_KEY"),
  };
}