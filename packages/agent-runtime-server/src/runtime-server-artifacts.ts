import {
  publicNarsArtifactRecord,
  readNarsArtifact,
  readNarsArtifactContent,
  readNarsArtifactIndex,
} from '@narada2/nars-session-core/artifacts';

function sendJsonResponse(response: any, statusCode: any, payload: any) {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(`${JSON.stringify(payload)}\n`);
}

async function readRequestJson(request: any) {
  let body: any = '';
  for await (const chunk of request) body += String(chunk);
  if (!body.trim()) return {};
  return JSON.parse(body);
}

function artifactHttpError(response: any, error: any) {
  const message: any = error instanceof Error ? error.message : String(error ?? '');
  const code: any = error?.code ?? 'artifact_error';
  const status: any = code === 'artifact_not_found' || code === 'artifact_content_missing'
    ? 404
    : code === 'session_core_unavailable'
      ? 503
      : code === 'artifact_path_outside_admitted_roots'
        ? 403
        : code === 'invalid_nars_artifact_lifecycle_transition'
          ? 409
          : 400;
  sendJsonResponse(response, status, { schema: 'narada.nars.artifact_error.v1', error: code, message, details: error?.details ?? null });
}

function requireSessionCore(runtimeContext: any, method: any) {
  const sessionCore: any = runtimeContext?.sessionCore;
  if (!sessionCore || typeof sessionCore[method] !== 'function') {
    const error: any = new Error(`session_core_unavailable:${method}`);
    error.code = 'session_core_unavailable';
    throw error;
  }
  return sessionCore;
}

export async function handleArtifactHttpRequest({ request, response, runtimeContext }: any) {
  const url: any = new URL(request.url ?? '/', 'http://127.0.0.1');
  const match: any = url.pathname.match(/^\/sessions\/([^/]+)\/artifacts(?:\/([^/]+)(?:\/(content|message))?)?$/);
  if (!match) return false;
  const content: any = match[3] === 'content';
  const message: any = match[3] === 'message';
  try {
    const sessionId: any = decodeURIComponent(match[1]);
    const artifactId: any = match[2] ? decodeURIComponent(match[2]) : null;
    if (sessionId !== runtimeContext.session) {
      sendJsonResponse(response, 404, { schema: 'narada.nars.artifact_error.v1', error: 'session_not_found', message: 'Artifact session does not match this NARS runtime.' });
      return true;
    }
    if (request.method === 'PATCH' && artifactId && !content && !message) {
      const params: any = await readRequestJson(request);
      const nextState: any = params.lifecycle_state ?? params.state;
      const transition: any = requireSessionCore(runtimeContext, 'transitionArtifact').transitionArtifact(artifactId, nextState, {
        reason: params.reason,
        requested_by: params.requested_by,
      });
      sendJsonResponse(response, 200, {
        schema: 'narada.nars.artifact_lifecycle_transition.v1',
        changed: transition.changed,
        previous_state: transition.previous_record.lifecycle.state,
        artifact_state: transition.record.lifecycle.state,
        artifact: transition.public_record,
      });
      return true;
    }
    if (request.method === 'POST' && !artifactId && !content && !message) {
      const params: any = await readRequestJson(request);
      const artifactOptions: any = {
        sessionPath: runtimeContext.sessionPath,
        sessionId: runtimeContext.session,
        agentId: runtimeContext.identity,
        siteRoot: runtimeContext.siteRoot,
        sourcePath: params.source_path ?? params.path,
        kind: params.kind,
        title: params.title,
        contentType: params.content_type,
        renderHint: params.render_hint,
        accessScope: params.access?.scope ?? params.access_scope,
      };
      const registered: any = requireSessionCore(runtimeContext, 'registerArtifact').registerArtifact(artifactOptions);
      sendJsonResponse(response, 201, { schema: 'narada.nars.artifact_registered.v1', artifact: registered.public_record });
      return true;
    }
    if (request.method === 'POST' && artifactId && message) {
      const params: any = await readRequestJson(request);
      const artifact: any = publicNarsArtifactRecord(readNarsArtifact({ sessionPath: runtimeContext.sessionPath, artifactId }));
      const messageEvent: any = buildArtifactAssistantMessageEvent({ runtimeContext, artifact, params });
      const published: any = requireSessionCore(runtimeContext, 'appendEvent').appendEvent(messageEvent);
      sendJsonResponse(response, 201, {
        schema: 'narada.nars.artifact_message_presented.v1',
        status: 'presented',
        artifact,
        event: published,
        message_part: artifactMessagePartFromRecord(artifact, params),
      });
      return true;
    }
    if (request.method !== 'GET') {
      sendJsonResponse(response, 405, { error: 'method_not_allowed' });
      return true;
    }
    if (!artifactId) {
      sendJsonResponse(response, 200, readNarsArtifactIndex({ sessionPath: runtimeContext.sessionPath }));
      return true;
    }
    if (!content) {
      sendJsonResponse(response, 200, { schema: 'narada.nars.artifact_read.v1', artifact: publicNarsArtifactRecord(readNarsArtifact({ sessionPath: runtimeContext.sessionPath, artifactId })) });
      return true;
    }
    const artifactContent: any = readNarsArtifactContent({ sessionPath: runtimeContext.sessionPath, artifactId });
    response.writeHead(200, { 'content-type': artifactContent.content_type, ...artifactContent.headers });
    response.end(artifactContent.content);
    return true;
  } catch (error) {
    artifactHttpError(response, error);
    return true;
  }
}

function buildArtifactAssistantMessageEvent({ runtimeContext, artifact, params = {} }: any) {
  const messagePart: any = artifactMessagePartFromRecord(artifact, params);
  const text: any = optionalText(params.text) ?? optionalText(params.message) ?? `Artifact ready: ${messagePart.title ?? messagePart.artifact_id}`;
  return {
    event: 'assistant_message',
    event_family: 'turn',
    agent_id: runtimeContext.identity,
    agent_identity_ref: runtimeContext.agentIdentityRef ?? null,
    session_id: runtimeContext.session,
    request_id: optionalText(params.request_id) ?? `artifact_present_${messagePart.artifact_id}`,
    timestamp: new Date().toISOString(),
    source: 'nars_artifact_presentation',
    content: [
      { type: 'text', text },
      messagePart,
    ],
    artifact_id: messagePart.artifact_id,
  };
}

function artifactMessagePartFromRecord(artifact: any, params: any = {}) {
  return {
    type: 'artifact_ref',
    artifact_id: String(artifact.artifact_id ?? artifact.id),
    ...(artifact.kind || params.kind ? { kind: String(artifact.kind ?? params.kind) } : {}),
    ...(artifact.title || params.title ? { title: String(artifact.title ?? params.title) } : {}),
    ...(artifact.render_hint || params.render_hint ? { render_hint: String(artifact.render_hint ?? params.render_hint) } : { render_hint: 'inline' }),
  };
}

function optionalText(value: any) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

