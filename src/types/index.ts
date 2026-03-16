export type ProjectStatus = 'active' | 'draft' | 'archived' | 'shared' | 'released';
export type ProjectCategory = 'tooling' | 'part' | 'assembly' | 'fixture' | 'end-effector' | 'gauge';

export type FeatureType =
  | 'sketch'
  | 'extrude'
  | 'revolve'
  | 'fillet'
  | 'chamfer'
  | 'shell'
  | 'pattern'
  | 'mirror'
  | 'sweep'
  | 'loft'
  | 'cut'
  | 'plane'
  | 'assembly'
  | 'mate'
  | 'datum'
  | 'hole'
  | 'counterbore'
  | 'annotation';

export interface FeatureTreeItem {
  id: string;
  name: string;
  type: FeatureType;
  suppressed?: boolean;
  error?: boolean;
  children?: FeatureTreeItem[];
  params?: Record<string, string | number>;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  status: ProjectStatus;
  category: ProjectCategory;
  updatedAt: string;
  createdAt: string;
  parts: number;
  assemblies: number;
  drawings: number;
  collaborators: string[];
  tags: string[];
  revision?: string;
  partNumber?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  attachments?: string[];
  featureRefs?: string[];
  thinking?: boolean;
}

export interface ViewportObject {
  id: string;
  name: string;
  type: 'part' | 'assembly' | 'body';
  visible: boolean;
  selected: boolean;
}

export interface PropertyField {
  label: string;
  value: string | number;
  unit?: string;
  editable?: boolean;
}

export interface Material {
  id: string;
  name: string;
  density: number;
  youngsModulus: number;
  yield: number;
  color: string;
}

// GD&T Types
export type GDTSymbol =
  | 'position'
  | 'flatness'
  | 'straightness'
  | 'circularity'
  | 'cylindricity'
  | 'parallelism'
  | 'perpendicularity'
  | 'angularity'
  | 'profile-surface'
  | 'profile-line'
  | 'runout-circular'
  | 'runout-total'
  | 'concentricity'
  | 'symmetry';

export interface DatumDefinition {
  id: string;
  label: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  type: 'primary' | 'secondary' | 'tertiary';
  feature: string;
  description: string;
  points: number;
  constrains: string[];
}

export interface GDTCallout {
  id: string;
  symbol: GDTSymbol;
  tolerance: string;
  modifiers?: string;
  datum1?: string;
  datum2?: string;
  datum3?: string;
  appliedTo: string;
  standard: 'ASME Y14.5-2018' | 'ISO 1101';
}

// Tooling Hardware Types
export type HardwareCategory =
  | 'bushing'
  | 'clamp'
  | 'locator'
  | 'support'
  | 'fastener'
  | 'flange'
  | 'suction'
  | 'pin';

export interface ToolingHardware {
  id: string;
  partNumber: string;
  name: string;
  category: HardwareCategory;
  supplier: string;
  description: string;
  specs: Record<string, string | number>;
  price?: string;
  inStock?: boolean;
  preferred?: boolean;
}

// Revision / PLM Types
export type RevisionStatus = 'prototype' | 'in-review' | 'released' | 'obsolete';

export interface RevisionEntry {
  rev: string;
  status: RevisionStatus;
  date: string;
  author: string;
  ecrNumber?: string;
  description: string;
  changes: string[];
}

// 3-2-1 Locating Types
export type LocatingType = 'primary' | 'secondary' | 'tertiary';

export interface LocatingPoint {
  id: string;
  type: LocatingType;
  feature: string;
  position: string;
  constrains: string[];
}

export interface LocatingScheme {
  name: string;
  points: LocatingPoint[];
  clampForce?: string;
  clampCount?: number;
  status: 'fully-constrained' | 'under-constrained' | 'over-constrained';
}

// End Effector Types
export interface EndEffectorSpec {
  robotFlange: string;
  tcpOffset: string;
  payload: string;
  comOffset: string;
  vacuumPorts: number;
  operatingPressure: string;
  graspForce?: string;
  toolChangerInterface?: string;
}

// DFM Warning Types
export type DFMSeverity = 'error' | 'warning' | 'info';

export interface DFMWarning {
  id: string;
  severity: DFMSeverity;
  rule: string;
  description: string;
  feature: string;
  recommendation: string;
}

// Hardware Catalog
export interface HardwareCatalogItem {
  id: string;
  part_number: string;
  name: string;
  category: HardwareCategory;
  supplier: string;
  specs_json: Record<string, string | number>;
  price_usd: number | null;
  in_stock: boolean;
  preferred: boolean;
}

// Organization & RBAC
export type OrgRole = 'admin' | 'engineer' | 'reviewer' | 'viewer';

export interface Organization {
  id: string;
  name: string;
  itar_restricted: boolean;
  data_residency: string;
  created_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  email?: string;
  full_name?: string;
  invited_at: string;
}

// Revision / ECR
export interface Revision {
  id: string;
  project_id: string;
  rev_letter: string;
  status: RevisionStatus;
  ecr_number: string | null;
  description: string;
  author_id: string;
  author_name?: string;
  changes_json: string[];
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

// Drawing
export interface DrawingRecord {
  id: string;
  project_id: string;
  pdf_url: string | null;
  svg_json: Record<string, unknown> | null;
  svg_url: string | null;
  created_at: string;
}

// Audit Log
export interface AuditEntry {
  id: string;
  org_id: string | null;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata_json: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

// Node Graph (API)
export interface ApiNodeParam {
  name: string;
  value: string | number | boolean;
  unit?: string;
  type: 'number' | 'string' | 'boolean' | 'select';
}

export interface ApiNodeDef {
  id: string;
  label: string;
  category: 'input' | 'foundation' | 'geometry' | 'print' | 'output';
  x: number;
  y: number;
  w: number;
  h: number;
  params: ApiNodeParam[];
  ai_generated: boolean;
  special?: string;
}

export interface ApiConnection {
  from_node: string;
  from_port: string;
  to_node: string;
  to_port: string;
}

export interface ApiNodeGraph {
  id: string;
  project_id: string;
  nodes: ApiNodeDef[];
  connections: ApiConnection[];
  generated_at: string;
}

// Part features from OCCT
export interface PartFeatures {
  bounding_box: { x: number; y: number; z: number };
  volume_mm3: number;
  surface_area_mm2: number;
  face_count: number;
  edge_count: number;
  hole_count: number;
  faces: Array<{
    id: string;
    area_mm2: number;
    normal: [number, number, number];
    centroid: [number, number, number];
    is_planar: boolean;
    is_datum_candidate: boolean;
  }>;
  datum_candidates: string[];
  detected_holes: Array<{
    center: [number, number, number];
    diameter: number;
    depth: number;
    axis: [number, number, number];
    type?: 'blind' | 'through' | 'counterbore';
  }>;
  material_hint: string | null;
}

// Proactive AI suggestion
export interface ProactiveSuggestion {
  id: string;
  type: 'dfm' | 'optimization' | 'hardware' | 'tolerance' | '321';
  severity: 'info' | 'warning' | 'error';
  title: string;
  detail: string;
  action?: string;
}

// Analytics
export interface ValidationTrend {
  date: string;
  error_count: number;
  warning_count: number;
  score: number;
}

export interface DfmFrequency {
  rule: string;
  count: number;
  severity: string;
}
