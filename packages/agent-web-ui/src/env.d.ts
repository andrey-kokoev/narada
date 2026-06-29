declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

declare module '@narada2/nars-client-projection-contract' {
  export const AGENT_WEB_UI_NARS_METHOD_LIST: readonly string[];
  export const AGENT_WEB_UI_NARS_METHODS: Record<string, string>;
  export const NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY: string;
  export const NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS: readonly string[];
  export type NarsClientProjectionVerbosity = string;
  export function normalizeNarsClientProjectionVerbosity(value: unknown): string;
  export function projectNarsClientEvent(message: unknown): any;
  export function shouldProjectNarsClientProjection(projection: unknown, options?: object): boolean;
  export function unwrapNarsClientEvent(message: unknown): any;
  export function buildAgentWebUiSubscribeFrame(options?: object): any;
  export function buildAgentWebUiConversationSendFrame(message: string): any;
  export function buildAgentWebUiConversationSteerFrame(command: string): any;
  export function buildAgentWebUiHelpText(): string;
  export function buildAgentWebUiOperatorInputAction(text: string, options?: object): any;
  export function isAgentWebUiNarsMethod(value: unknown): boolean;
  export function isAgentWebUiProtocolFrame(value: unknown): boolean;
}
