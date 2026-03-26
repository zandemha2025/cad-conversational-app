/**
 * localStorage helpers for demo-mode persistence.
 * Namespaced under "scalecad_" to avoid collisions.
 */

const PREFIX = 'scalecad_';

export function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function lsSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // quota exceeded — silently skip
  }
}

export function lsDel(key: string): void {
  localStorage.removeItem(PREFIX + key);
}

// ── Typed helpers ─────────────────────────────────────────────────────────────

export interface StoredProject {
  id: string;
  name: string;
  part_number: string | null;
  revision: string | null;
  template_id: string | null;
  gdt_standard: string | null;
  quality_standard: string | null;
  status: string;
  environment_json: Record<string, unknown> | null;
  printer_profile_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface StoredTouchpoint {
  id: string;
  project_id: string;
  label: string;
  type: 'locating' | 'clamping' | 'support';
  face_id: string;
  coords: number[];
  detail: string | null;
  force_n: number | null;
  created_at: string;
}

export interface StoredSettings {
  fullName: string;
  email: string;
  company: string;
  role: string;
  defaultGdtStandard: string;
  defaultQualityStandard: string;
  defaultMaterial: string;
  aiModel: string;
  enableDfmWarnings: boolean;
  autoSave: boolean;
  theme: 'dark' | 'light';
  // Notifications
  alertOnJobDone: boolean;
  weeklyDigestEmail: boolean;
  validationErrorsBeforeExport: boolean;
  browserNotificationOnDone: boolean;
  // Hardware
  preferInStockItems: boolean;
  showSupplierPricing: boolean;
  autoSuggestFasteners: boolean;
  // AI
  autoGenerateNodeGraph: boolean;
  autoRunDfmValidation: boolean;
  includeDesignRationale: boolean;
  suggestHardwareOnGenerate: boolean;
}

export function getProjects(): StoredProject[] {
  return lsGet<StoredProject[]>('projects') ?? [];
}

export function saveProjects(projects: StoredProject[]): void {
  lsSet('projects', projects);
}

export function getTouchpoints(projectId: string): StoredTouchpoint[] {
  return lsGet<StoredTouchpoint[]>(`touchpoints_${projectId}`) ?? [];
}

export function saveTouchpoints(projectId: string, tps: StoredTouchpoint[]): void {
  lsSet(`touchpoints_${projectId}`, tps);
}

export function getBomItems(projectId: string): string[] {
  return lsGet<string[]>(`bom_${projectId}`) ?? [];
}

export function saveBomItems(projectId: string, items: string[]): void {
  lsSet(`bom_${projectId}`, items);
}

const SETTINGS_DEFAULTS: StoredSettings = {
  fullName: '',
  email: '',
  company: '',
  role: 'Fixture Design Engineer',
  defaultGdtStandard: 'ASME Y14.5-2018',
  defaultQualityStandard: 'AS9100',
  defaultMaterial: 'Aluminum 6061-T6',
  aiModel: 'gemini-2.0-flash',
  enableDfmWarnings: true,
  autoSave: true,
  theme: 'dark',
  alertOnJobDone: true,
  weeklyDigestEmail: false,
  validationErrorsBeforeExport: true,
  browserNotificationOnDone: true,
  preferInStockItems: true,
  showSupplierPricing: true,
  autoSuggestFasteners: false,
  autoGenerateNodeGraph: true,
  autoRunDfmValidation: true,
  includeDesignRationale: false,
  suggestHardwareOnGenerate: true,
};

export function getSettings(): StoredSettings {
  const stored = lsGet<Partial<StoredSettings>>('settings');
  return { ...SETTINGS_DEFAULTS, ...stored };
}

export function saveSettings(s: StoredSettings): void {
  lsSet('settings', s);
}

export function getAuthToken(): string | null {
  return localStorage.getItem('scalecad_token');
}

export function setAuthToken(token: string): void {
  localStorage.setItem('scalecad_token', token);
}

export function clearAuthToken(): void {
  localStorage.removeItem('scalecad_token');
}
