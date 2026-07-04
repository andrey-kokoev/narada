import { ref, watch } from 'vue';
import {
  NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS,
  NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY,
  normalizeNarsClientProjectionVerbosity,
} from '../../runtime-events.js';

export type ProjectionVerbosity = typeof NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS[number];
const PROJECTION_VERBOSITY_STORAGE_KEY = 'narada:agent-web-ui:projection-verbosity.v1';

export function useProjectionVerbosity(initial = NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY) {
  const verbosity = ref(loadProjectionVerbosity(initial));
  watch(verbosity, (value) => persistProjectionVerbosity(value));
  return {
    levels: NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS as readonly ProjectionVerbosity[],
    verbosity,
    setVerbosity(value: string) {
      verbosity.value = normalizeNarsClientProjectionVerbosity(value) as ProjectionVerbosity;
    },
  };
}

function loadProjectionVerbosity(fallback: string): ProjectionVerbosity {
  const normalizedFallback = normalizeNarsClientProjectionVerbosity(fallback) as ProjectionVerbosity;
  if (typeof window === 'undefined') return normalizedFallback;
  return normalizeNarsClientProjectionVerbosity(window.localStorage.getItem(PROJECTION_VERBOSITY_STORAGE_KEY) ?? normalizedFallback) as ProjectionVerbosity;
}

function persistProjectionVerbosity(value: ProjectionVerbosity) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROJECTION_VERBOSITY_STORAGE_KEY, value);
}
