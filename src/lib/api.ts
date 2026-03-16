/**
 * ScaleCAD API client.
 *
 * All functions return null (not throw) when the API is unavailable,
 * so callers can fall back to mock data seamlessly.
 */

const API_URL = import.meta.env.VITE_API_URL as string | undefined;
export const WS_URL = import.meta.env.VITE_WS_URL as string | undefined;

export const IS_DEMO = !API_URL;

// ── Token storage ─────────────────────────────────────────────────────────────

const TOKEN_KEY = 'scalecad_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// ── Base fetch ────────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  opts: RequestInit = {},
): Promise<T | null> {
  if (!API_URL) return null;
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_URL}/api${path}`, { ...opts, headers });
    if (!res.ok) {
      console.error(`[API] ${opts.method ?? 'GET'} ${path} → ${res.status}`);
      return null;
    }
    if (res.status === 204) return null;
    return res.json() as Promise<T>;
  } catch (e) {
    console.error(`[API] fetch error ${path}:`, e);
    return null;
  }
}

async function apiUpload<T>(path: string, formData: FormData): Promise<T | null> {
  if (!API_URL) return null;
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_URL}/api${path}`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch (e) {
    console.error('[API] upload error:', e);
    return null;
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface LoginUser {
  id: string;
  email: string;
  full_name: string | null;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number | null;
  user: LoginUser;
}

export async function login(email: string, password: string): Promise<LoginResponse | null> {
  const res = await apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (res?.access_token) setToken(res.access_token);
  return res;
}

export async function register(email: string, password: string, fullName: string) {
  return apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, full_name: fullName }),
  });
}

// ── Projects ──────────────────────────────────────────────────────────────────

export interface ApiProject {
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

export async function fetchProjects(q?: string): Promise<ApiProject[] | null> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  return apiFetch<ApiProject[]>(`/projects/${qs}`);
}

export async function fetchProject(id: string): Promise<ApiProject | null> {
  return apiFetch<ApiProject>(`/projects/${id}`);
}

export async function createProject(body: {
  name: string;
  part_number?: string;
  revision?: string;
  template_id?: string;
  gdt_standard?: string;
  quality_standard?: string;
}): Promise<ApiProject | null> {
  return apiFetch<ApiProject>('/projects/', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateProject(id: string, body: Partial<ApiProject>): Promise<ApiProject | null> {
  return apiFetch<ApiProject>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteProject(id: string) {
  return apiFetch(`/projects/${id}`, { method: 'DELETE' });
}

export async function initProject(id: string) {
  return apiFetch(`/projects/${id}/init`, { method: 'POST' });
}

// ── Upload ────────────────────────────────────────────────────────────────────

export async function uploadStepFile(projectId: string, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  return apiUpload<{ job_id: string; geometry_id: string; status: string }>(
    `/projects/${projectId}/upload/step`,
    fd,
  );
}

// ── Geometry ──────────────────────────────────────────────────────────────────

export async function fetchPartGeometry(projectId: string) {
  return apiFetch(`/projects/${projectId}/geometry/part`);
}

export async function fetchFixtureGeometry(projectId: string, version?: number) {
  const qs = version ? `?version=${version}` : '';
  return apiFetch(`/projects/${projectId}/geometry/fixture${qs}`);
}

// ── Touchpoints ───────────────────────────────────────────────────────────────

export interface ApiTouchpoint {
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

export async function fetchTouchpoints(projectId: string): Promise<ApiTouchpoint[] | null> {
  return apiFetch<ApiTouchpoint[]>(`/projects/${projectId}/touchpoints`);
}

export async function addTouchpoint(
  projectId: string,
  body: Omit<ApiTouchpoint, 'id' | 'project_id' | 'created_at'>,
) {
  return apiFetch<ApiTouchpoint>(`/projects/${projectId}/touchpoints`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteTouchpoint(projectId: string, tpId: string) {
  return apiFetch(`/projects/${projectId}/touchpoints/${tpId}`, { method: 'DELETE' });
}

export async function fetchConstraintStatus(projectId: string) {
  return apiFetch(`/projects/${projectId}/touchpoints/constraint-status`);
}

// ── Validation ────────────────────────────────────────────────────────────────

export async function fetchValidationResults(projectId: string, method?: string) {
  const qs = method ? `?method=${method}` : '';
  return apiFetch(`/projects/${projectId}/validation${qs}`);
}

export async function fetchValidationSummary(projectId: string) {
  return apiFetch(`/projects/${projectId}/validation/summary`);
}

export async function runValidation(projectId: string, methods?: string[]) {
  return apiFetch(`/projects/${projectId}/validation/run`, {
    method: 'POST',
    body: JSON.stringify({ methods }),
  });
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

export async function fetchNodeGraph(projectId: string) {
  return apiFetch(`/projects/${projectId}/nodes`);
}

export async function regenerateNodeGraph(projectId: string) {
  return apiFetch(`/projects/${projectId}/nodes/regenerate`, { method: 'POST' });
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function requestExport(projectId: string, format: 'step' | 'stl' | '3mf' | 'pdf' | 'dxf' | 'iges') {
  return apiFetch<{ job_id: string; status: string }>(`/projects/${projectId}/export`, {
    method: 'POST',
    body: JSON.stringify({ format }),
  });
}

// ── Job status (polling) ──────────────────────────────────────────────────────

export async function getJobStatus(projectId: string, jobId: string) {
  return apiFetch<{ job_id: string; status: string; result?: unknown; download_url?: string }>(
    `/projects/${projectId}/generation/jobs/${jobId}`,
  );
}

// ── Node param update ─────────────────────────────────────────────────────────

export async function updateNodeParams(
  projectId: string,
  nodeId: string,
  params: Array<{ name: string; value: string | number | boolean; unit?: string; type: string }>,
) {
  return apiFetch<{ job_id: string; node_id: string; status: string }>(
    `/projects/${projectId}/nodes/${nodeId}`,
    { method: 'PATCH', body: JSON.stringify({ params }) },
  );
}

// ── Hardware catalog ──────────────────────────────────────────────────────────

export interface HardwareCatalogQuery {
  q?: string;
  category?: string;
  supplier?: string;
  limit?: number;
}

export async function fetchHardwareCatalog(query: HardwareCatalogQuery = {}) {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.category) params.set('category', query.category);
  if (query.supplier) params.set('supplier', query.supplier);
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString() ? `?${params}` : '';
  return apiFetch<import('../types').HardwareCatalogItem[]>(`/hardware/catalog${qs}`);
}

export async function fetchHardwareItem(id: string) {
  return apiFetch<import('../types').HardwareCatalogItem>(`/hardware/${id}`);
}

export async function addHardwareToBom(projectId: string, hardwareId: string, quantity = 1) {
  return apiFetch(`/hardware/bom/${projectId}/add`, {
    method: 'POST',
    body: JSON.stringify({ hardware_id: hardwareId, quantity }),
  });
}

// ── Revisions (ECR) ───────────────────────────────────────────────────────────

export async function fetchRevisions(projectId: string) {
  return apiFetch<import('../types').Revision[]>(`/revisions/${projectId}`);
}

export async function createRevision(body: {
  project_id: string;
  rev_letter: string;
  description: string;
  changes: string[];
  ecr_number?: string;
}) {
  return apiFetch<import('../types').Revision>('/revisions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function approveRevision(id: string) {
  return apiFetch<import('../types').Revision>(`/revisions/${id}/approve`, { method: 'PATCH' });
}

export async function releaseRevision(id: string) {
  return apiFetch<import('../types').Revision>(`/revisions/${id}/release`, { method: 'PATCH' });
}

// ── Organizations ─────────────────────────────────────────────────────────────

export async function fetchOrg(id: string) {
  return apiFetch<import('../types').Organization>(`/organizations/${id}`);
}

export async function createOrg(name: string) {
  return apiFetch<import('../types').Organization>('/organizations', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function fetchOrgMembers(orgId: string) {
  return apiFetch<import('../types').OrgMember[]>(`/organizations/${orgId}/members`);
}

export async function inviteOrgMember(orgId: string, email: string, role: string) {
  return apiFetch(`/organizations/${orgId}/members`, {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });
}

export async function removeOrgMember(orgId: string, userId: string) {
  return apiFetch(`/organizations/${orgId}/members/${userId}`, { method: 'DELETE' });
}

export async function updateOrgMemberRole(orgId: string, userId: string, role: string) {
  return apiFetch(`/organizations/${orgId}/members/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

// ── Drawings ──────────────────────────────────────────────────────────────────

export async function fetchLatestDrawing(projectId: string) {
  return apiFetch<import('../types').DrawingRecord>(`/drawings/${projectId}/latest`);
}

export async function generateDrawing(projectId: string) {
  return apiFetch<{ job_id: string; status: string }>(`/drawings/generate/${projectId}`, {
    method: 'POST',
  });
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export async function fetchAuditLog(orgId: string, limit = 100) {
  return apiFetch<import('../types').AuditEntry[]>(`/audit?org_id=${orgId}&limit=${limit}`);
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export async function fetchValidationTrends(projectId?: string) {
  const qs = projectId ? `?project_id=${projectId}` : '';
  return apiFetch<import('../types').ValidationTrend[]>(`/analytics/validation-trends${qs}`);
}

export async function fetchDfmFrequency(orgId?: string) {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<import('../types').DfmFrequency[]>(`/analytics/dfm-frequency${qs}`);
}

export async function fetchReleaseVelocity() {
  return apiFetch<Array<{ category: string; avg_days: number; count: number }>>('/analytics/release-velocity');
}

// ── Export (extended) ─────────────────────────────────────────────────────────

export async function requestDxfExport(projectId: string) {
  return requestExport(projectId, 'dxf');
}

export async function requestIgesExport(projectId: string) {
  return requestExport(projectId, 'iges');
}

// ── FEA Lite ──────────────────────────────────────────────────────────────────

export interface FeaLiteResult {
  deflection_mm: number;
  max_stress_mpa: number;
  yield_strength_mpa: number;
  safety_factor: number;
  within_tolerance: boolean;
  tolerance_mm: number;
  interpretation: string;
  inputs: Record<string, unknown>;
}

export async function runFeaLite(
  projectId: string,
  params: {
    length_mm?: number;
    width_mm?: number;
    thickness_mm?: number;
    material?: string;
    clamping_force_n?: number;
    support_count?: number;
  } = {},
): Promise<FeaLiteResult | null> {
  return apiFetch<FeaLiteResult>(`/projects/${projectId}/fea-lite`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ── Proactive suggestions ────────────────────────────────────────────────────

export async function fetchProactiveSuggestions(projectId: string) {
  return apiFetch<import('../types').ProactiveSuggestion[]>(
    `/projects/${projectId}/suggestions`,
  );
}
