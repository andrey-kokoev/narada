declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

declare module '@narada2/nars-client-projection-contract' {
  export type AgentWebUiCommandKind = 'local_ui' | 'nars_protocol' | 'nars_session_command' | 'raw_protocol_frame';
  export type AgentWebUiCommandGroup = 'conversation' | 'session' | 'diagnostics' | 'settings' | 'snippets' | 'local' | 'advanced';
  export interface AgentWebUiCommand {
    id: string;
    slash: `/${string}`;
    aliases: readonly `/${string}`[];
    kind: AgentWebUiCommandKind;
    group: AgentWebUiCommandGroup;
    title: string;
    description: string;
    keywords: readonly string[];
    usage: string;
    protocolMethods: readonly string[];
    palette: Readonly<{ visible: boolean; rank: number; danger: boolean }>;
    buildAction(input: object, context?: object): object;
  }
  export type AgentWebUiSnippetActionMode = 'select' | 'panel' | 'write' | 'delete';
  export type AgentWebUiSnippetDeliveryMode = 'default' | 'enqueue';
  export interface AgentWebUiSnippetAction {
    id: string;
    verbs: readonly string[];
    slash: `/${string}`;
    title: string;
    description: string;
    meta: string;
    completion: string;
    mode: AgentWebUiSnippetActionMode;
    deliveryMode?: AgentWebUiSnippetDeliveryMode;
    immediate?: boolean;
    rank: number;
  }
  export interface AgentWebUiSnippetCommandParse {
    action: AgentWebUiSnippetAction | null;
    verb: string;
    rawVerb: string;
    remainder: string;
    recognized: boolean;
  }
  export const AGENT_WEB_UI_COMMANDS: readonly AgentWebUiCommand[];
  export const AGENT_WEB_UI_SNIPPET_USAGE: string;
  export const AGENT_WEB_UI_SNIPPET_ACTIONS: readonly AgentWebUiSnippetAction[];
  export const AGENT_WEB_UI_COMMAND_GROUP_LABELS: Record<string, string>;
  export const AGENT_WEB_UI_NARS_METHOD_LIST: readonly string[];
  export const AGENT_WEB_UI_NARS_METHODS: Record<string, string>;
  export const NARS_RUNTIME_INTELLIGENCE_RECONFIGURE_METHOD: 'runtime.intelligence.reconfigure';
  export const AGENT_WEB_UI_CLOUDFLARE_METHOD_LIST: readonly string[];
  export const AGENT_WEB_UI_CLOUDFLARE_METHODS: ReadonlySet<string>;
  export const NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY: string;
  export const NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS: readonly string[];
  export type NarsClientProjectionVerbosity = string;
  export function normalizeNarsClientProjectionVerbosity(value: unknown): string;
  export function projectNarsClientEvent(message: unknown): any;
  export function shouldProjectNarsClientProjection(projection: unknown, options?: object): boolean;
  export function unwrapNarsClientEvent(message: unknown): any;
  export function buildAgentWebUiEventsReadFrame(options?: object): any;
  export function buildAgentWebUiIntelligenceReconfigureFrame(input?: object, options?: object): any;
  export function buildAgentWebUiSubscribeFrame(options?: object): any;
  export function buildAgentWebUiConversationSendFrame(message: string): any;
  export function buildAgentWebUiConversationSteerFrame(command: string): any;
  export function buildAgentWebUiHelpText(options?: { supportsProtocolMethod?: (method: string) => boolean }): string;
  export function findAgentWebUiCommand(rawCommand: unknown): AgentWebUiCommand | null;
  export function filterAgentWebUiCommands(query?: unknown, options?: { supportsProtocolMethod?: (method: string) => boolean }): AgentWebUiCommand[];
  export function findAgentWebUiSnippetAction(rawVerb?: unknown): AgentWebUiSnippetAction | null;
  export function filterAgentWebUiSnippetActions(query?: unknown): AgentWebUiSnippetAction[];
  export function isAgentWebUiSnippetSelectionAction(rawVerb?: unknown): boolean;
  export function isAgentWebUiSnippetManagementAction(rawVerb?: unknown): boolean;
  export function parseAgentWebUiSnippetCommand(value?: unknown): AgentWebUiSnippetCommandParse;
  export function buildAgentWebUiOperatorInputAction(text: string, options?: object): any;
  export function isAgentWebUiNarsMethod(value: unknown): boolean;
  export function isAgentWebUiCloudflareMethod(value: unknown): boolean;
  export function isAgentWebUiProtocolFrame(value: unknown): boolean;
  export function isAgentWebUiCloudflareProtocolFrame(value: unknown): boolean;
  export function translateAgentWebUiFrameForCloudflare(value: unknown): Record<string, unknown> | null;
}