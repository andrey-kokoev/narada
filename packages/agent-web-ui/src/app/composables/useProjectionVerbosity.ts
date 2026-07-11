import { ref, watch } from 'vue';
import {
  NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS,
  NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY,
  normalizeNarsClientProjectionVerbosity,
} from '../../runtime-events.js';
import { AGENT_WEB_UI_PREFERENCE_KEYS, readStringPreference, writeStringPreference } from '../lib/browserPreferences.js';

export type ProjectionVerbosity = typeof NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS[number];
const PROJECTION_VERBOSITY_STORAGE_KEY = AGENT_WEB_UI_PREFERENCE_KEYS.projectionVerbosity;

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
  return normalizeNarsClientProjectionVerbosity(readStringPreference(PROJECTION_VERBOSITY_STORAGE_KEY, normalizedFallback)) as ProjectionVerbosity;
}

function persistProjectionVerbosity(value: ProjectionVerbosity) {
  if (typeof window === 'undefined') return;
  writeStringPreference(PROJECTION_VERBOSITY_STORAGE_KEY, value);
}
