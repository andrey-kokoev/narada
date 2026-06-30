import { ref } from 'vue';
import {
  NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS,
  normalizeNarsClientProjectionVerbosity,
} from '../../runtime-events.js';
import { AGENT_WEB_UI_DEFAULT_VERBOSITY } from '../../agent-web-ui.js';

export type ProjectionVerbosity = typeof NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS[number];

export function useProjectionVerbosity(initial = AGENT_WEB_UI_DEFAULT_VERBOSITY) {
  const verbosity = ref(normalizeNarsClientProjectionVerbosity(initial) as ProjectionVerbosity);
  return {
    levels: NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS as readonly ProjectionVerbosity[],
    verbosity,
    setVerbosity(value: string) {
      verbosity.value = normalizeNarsClientProjectionVerbosity(value) as ProjectionVerbosity;
    },
  };
}
