import type { OverlayDocument, OverlayRow, OverlayStatus, OverlayVisibilityPolicy } from '@narada2/window-overlay-core';

export declare const OPERATOR_CONSOLE_OVERLAY_ID = 'operator-console';
export interface OperatorConsoleOverlayOptions {
  url?: string;
  title?: string;
  subtitle?: string;
  rows?: OverlayRow[];
  stateRoot?: string;
  visibilityPolicy?: OverlayVisibilityPolicy;
  refreshSeconds?: number;
  env?: NodeJS.ProcessEnv;
}
export function operatorConsoleUrl(options?: { url?: string; env?: NodeJS.ProcessEnv }): string;
export function createOperatorConsoleOverlayDocument(options?: Pick<OperatorConsoleOverlayOptions, 'url' | 'title' | 'subtitle' | 'rows' | 'env'>): OverlayDocument;
export function startOperatorConsoleOverlay(options?: OperatorConsoleOverlayOptions): Promise<OverlayStatus>;
export function stopOperatorConsoleOverlay(options?: Pick<OperatorConsoleOverlayOptions, 'stateRoot' | 'env'>): Promise<OverlayStatus>;
export function inspectOperatorConsoleOverlay(options?: Pick<OperatorConsoleOverlayOptions, 'stateRoot' | 'env'>): Promise<OverlayStatus>;
export function refreshOperatorConsoleOverlay(options?: Pick<OperatorConsoleOverlayOptions, 'stateRoot' | 'env'>): Promise<Record<string, unknown>>;
