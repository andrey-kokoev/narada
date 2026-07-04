export const NARS_COMMAND_METHOD: 'session.command.execute';
export const LEGACY_CARRIER_COMMAND_METHOD: 'carrier.command.execute';
export const NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS: readonly ['conversation', 'operations', 'diagnostics', 'raw'];
export type NarsClientProjectionVerbosity = typeof NARS_CLIENT_PROJECTION_VERBOSITY_LEVELS[number];
export type NarsClientProjectionClass = 'conversation' | 'operations' | 'diagnostics' | 'raw';
export const NARS_CLIENT_PROJECTION_DEFAULT_VERBOSITY: NarsClientProjectionVerbosity;
export const NARS_CLIENT_PROJECTION_VERBOSITY_RANK: Readonly<Record<NarsClientProjectionVerbosity, number>>;
export const AGENT_WEB_UI_NARS_METHOD_LIST: readonly string[];
export const AGENT_WEB_UI_SESSION_COMMANDS: readonly string[];
export const AGENT_WEB_UI_CARRIER_COMMANDS: readonly string[];
export const AGENT_WEB_UI_HELP_LINES: readonly string[];
export const NARS_CLIENT_EVENT_TONES: Readonly<Record<string, string>>;
export const NARS_CLIENT_EVENT_LABELS: Readonly<Record<string, string>>;
export const AGENT_WEB_UI_NARS_METHODS: ReadonlySet<string>;
export const NARS_CLIENT_PROJECTION_REGISTRY: unknown;

export interface NarsClientProjection {
  kind: string;
  class?: NarsClientProjectionClass;
  label: string;
  tone: string;
  summary: unknown;
  event: unknown;
  renderKey?: string;
}

export function isAgentWebUiNarsMethod(method: unknown): boolean;
export function buildNarsArtifactRefPart(input?: object): object | null;
export function buildAgentWebUiConversationEnqueueFrame(text: unknown, options?: object): object | null;
export function buildAgentWebUiEventsReadFrame(options?: object): object;
export function buildAgentWebUiHelpText(): string;
export function buildAgentWebUiConversationSendFrame(text: unknown, options?: object): object | null;
export function buildAgentWebUiConversationSteerFrame(text: unknown, options?: object): object | null;
export function buildAgentWebUiSubscribeFrame(options?: object): object;
export function isAgentWebUiProtocolFrame(frame: unknown): boolean;
export function buildAgentWebUiOperatorInputAction(text: unknown, options?: object): object | null;
export function unwrapNarsClientEvent(message: unknown): any;
export function normalizeNarsClientProjectionVerbosity(verbosity?: unknown): NarsClientProjectionVerbosity;
export function isRoutineHealthyNarsSessionHealth(event: unknown): boolean;
export function classifyNarsClientEventProjection(projection: unknown): NarsClientProjectionClass;
export function shouldProjectNarsClientProjection(projection: unknown, options?: { verbosity?: unknown; includeStateSamples?: boolean }): boolean;
export function isRoutineStateSampleProjection(projection: unknown): boolean;
export function shouldProjectNarsClientEvent(message: unknown, options?: { verbosity?: unknown; includeStateSamples?: boolean }): boolean;
export function projectNarsClientEvent(message: unknown): NarsClientProjection;
export function buildNarsAttachCommands(options?: { eventEndpoint?: string; healthEndpoint?: string }): object;
