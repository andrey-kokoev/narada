import { ref, type ShallowRef } from 'vue';
import { submitOperatorInput } from '../../protocol/operatorInput';
import type { NarsClientConnection } from '../../protocol/narsClient';

export function useOperatorInput(connection: ShallowRef<NarsClientConnection | null>, retain: (event: unknown) => void, clearEvents: () => void) {
  const draft = ref('');
  function submit() {
    const result = submitOperatorInput(draft.value, connection.value);
    if (result.localEvent) {
      if ((result.localEvent as { event?: string }).event === 'agent_web_ui_clear_requested') clearEvents();
      else retain(result.localEvent);
    }
    if (result.shouldClearDraft) draft.value = '';
    return result.handled;
  }
  return { draft, submit };
}
