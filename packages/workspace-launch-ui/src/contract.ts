export type WorkspaceLaunchSelectionCardinality = 'single' | 'multiple';

export interface WorkspaceLaunchSelectionMode {
  site?: WorkspaceLaunchSelectionCardinality;
  role?: WorkspaceLaunchSelectionCardinality;
  operatorSurface?: WorkspaceLaunchSelectionCardinality;
}

export interface WorkspaceLaunchOption {
  value: string;
  label: string;
  hint?: string;
}

export interface WorkspaceLaunchRecord {
  site: string;
  role: string;
  agent: string;
  runtime: string;
  operatorSurface: string;
  agentIdentityRef?: { canonicalAgentId?: string };
}

export interface WorkspaceLaunchSelectorModel {
  selected?: {
    runtime?: string;
    intelligenceProvider?: string;
  };
  operatorSurfaceOptions?: WorkspaceLaunchOption[];
  runtimeOptions?: WorkspaceLaunchOption[];
  intelligenceProviderOptions?: WorkspaceLaunchOption[];
}

export interface WorkspaceLaunchModel {
  records: WorkspaceLaunchRecord[];
  siteChoices: string[];
  initialSites: string[];
  initialRoles: string[];
  initialOperatorSurfaces: string[];
  initialRuntime: string;
  initialIntelligenceProvider: string;
  initialSelectionMode: WorkspaceLaunchSelectionMode;
  narsOperatorSurfaceChoices: string[];
  selectorModel: WorkspaceLaunchSelectorModel;
}

export interface WorkspaceLaunchSelection {
  site: string[];
  role: string[];
  operatorSurface: string[];
  runtime: string;
  intelligenceProvider: string;
  selectionMode?: WorkspaceLaunchSelectionMode;
}

export interface WorkspaceLaunchHandoff {
  posture?: string;
  status?: string;
}

export interface WorkspaceLaunchObservation {
  health?: string;
  sessionId?: string;
}

export interface WorkspaceLaunchProjection {
  projectionKind?: string;
  status?: string;
}

export interface WorkspaceLaunchAttempt {
  launchAttemptId: string;
  selection: WorkspaceLaunchSelection;
  status: string;
  resultSummary: string;
  updatedAt: string | null;
  handoffs: WorkspaceLaunchHandoff[];
  observations: WorkspaceLaunchObservation[];
  projections: WorkspaceLaunchProjection[];
  actions: string[];
  raw: unknown;
}

export interface WorkspaceLaunchBootstrap {
  model: WorkspaceLaunchModel;
  persistent: boolean;
}
