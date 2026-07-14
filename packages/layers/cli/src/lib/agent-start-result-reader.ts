import {
  assertAgentStartResultV0,
  type AgentStartResultV0,
} from '@narada2/agent-start/launch-result-v0-contract';

export class AgentStartArtifactError extends Error {
  readonly code = 'agent_start_result_contract_invalid' as const;
  readonly artifact_path: string | null;
  readonly reason_code: string;

  constructor(reasonCode: string, detail: string, artifactPath?: string) {
    super(`${reasonCode}${artifactPath ? `: ${artifactPath}` : ''}: ${detail}`);
    this.name = 'AgentStartArtifactError';
    this.artifact_path = artifactPath ?? null;
    this.reason_code = reasonCode;
  }
}

export function parseAgentStartResultArtifact(value: unknown, artifactPath?: string): AgentStartResultV0 {
  try {
    return assertAgentStartResultV0(value);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new AgentStartArtifactError('agent_start_result_contract_invalid', detail, artifactPath);
  }
}

export function parseAgentStartResultText(text: string, artifactPath?: string): AgentStartResultV0 {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new AgentStartArtifactError('json_artifact_invalid', detail, artifactPath);
  }
  return parseAgentStartResultArtifact(value, artifactPath);
}

export function tryParseAgentStartResultArtifact(value: unknown, artifactPath?: string): {
  record: AgentStartResultV0 | null;
  error: AgentStartArtifactError | null;
} {
  try {
    return { record: parseAgentStartResultArtifact(value, artifactPath), error: null };
  } catch (error) {
    const artifactError = error instanceof AgentStartArtifactError
      ? error
      : new AgentStartArtifactError('agent_start_result_contract_invalid', String(error), artifactPath);
    return { record: null, error: artifactError };
  }
}
