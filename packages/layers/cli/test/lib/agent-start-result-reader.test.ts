import { describe, expect, it } from 'vitest';
import {
  AgentStartArtifactError,
  parseAgentStartResultArtifact,
  parseAgentStartResultText,
  tryParseAgentStartResultArtifact,
} from '../../src/lib/agent-start-result-reader.js';

const materializedResult = {
  schema: 'narada.agent_start.result.v0',
  status: 'materialized',
  handoff: { session_ref: { id: 'runtime_reader_test', kind: 'runtime' } },
  nars_launch: { runtime_session_id: 'runtime_reader_test' },
};

describe('agent-start result reader', () => {
  it('parses canonical artifacts through one entrypoint', () => {
    expect(parseAgentStartResultArtifact(materializedResult, 'result.json')).toEqual(materializedResult);
    expect(parseAgentStartResultText(JSON.stringify(materializedResult), 'result.json')).toEqual(materializedResult);
  });

  it('rejects legacy materialized artifacts with a path-qualified contract error', () => {
    expect(() => parseAgentStartResultArtifact({
      schema: 'narada.agent_start.result.v0',
      status: 'materialized',
      carrier_session: { carrier_session_id: 'legacy_reader_test' },
    }, 'legacy.result.json')).toThrow(/legacy\.result\.json/);
  });

  it('returns an explicit parse error without hiding invalid artifacts', () => {
    const attempt = tryParseAgentStartResultArtifact({ schema: 'narada.agent_start.result.v1' }, 'invalid.result.json');
    expect(attempt.record).toBeNull();
    expect(attempt.error).toBeInstanceOf(AgentStartArtifactError);
    expect(attempt.error?.artifact_path).toBe('invalid.result.json');
    expect(attempt.error?.reason_code).toBe('agent_start_result_contract_invalid');
  });
});
