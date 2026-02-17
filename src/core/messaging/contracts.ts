import type { PerTabOverrides, Settings } from '@/settings';

export type ContentStatusReason =
  | 'active'
  | 'no-active-media'
  | 'initializing'
  | 'unsupported-media'
  | 'disabled';

export interface ContentStatusPayload {
  type: 'contentStatus';
  elementLastActivatedAt?: number;
  status: ContentStatusReason;
  detail?: string;
}

export interface FloatingPillUiState {
  x: number;
  y: number;
  open: boolean;
}

export type RuntimeMessage =
  | { type: 'checkContentStatus' }
  | { type: 'setSettings'; values: Partial<Settings> }
  | { type: 'perTabOverridesChanged'; overrides: PerTabOverrides | null }
  | { type: 'floatingPillStateChanged'; state: FloatingPillUiState }
  | { type: 'backgroundReady' }
  | { type: 'resolveTabContext' }
  | ContentStatusPayload;

export interface ResolveTabContextResponse {
  tabId?: number;
}

export type PortName = 'telemetry' | 'nonSettingsActions' | 'timeSavedBadgeText';

export interface TelemetryRequest {
  type: 'getTelemetry';
}
