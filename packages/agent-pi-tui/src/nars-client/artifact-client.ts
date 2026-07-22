import type { NarsEvent, PiRenderableContent } from '../types.js';
import { buildNarsArtifactRefPart, buildNarsIntentRefPart } from '@narada2/nars-client-projection-contract';

export function artifactContentFromEvent(event: NarsEvent): PiRenderableContent[] {
  const content: PiRenderableContent[] = [];
  const artifact = event.artifact && typeof event.artifact === 'object' ? event.artifact : event;
  const artifactRef = buildNarsArtifactRefPart(artifact as object) as Record<string, unknown> | null;
  if (artifactRef && typeof artifactRef.artifact_id === 'string') {
    content.push({
      type: 'artifact_ref',
      artifact_id: artifactRef.artifact_id,
      ...(typeof artifactRef.kind === 'string' ? { kind: artifactRef.kind } : {}),
      ...(typeof artifactRef.title === 'string' ? { title: artifactRef.title } : {}),
      ...(typeof artifactRef.render_hint === 'string' ? { render_hint: artifactRef.render_hint } : {}),
    });
  }
  const intent = buildNarsIntentRefPart(event as object) as Record<string, unknown> | null;
  if (intent && typeof intent.intent === 'string') {
    content.push({
      type: 'intent_ref',
      intent: intent.intent,
      ...(typeof intent.label === 'string' ? { label: intent.label } : {}),
      ...(typeof intent.description === 'string' ? { description: intent.description } : {}),
      ...(typeof intent.target === 'string' ? { target: intent.target } : {}),
      ...(typeof intent.action === 'string' ? { action: intent.action } : {}),
    });
  }
  return content;
}

export function artifactRefsFromEvent(event: NarsEvent): PiRenderableContent[] {
  return artifactContentFromEvent(event).filter((part) => part.type === 'artifact_ref');
}
