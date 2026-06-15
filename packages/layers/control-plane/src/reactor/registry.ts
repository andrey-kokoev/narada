/**
 * Reactor Registry
 *
 * Maps reactor identifiers to reactor implementations and resolves which
 * reactors are eligible for a given policy context.
 */

import type {
  Reactor,
  ReactorId,
  ReactorCharter,
  ReactorTrigger,
} from "./types.js";
import type { PolicyContext } from "../foreman/context.js";

export interface ReactorRegistry {
  register(reactor: Reactor): void;
  unregister(reactorId: ReactorId): void;
  get(reactorId: ReactorId): Reactor | undefined;
  resolveEligible(context: PolicyContext, charter: ReactorCharter): Reactor[];
  list(): Reactor[];
}

export interface ReactorRegistryOptions {
  /** If true, registering a duplicate reactor_id throws */
  strict?: boolean;
}

export class DefaultReactorRegistry implements ReactorRegistry {
  private readonly reactors = new Map<ReactorId, Reactor>();

  constructor(private readonly opts: ReactorRegistryOptions = {}) {}

  register(reactor: Reactor): void {
    if (this.opts.strict && this.reactors.has(reactor.reactor_id)) {
      throw new Error(`Reactor already registered: ${reactor.reactor_id}`);
    }
    this.reactors.set(reactor.reactor_id, reactor);
  }

  unregister(reactorId: ReactorId): void {
    this.reactors.delete(reactorId);
  }

  get(reactorId: ReactorId): Reactor | undefined {
    return this.reactors.get(reactorId);
  }

  resolveEligible(context: PolicyContext, charter: ReactorCharter): Reactor[] {
    const eligible: Reactor[] = [];
    for (const reactor of this.reactors.values()) {
      if (reactor.reactor_id === charter.charter_id && triggersMatch(context, charter.triggers)) {
        eligible.push(reactor);
      }
    }
    return eligible;
  }

  list(): Reactor[] {
    return [...this.reactors.values()];
  }
}

function triggersMatch(context: PolicyContext, triggers: ReactorTrigger[]): boolean {
  if (triggers.length === 0) {
    return true;
  }
  for (const trigger of triggers) {
    if (triggerMatches(context, trigger)) {
      return true;
    }
  }
  return false;
}

function triggerMatches(context: PolicyContext, trigger: ReactorTrigger): boolean {
  if (trigger.context_prefix && !context.context_id.startsWith(trigger.context_prefix)) {
    return false;
  }

  if (trigger.fact_types && trigger.fact_types.length > 0) {
    const contextFactTypes = new Set(context.facts.map((f) => f.fact_type));
    const matched = trigger.fact_types.some((t) => contextFactTypes.has(t as never));
    if (!matched) {
      return false;
    }
  }

  if (trigger.vertical) {
    const vertical = context.context_id.split(":")[0] ?? "";
    if (vertical !== trigger.vertical) {
      return false;
    }
  }

  return true;
}
