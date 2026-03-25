/**
 * ScaleCAD API client.
 *
 * All functions return null (not throw) when the API is unavailable,
 * so callers can fall back to mock data seamlessly.
 */

// In production (Vercel), default to Fly.io backend when VITE_API_URL is not set or empty.
// In dev, stay undefined so the Vite proxy (/api → localhost:8000) handles calls.
// Use || (not ??) so an empty string VITE_API_URL also falls through to the production default.
const API_URL: string | undefined = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? 'https://scalecad-api.fly.dev' : undefined);

export const WS_URL: string | undefined = import.meta.env.VITE_WS_URL ||
  (import.meta.env.PROD ? 'wss://scalecad-api.fly.dev' : undefined);

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

// ── Direct export download ─────────────────────────────────────────────────

export function getDirectExportUrl(projectId: string, format: 'step' | 'iges' | 'stl' | 'dxf'): string {
  return `${API_URL}/api/projects/${projectId}/export/${format}`;
}

export async function directExport(projectId: string, format: 'step' | 'iges' | 'stl' | 'dxf'): Promise<Blob | null> {
  if (!API_URL) return null;
  const tok = getToken();
  try {
    const res = await fetch(`${API_URL}/api/projects/${projectId}/export/${format}`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    });
    if (!res.ok) return null;
    // Some formats return JSON redirect (STEP with original upload)
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const json = await res.json();
      if (json.download_url) {
        window.open(json.download_url, '_blank');
        return null;
      }
    }
    return res.blob();
  } catch (e) {
    console.error('[API] export error:', e);
    return null;
  }
}

// ── Approvals ─────────────────────────────────────────────────────────────────

export interface Approval {
  id: string;
  project_id: string;
  status: 'pending' | 'approved' | 'rejected';
  submitted_by: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  comments: string;
  revision_ref: string;
  created_at: string;
}

export async function fetchApprovals(projectId: string): Promise<Approval[] | null> {
  return apiFetch<Approval[]>(`/projects/${projectId}/approvals`);
}

export async function submitForApproval(projectId: string, revisionRef = '', comments = ''): Promise<Approval | null> {
  return apiFetch<Approval>(`/projects/${projectId}/approvals/submit`, {
    method: 'POST',
    body: JSON.stringify({ revision_ref: revisionRef, comments }),
  });
}

export async function approveProject(projectId: string, approvalId: string, comments = '') {
  return apiFetch(`/projects/${projectId}/approvals/${approvalId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ comments }),
  });
}

export async function rejectProject(projectId: string, approvalId: string, comments = '') {
  return apiFetch(`/projects/${projectId}/approvals/${approvalId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ comments }),
  });
}

// ── Assembly constraints ───────────────────────────────────────────────────────

export interface AssemblyConstraint {
  id: string;
  project_id: string;
  type: 'fixed' | 'coincident' | 'parallel' | 'perpendicular' | 'distance' | 'angle';
  part_a: string;
  part_b: string;
  params_json: Record<string, unknown>;
  is_valid: boolean | null;
  error_msg: string | null;
  created_at: string;
}

export async function fetchConstraints(projectId: string): Promise<AssemblyConstraint[] | null> {
  return apiFetch<AssemblyConstraint[]>(`/projects/${projectId}/constraints`);
}

export async function createConstraint(
  projectId: string,
  body: { type: string; part_a: string; part_b?: string; params?: Record<string, unknown> }
): Promise<AssemblyConstraint | null> {
  return apiFetch<AssemblyConstraint>(`/projects/${projectId}/constraints`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteConstraint(projectId: string, constraintId: string) {
  return apiFetch(`/projects/${projectId}/constraints/${constraintId}`, { method: 'DELETE' });
}

export async function validateAllConstraints(projectId: string) {
  return apiFetch(`/projects/${projectId}/constraints/validate-all`, { method: 'POST' });
}

// ── Interference detection ─────────────────────────────────────────────────────

export interface InterferenceResult {
  project_id: string;
  total_pairs_checked: number;
  interfering_pairs: number;
  status: 'clean' | 'interference_detected' | 'not_run';
  ran_at: string;
  parts_checked: number;
  issues: Array<{
    part_a: { id: string; label: string; type: string };
    part_b: { id: string; label: string; type: string };
    overlap_volume_mm3: number;
    severity: 'error' | 'warning';
    description: string;
  }>;
  summary: string;
}

export async function runInterferenceCheck(projectId: string): Promise<InterferenceResult | null> {
  return apiFetch<InterferenceResult>(`/projects/${projectId}/interference-check`, { method: 'POST' });
}

export async function fetchLatestInterference(projectId: string): Promise<InterferenceResult | null> {
  return apiFetch<InterferenceResult>(`/projects/${projectId}/interference-check/latest`);
}

// ── Clamping force ─────────────────────────────────────────────────────────────

export interface ClampingForceRequest {
  material?: string;
  depth_of_cut_mm?: number;
  width_of_cut_mm?: number;
  feed_rate_mm_per_rev?: number;
  spindle_speed_rpm?: number;
  tool_diameter_mm?: number;
  num_clamps?: number;
  fixture_surface?: string;
  safety_factor?: number;
  part_mass_kg?: number;
  part_contact_area_mm2?: number;
}

export interface ClampingForceResult {
  project_id: string;
  material: string;
  cutting_force_n: number;
  friction_force_required_n: number;
  clamping_force_per_clamp_n: number;
  total_clamping_force_n: number;
  safety_factor: number;
  recommended_clamp_type: string;
  recommendations: string[];
  breakdown: Record<string, number | string>;
}

export async function calculateClampingForce(
  projectId: string,
  params: ClampingForceRequest = {}
): Promise<ClampingForceResult | null> {
  return apiFetch<ClampingForceResult>(`/projects/${projectId}/clamping-force`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ── Project-scoped revisions ───────────────────────────────────────────────────

export async function fetchProjectRevisions(projectId: string) {
  return apiFetch<import('../types').Revision[]>(`/projects/${projectId}/revisions`);
}

export async function createProjectRevision(projectId: string, body: {
  rev_letter: string;
  description: string;
  ecr_number?: string;
  changes?: unknown[];
}) {
  return apiFetch<import('../types').Revision>(`/projects/${projectId}/revisions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchRevisionDiff(projectId: string, revisionId: string, compareToId?: string) {
  const qs = compareToId ? `?compare_to=${compareToId}` : '';
  return apiFetch(`/projects/${projectId}/revisions/${revisionId}/diff${qs}`);
}

// ── Project-scoped drawings ────────────────────────────────────────────────────

export async function generateProjectDrawings(projectId: string) {
  return apiFetch<{ id: string; status: string; drawing: Record<string, unknown> }>(
    `/projects/${projectId}/drawings/generate`,
    { method: 'POST' }
  );
}

export async function fetchProjectDrawings(projectId: string) {
  return apiFetch<import('../types').DrawingRecord[]>(`/projects/${projectId}/drawings`);
}

// ── Materials library ──────────────────────────────────────────────────────────

export interface MaterialProperties {
  id: string;
  display_name: string;
  category: string;
  density_kg_m3: number;
  yield_strength_mpa: number;
  ultimate_strength_mpa: number;
  hardness_hb: number;
  youngs_modulus_gpa: number;
  poissons_ratio: number;
  thermal_conductivity_w_mk: number;
  machinability_rating: number;
  kc1_1: number;
  mc: number;
  notes: string;
}

export async function fetchMaterials(): Promise<MaterialProperties[] | null> {
  return apiFetch<MaterialProperties[]>('/materials');
}

export async function fetchMaterialById(materialId: string): Promise<MaterialProperties | null> {
  return apiFetch<MaterialProperties>(`/materials/${materialId}`);
}

// ── Work instructions ──────────────────────────────────────────────────────────

export interface WorkInstructionsRequest {
  material?: string;
  process?: string; // 'cnc_milling' | 'turning' | 'grinding' | 'inspection'
  include_speeds_feeds?: boolean;
}

export interface WorkInstructionsResult {
  project_id: string;
  material: string;
  process: string;
  phases: Array<{
    phase: number;
    title: string;
    operation: string;
    tool: string;
    setup: string;
    parameters: Record<string, string | number>;
    notes: string;
    quality_check: string;
  }>;
  summary: string;
  generated_at: string;
}

export async function generateWorkInstructions(
  projectId: string,
  params: WorkInstructionsRequest = {}
): Promise<WorkInstructionsResult | null> {
  return apiFetch<WorkInstructionsResult>(`/projects/${projectId}/work-instructions`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ── QC checklist ───────────────────────────────────────────────────────────────

export interface QcChecklistRequest {
  material?: string;
  standard?: string; // 'asme_y14_5' | 'iso_1101' | 'as9100'
  include_cmm?: boolean;
}

export interface QcChecklistResult {
  project_id: string;
  standard: string;
  items: Array<{
    id: string;
    category: string;
    characteristic: string;
    nominal: string;
    tolerance: string;
    method: string;
    instrument: string;
    frequency: string;
    accept_criteria: string;
    reference: string;
  }>;
  summary: string;
  generated_at: string;
}

export async function generateQcChecklist(
  projectId: string,
  params: QcChecklistRequest = {}
): Promise<QcChecklistResult | null> {
  return apiFetch<QcChecklistResult>(`/projects/${projectId}/qc-checklist`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ── Tolerance stack-up ─────────────────────────────────────────────────────────

export interface ToleranceStackRequest {
  dimensions: Array<{ name: string; nominal_mm: number; tolerance_mm: number; bilateral?: boolean }>;
  method?: 'worst_case' | 'rss';
}

export interface ToleranceStackResult {
  project_id: string;
  method: string;
  dimensions: Array<{ name: string; nominal_mm: number; tolerance_mm: number }>;
  total_nominal_mm: number;
  worst_case_mm: number;
  rss_mm: number;
  gap_min_mm: number;
  gap_max_mm: number;
  assembly_ok: boolean;
  summary: string;
}

export async function runToleranceStack(
  projectId: string,
  params: ToleranceStackRequest
): Promise<ToleranceStackResult | null> {
  return apiFetch<ToleranceStackResult>(`/projects/${projectId}/tolerance-stack`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ── Standard component library ─────────────────────────────────────────────────

export interface StandardComponent {
  id: string;
  name: string;
  category: string;
  description?: string;
  specifications: Record<string, string | number>;
  prompt_hint?: string;
  thumbnail?: string;
}

export interface ComponentCategory {
  name: string;
  icon: string;
  color: string;
}

export interface ComponentLibraryResponse {
  categories: Record<string, ComponentCategory>;
  components: StandardComponent[];
  total: number;
}

export interface ProjectComponent {
  id: string;
  project_id: string;
  component_id: string;
  component_name: string;
  category: string;
  quantity: number;
  position_notes: string;
  specifications: Record<string, string | number>;
  created_at?: string;
}

export interface ComponentSuggestion {
  component_id: string;
  quantity: number;
  reason: string;
}

export async function fetchComponentLibrary(category?: string): Promise<ComponentLibraryResponse | null> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return apiFetch<ComponentLibraryResponse>(`/components/library${qs}`);
}

export async function addComponentToProject(
  projectId: string,
  body: { component_id: string; quantity: number; position_notes?: string }
): Promise<ProjectComponent | null> {
  return apiFetch<ProjectComponent>(`/projects/${projectId}/components/add`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchProjectComponents(projectId: string): Promise<ProjectComponent[] | null> {
  return apiFetch<ProjectComponent[]>(`/projects/${projectId}/components`);
}

export async function removeProjectComponent(projectId: string, itemId: string): Promise<null> {
  return apiFetch(`/projects/${projectId}/components/${itemId}`, { method: 'DELETE' });
}
