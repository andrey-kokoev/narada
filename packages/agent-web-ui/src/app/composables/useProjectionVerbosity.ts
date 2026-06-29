import { ref } from 'vue';
import {
  NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY,
  NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS,
  normalizeNarsClientProjectionVerbosity,
} from '../../runtime-events.js';

export type ProjectionVerbosity = typeof NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS[number];

export function useProjectionVerbosity(initial = NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY) {
  const verbosity = ref(normalizeNarsClientProjectionVerbosity(initial) as ProjectionVerbosity);
  return {
    levels: NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS as readonly ProjectionVerbosity[],
    verbosity,
    setVerbosity(value: string) {
      verbosity.value = normalizeNarsClientProjectionVerbosity(value) as ProjectionVerbosity;
    },
  };
}
