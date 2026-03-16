# ScaleCAD — Full System Architecture

> **Status:** UI complete (dummy data). Backend to be scaffolded next.
> **Last updated:** 2026-03-15

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            BROWSER (Vercel)                                 │
│                                                                             │
│  ┌──────────┐  ┌─────────────────────────────────────────────────────────┐ │
│  │  Home    │  │                    Workspace                             │ │
│  │ /        │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │ │
│  │ Projects │  │  │ ChatPanel│ │FeatureTree│ │Touchpoints│ │Validation│  │ │
│  │ NewModal │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │ │
│  └──────────┘  │  ┌──────────────────────────────────────┐ ┌──────────┐ │ │
│                │  │       Viewport3D (Three.js/R3F)       │ │Properties│ │ │
│                │  │       GLTF loaded from R2/Zoo.dev     │ └──────────┘ │ │
│                │  └──────────────────────────────────────┘              │ │
│                │  ┌──────────────────────────────────────────────────┐  │ │
│                │  │  TopBar: Part │ Assembly │ Drawing │ Nodes        │  │ │
│                │  └──────────────────────────────────────────────────┘  │ │
│                │  DrawingView (full A3 sheet, BOM, GD&T)                 │ │
│                │  NodeEditor (AI-generated parametric graph)             │ │
│                └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTPS / WebSocket
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Railway / Fly.io)                          │
│                                                                             │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────┐  ┌─────────────────┐ │
│  │  FastAPI   │  │ OCCT Service │  │ Gemini Service│  │Validation Engine│ │
│  │  REST + WS │  │ (pythonocc)  │  │ Flash + Pro   │  │ Rule-based DFM  │ │
│  └─────┬──────┘  └──────┬───────┘  └───────┬───────┘  └────────┬────────┘ │
│        │                │                   │                    │          │
│  ┌─────▼────────────────▼───────────────────▼────────────────────▼───────┐ │
│  │                    Celery + Redis (job queue)                          │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└──────────────────────┬─────────────────────────────────────────────────────┘
                       │
          ┌────────────┼──────────────────────┐
          ▼            ▼                       ▼
   ┌────────────┐ ┌──────────┐       ┌─────────────────┐
   │ Supabase   │ │    R2    │       │  External APIs  │
   │ PostgreSQL │ │(Cloudflare│       │  Zoo.dev        │
   │ + Auth     │ │ Storage) │       │  Gemini 2.0     │
   └────────────┘ └──────────┘       └─────────────────┘
```

---

## Frontend → API Routing Map

Every UI component, the API it calls, the backend service that handles it, and the external system it touches.

---

### `Home.tsx` — Project Dashboard

| UI Action | API Route | Service | Data |
|---|---|---|---|
| Load project list | `GET /api/projects` | FastAPI | PostgreSQL → `projects` table |
| Click "New Design" | Opens `NewProjectModal` | — | — |
| Click project card | Navigate to `/workspace/:id` | — | — |
| Search projects | `GET /api/projects?q=wing` | FastAPI | PostgreSQL full-text |

---

### `NewProjectModal.tsx` — 4-Step Project Wizard

| Step | UI Action | API Route | Service | External |
|---|---|---|---|---|
| **1. Template** | Select template | — | (static data) | — |
| **2. Configure** | Set part number, name, material, standards | `POST /api/projects` | FastAPI | Supabase (create row) |
| **3. Environment** | Surface type, robot toggle, face-up orientation | `PATCH /api/projects/:id` | FastAPI | Supabase (update `environment_json`) |
| **4. Printer** | Machine, nozzle, layer height, material, orientation | `PATCH /api/projects/:id` | FastAPI | Supabase (update `printer_profile_json`) |
| **Create Design** | Submit all config | `POST /api/projects/:id/init` | FastAPI → Celery | Queues OCCT + initial generation jobs |

---

### `Viewport3D.tsx` — 3D Model View (Three.js / R3F)

| UI State | API Route | Service | External |
|---|---|---|---|
| Load part geometry | `GET /api/projects/:id/geometry/part` | FastAPI | R2 → GLTF (converted by OCCT) |
| Load fixture geometry | `GET /api/projects/:id/geometry/fixture` | FastAPI | R2 → GLTF (compiled by Zoo.dev) |
| Load environment assets | (static GLB assets bundled) | — | — |
| Generation progress | `WS /api/projects/:id/generation` | FastAPI WebSocket | Celery progress events |
| Touchpoint mode (click face) | `POST /api/projects/:id/touchpoints` | FastAPI | Supabase → `touchpoints` |
| Select face → Properties | `GET /api/projects/:id/geometry/faces/:faceId` | FastAPI | OCCT face metadata |

**3D Scene composition:**
```
Three.js scene
├── Environment
│   ├── Siegmund table (pre-baked GLB, loaded from /assets)
│   ├── Robot arm (conditional, pre-baked GLB per model)
│   └── Clearance zone volumes (transparent Box geometry)
├── Part geometry
│   └── GLTF loaded from R2 (OCCT-converted from user STEP)
└── Fixture geometry
    └── GLTF loaded from R2 (Zoo.dev-compiled from KCL)
```

---

### `ChatPanel.tsx` — AI Streaming Chat

| UI Action | API Route | Service | External |
|---|---|---|---|
| Send message | `WS /api/projects/:id/chat` | FastAPI WebSocket | Gemini 2.0 Flash (stream) |
| Message triggers geometry generation | Auto-escalates via WS | Celery job | Gemini 2.0 Pro → KCL → Zoo.dev |
| Message references a node | `GET /api/projects/:id/nodes/:nodeId` | FastAPI | Supabase |
| Message references a validation issue | `GET /api/projects/:id/validation` | FastAPI | Supabase / Validation Engine |

**AI routing logic:**
```python
if intent in ['fixture_generation', 'geometry_modification', 'kcl_revision']:
    model = "gemini-2.0-pro"         # Complex spatial reasoning + code gen
else:
    model = "gemini-2.0-flash"       # Fast: Q&A, explanation, classification
```

---

### `TouchpointPanel.tsx` — Clamping & Locating Points

| UI Action | API Route | Service | Data |
|---|---|---|---|
| Load touchpoints | `GET /api/projects/:id/touchpoints` | FastAPI | Supabase → `touchpoints` |
| Add touchpoint (click model) | `POST /api/projects/:id/touchpoints` | FastAPI | Supabase insert → triggers constraint re-solve |
| Delete touchpoint | `DELETE /api/projects/:id/touchpoints/:id` | FastAPI | Supabase delete → triggers constraint re-solve |
| Constraint re-solve | Async via Celery | Validation Engine | 3-2-1 completeness check → Supabase `validation_results` |

---

### `ValidationPanel.tsx` — DFM Validation (5 tabs)

| Tab | API Route | Backend Service | Logic |
|---|---|---|---|
| **FDM** | `GET /api/projects/:id/validation?method=fdm` | Validation Engine | OCCT geometry + FDM rule set (wall thickness, overhang, bridge, bore tolerance, elephant foot) |
| **CNC** | `GET /api/projects/:id/validation?method=cnc` | Validation Engine | OCCT geometry + CNC rule set (corner radius, pocket D:W, undercuts, tool access) |
| **Laser** | `GET /api/projects/:id/validation?method=laser` | Validation Engine | OCCT geometry + laser rule set (2D check, min hole, kerf, Z-height) |
| **Functional** | `GET /api/projects/:id/validation?method=functional` | Validation Engine + numpy | 3-2-1 solver, clamping force calc, deflection estimate |
| **Standards** | `GET /api/projects/:id/validation?method=standards` | Gemini Flash + rule set | GD&T callout parsing, AS9100/IATF checklist |
| **Re-run** | `POST /api/projects/:id/validation/run` | Celery → all above | Full re-validation on demand |

**Validation Engine internals:**
```python
class ValidationEngine:
    def run_fdm(geometry, printer_profile) -> List[ValidationIssue]:
        # OCCT: measure wall thickness at all thin sections
        # Compare overhang angles to printer overhang limit
        # Check bridge lengths, hole diameters, bore tolerances
        # Apply printer profile (nozzle × 2 = min wall)

    def run_cnc(geometry) -> List[ValidationIssue]:
        # OCCT: detect all internal corners, measure fillet radii
        # Check pocket depth-to-width ratios
        # Detect undercuts from standard 3-axis directions

    def run_functional(geometry, touchpoints) -> List[ValidationIssue]:
        # 3-2-1 constraint matrix completeness (linear algebra)
        # Clamping force sum vs required force (numpy)
        # Datum face flatness achievability per process

    def run_standards(geometry, drawing_metadata) -> List[ValidationIssue]:
        # GD&T callout symbol validity (regex + rule table)
        # AS9100 checklist (material cert, revision block, FAI)
```

---

### `NodeEditor.tsx` — AI-Generated Parametric Graph

| UI Action | API Route | Service | External |
|---|---|---|---|
| Load node graph | `GET /api/projects/:id/nodes` | FastAPI | Supabase → `node_graphs` (JSON) |
| Click node (inspect) | `GET /api/projects/:id/nodes/:nodeId` | FastAPI | Supabase |
| Edit node parameter | `PATCH /api/projects/:id/nodes/:nodeId` | FastAPI → Celery | Triggers sub-graph re-run (only downstream nodes) |
| Re-generate full graph | `POST /api/projects/:id/nodes/regenerate` | Celery | Gemini 2.0 Pro → new KCL → Zoo.dev → new GLTF |

**Node graph generation (Gemini 2.0 Pro prompt):**
```
System: You are a CAD engineer generating a parametric node graph for
        a {template} fixture. Output valid JSON.

Context:
- Part: {part_features_json}        ← from OCCT analysis
- Touchpoints: {touchpoints_json}   ← from user-defined TPs
- Environment: {environment_json}   ← surface, robot, orientation
- Printer: {printer_profile_json}   ← machine, nozzle, layer, material
- Template: {template_id}           ← Drill Jig, Weld Fixture, etc.

Output: Node graph JSON + KCL code for each geometry node
```

---

### `DrawingView.tsx` — 2D Technical Drawing (A3 Sheet)

| UI Action | API Route | Service | External |
|---|---|---|---|
| Load drawing | `GET /api/projects/:id/drawing` | FastAPI | Supabase → `drawings` |
| Export PDF | `POST /api/projects/:id/drawing/export` | Celery | OCCT → SVG → PDF (reportlab) |
| BOM data | `GET /api/projects/:id/bom` | FastAPI | Supabase → `bom_items` |
| GD&T callouts | Embedded in drawing JSON | — | Generated from node graph outputs |

---

### `TopBar.tsx` — Mode Switcher + Export

| UI Action | API Route | Service | External |
|---|---|---|---|
| Export STEP | `POST /api/projects/:id/export?format=step` | Celery → OCCT | OCCT assembly → STEP AP214 → R2 |
| Export STL | `POST /api/projects/:id/export?format=stl` | Celery → OCCT | OCCT → STL → R2 |
| Export 3MF (print) | `POST /api/projects/:id/export?format=3mf` | Celery → Zoo.dev | Zoo.dev KCL → 3MF with tolerances → R2 |
| DFM badge live count | `GET /api/projects/:id/validation/summary` | FastAPI | Supabase (cached counts) |
| Standards badge | `GET /api/projects/:id/validation/summary` | FastAPI | same |

---

## Backend Services — Full Detail

### 1. FastAPI Server
```
Responsibilities:
  - Auth (JWT via Supabase)
  - REST endpoints for all CRUD
  - WebSocket upgrade for chat + generation progress
  - Dispatch heavy jobs to Celery
  - Return cached results from Supabase/R2

Stack:
  Python 3.12 · FastAPI · uvicorn · SQLAlchemy · Supabase Python SDK
```

### 2. OCCT Service (pythonocc-core)
```
Responsibilities:
  - Parse uploaded STEP files
  - Extract: faces, edges, holes, B-rep topology, bounding box
  - Detect datum candidates (largest flat faces)
  - Convert STEP → GLTF (for Three.js viewport)
  - Geometric validation: manifold check, self-intersection, wall thickness
  - Export final fixture to STEP after generation

Stack:
  Python · pythonocc-core · numpy · trimesh
  Runs as a Celery worker (heavy, CPU-bound)
```

### 3. Gemini Service
```
Responsibilities:
  - Intent classification (Flash - fast)
  - KCL code generation for fixture geometry (Pro - complex)
  - Node graph JSON generation (Pro)
  - DFM contextual analysis (Flash)
  - Streaming conversational responses (Flash)

Models:
  gemini-2.0-flash  → chat, intent, DFM explanation, streaming
  gemini-2.0-pro    → KCL codegen, node graph, constraint solving

Key prompts:
  /prompts/kcl_generation.txt         ← generates fixture KCL from context
  /prompts/node_graph_generation.txt  ← generates node graph JSON
  /prompts/dfm_analysis.txt           ← contextual DFM with engineering knowledge
  /prompts/intent_classification.txt  ← routes message to correct handler
```

### 4. Zoo.dev Integration
```
Responsibilities:
  - Compile KCL code into 3D geometry
  - Return GLTF/GLB for Three.js viewport
  - Handle: extrude, boolean ops, fillet, chamfer, linear/circular pattern

API:
  POST https://api.zoo.dev/file/conversion
  Body: { kcl: "<generated KCL code>", output_format: "gltf" }
  Returns: { gltf_url: "...", geometry_stats: {...} }

KCL covers:
  - Base plate (extruded sketch)
  - Bushing seats (circular pattern + counterbore)
  - Locating pin holes (2× cylinder subtract)
  - Clamp slots (swept profile)
  - Support pad bosses (extruded rectangles)
  - Chamfers / fillets
  - Mounting hole pattern (Siegmund 28mm grid)
```

### 5. Validation Engine
```
Responsibilities:
  - Run per-method DFM checks (FDM, CNC, Laser, Metal SLS)
  - Run functional checks (3-2-1, clamping force, deflection)
  - Run standards checks (GD&T, AS9100, IATF 16949)
  - Produce structured issue list: severity, location, fix suggestion

Implementation:
  FDM rules:    pure Python + numpy (geometry math from OCCT output)
  CNC rules:    OCCT topology query (corner radii, pocket depth)
  Laser rules:  simple Z-height analysis
  Functional:   linear algebra (constraint matrix), numpy force calc
  Standards:    rule table + Gemini Flash for contextual checks

Output schema:
  ValidationIssue {
    id, method, severity (error|warning|info|ok),
    title, detail, location (xyz), node_ref, fix_suggestion
  }
```

### 6. Celery + Redis Job Queue
```
Job types:
  process_step_upload     → OCCT parse + GLTF convert (heavy, ~30s)
  generate_fixture        → Gemini KCL gen + Zoo.dev compile (~15s)
  run_validation          → All DFM checks (~5s)
  regenerate_subgraph     → Re-run only affected nodes (~8s)
  export_step             → OCCT assembly → STEP file
  generate_drawing        → Drawing JSON + PDF export

Queue:
  high_priority: chat messages, node edits
  normal:        validation, subgraph re-run
  low:           full generation, export
```

---

## Data Models (PostgreSQL via Supabase)

```sql
-- Core project
projects (
  id UUID PK, name TEXT, part_number TEXT, revision TEXT,
  template_id TEXT, status TEXT,  -- draft | generating | ready | error
  environment_json JSONB,         -- surface, robot, face_up, notes
  printer_profile_json JSONB,     -- machine, nozzle, layer, material, orientation
  gdt_standard TEXT, quality_standard TEXT,
  user_id UUID FK, org_id UUID FK,
  created_at, updated_at
)

-- Uploaded part geometry
part_geometries (
  id UUID PK, project_id UUID FK,
  step_file_url TEXT,             -- R2 path to uploaded STEP
  gltf_url TEXT,                  -- R2 path to converted GLTF
  features_json JSONB,            -- faces, holes, bounding box, datum candidates
  dimensions_json JSONB,          -- { x: 150, y: 100, z: 8, unit: 'mm' }
  material TEXT
)

-- AI-generated fixture geometry
fixture_geometries (
  id UUID PK, project_id UUID FK, version INT,
  kcl TEXT,                       -- KCL source code (Gemini-generated)
  gltf_url TEXT,                  -- R2 path to Zoo.dev output GLTF
  generation_prompt TEXT,         -- full prompt sent to Gemini
  generated_at TIMESTAMP
)

-- Parametric node graph
node_graphs (
  id UUID PK, project_id UUID FK,
  nodes_json JSONB,               -- array of NodeDef objects
  connections_json JSONB,         -- array of Connection objects
  generated_at TIMESTAMP
)

-- Touchpoints
touchpoints (
  id UUID PK, project_id UUID FK,
  label TEXT, type TEXT,          -- locating | clamping | support
  face_id TEXT,                   -- OCCT face reference
  coords_json JSONB,              -- { x, y, z }
  detail TEXT, force_n FLOAT
)

-- Validation results
validation_results (
  id UUID PK, project_id UUID FK,
  method TEXT,                    -- fdm | cnc | laser | functional | standards
  issues_json JSONB,              -- array of ValidationIssue
  error_count INT, warning_count INT,
  ran_at TIMESTAMP
)

-- Drawing
drawings (
  id UUID PK, project_id UUID FK, revision TEXT,
  title_block_json JSONB, bom_json JSONB,
  views_json JSONB, gdt_callouts_json JSONB,
  pdf_url TEXT
)

-- BOM items
bom_items (
  id UUID PK, project_id UUID FK,
  item_no INT, part_number TEXT, description TEXT,
  quantity INT, material TEXT, finish TEXT
)

-- Conversations
conversation_messages (
  id UUID PK, project_id UUID FK,
  role TEXT,                      -- user | assistant
  content TEXT, attachments JSONB,
  linked_node_id TEXT,            -- optional node reference
  created_at TIMESTAMP
)
```

---

## Full Request Flows — Key User Actions

### Flow 1: Upload a STEP file

```
Browser                  FastAPI              Celery              OCCT              R2           Supabase
   │                        │                   │                   │                │               │
   │──POST /upload/step─────▶│                   │                   │                │               │
   │                        │──store raw file───▶────────────────────────────────────▶│               │
   │                        │──queue job─────────▶│                   │               │               │
   │◀─202 job_id────────────│                   │                   │                │               │
   │                        │                   │──run parse────────▶│               │               │
   │                        │                   │                   │──extract faces─▶               │
   │                        │                   │                   │──convert GLTF──▶               │
   │                        │                   │                   │──save GLTF─────────────────────▶│
   │                        │                   │◀─done─────────────│                │               │
   │                        │                   │──save features────────────────────────────────────▶│
   │◀─WS: geometry_ready────│◀──emit event───────│                   │                │               │
   │──load GLTF from R2─────────────────────────────────────────────────────────────▶│               │
   │  (Viewport3D renders 3D part)
```

### Flow 2: "Generate drill jig" — Full Generation

```
Browser            FastAPI          Celery        Gemini 2.0 Pro    Zoo.dev       Supabase / R2
   │                  │               │                 │              │                │
   │──WS: chat msg────▶│               │                 │              │                │
   │                  │──classify intent──────────────── Gemini Flash  │                │
   │                  │  = fixture_generation             │              │                │
   │                  │──queue gen job─▶│                 │              │                │
   │◀─WS: "Generating"│               │                 │              │                │
   │                  │               │──assemble ctx───▶│              │                │
   │                  │               │  (part features + TPs           │                │
   │                  │               │   + environment + printer)      │                │
   │                  │               │                 │──generate KCL│                │
   │                  │               │◀─KCL code───────│              │                │
   │◀─WS: "Compiling" │               │──POST KCL──────────────────────▶│               │
   │                  │               │◀─GLTF URL──────────────────────│               │
   │                  │               │──save GLTF─────────────────────────────────────▶│
   │                  │               │──gen node graph─▶│              │                │
   │                  │               │◀─node graph JSON─│              │                │
   │                  │               │──run validation──────────────── (Validation Eng) │
   │                  │               │──save all─────────────────────────────────────▶│
   │◀─WS: fixture_ready│◀─emit─────────│                 │              │                │
   │──load GLTF───────────────────────────────────────────────────────▶│               │
   │  Viewport3D: renders fixture + part + environment in 3D           │                │
   │  NodeEditor: renders AI node graph                                │                │
   │  ValidationPanel: shows live DFM results                          │                │
   │  ChatPanel: streams explanation from Gemini Flash                 │                │
```

### Flow 3: Edit node parameter → sub-graph re-run

```
Browser           FastAPI         Celery       Gemini Pro      Zoo.dev       Supabase
   │                 │              │               │              │              │
   │─PATCH /nodes/bushing-seats──▶ │              │               │              │
   │  { bore_id: "12mm" }          │              │               │              │
   │                 │─update DB───────────────────────────────────────────────▶│
   │                 │─queue subgraph─▶│           │               │              │
   │◀─200 accepted───│              │               │              │              │
   │                 │              │──affected nodes: [tolerance, dfm, output]  │
   │                 │              │──regen KCL for affected────▶ │              │
   │                 │              │◀─updated KCL──────────────── │              │
   │                 │              │──compile───────────────────────────────────▶│
   │                 │              │◀─new GLTF─────────────────────────────────│
   │                 │              │──re-run validation───────────(Validation Eng)
   │◀─WS: subgraph_done────────────│               │              │              │
   │  Viewport3D: geometry updates live
   │  ValidationPanel: error count updates
   │  NodeEditor: updated node params shown
```

---

## Infrastructure

```
Service            Provider           Tier / Specs
─────────────────────────────────────────────────────────────────
Frontend           Vercel             Pro (auto-scaling, CDN)
Backend API        Railway            2× Python instances
OCCT Workers       Railway            4× CPU-heavy workers (2 vCPU each)
Database           Supabase           Pro (8GB storage, connection pooling)
File Storage       Cloudflare R2      (STEP, GLTF, exports, PDFs)
Job Queue          Upstash Redis      (managed Redis, 10k ops/day free tier)
AI - Gemini        Google AI Studio   Flash + Pro API keys
CAD Kernel         Zoo.dev            API (per-request billing)
3D Assets          Bundled in Vercel  Siegmund table GLB, robot GLBs (~5MB total)
```

---

## External API Summary

| API | Used For | Called By | Cost Model |
|---|---|---|---|
| **Zoo.dev** | KCL → GLTF compilation, actual CAD geometry | Celery worker | Per API call |
| **Gemini 2.0 Flash** | Chat, intent, DFM explanation, streaming | FastAPI WebSocket | Per token |
| **Gemini 2.0 Pro** | KCL generation, node graph, constraint solving | Celery worker | Per token (higher) |
| **Supabase** | PostgreSQL, auth, realtime | FastAPI | Row-based |
| **Cloudflare R2** | STEP, GLTF, PDF storage | FastAPI + OCCT | Per GB stored + egress |

---

## Environment Variables

```bash
# AI
GEMINI_API_KEY=...
GEMINI_FLASH_MODEL=gemini-2.0-flash
GEMINI_PRO_MODEL=gemini-2.0-pro

# CAD Kernel
ZOO_API_KEY=...
ZOO_API_URL=https://api.zoo.dev

# Database
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
DATABASE_URL=postgresql://...

# Storage
R2_ACCOUNT_ID=...
R2_ACCESS_KEY=...
R2_SECRET_KEY=...
R2_BUCKET=scalecad-files
R2_PUBLIC_URL=https://files.scalecad.app

# Job queue
REDIS_URL=redis://...

# App
CORS_ORIGINS=https://scalecad.app,http://localhost:5173
SECRET_KEY=...
```

---

## Build Order (Backend Scaffold Sequence)

```
1.  FastAPI skeleton          → auth, CORS, health check, project CRUD
2.  Supabase schema           → run migrations for all tables above
3.  R2 storage integration    → file upload endpoint, signed URL generation
4.  OCCT service              → STEP parse + GLTF convert (Celery worker)
5.  Zoo.dev integration       → KCL → GLTF endpoint
6.  Gemini KCL prompt         → core prompt engineering (most critical)
7.  Generation pipeline       → wires steps 4-6 end-to-end with WebSocket progress
8.  Validation engine         → FDM + functional rules first (highest value)
9.  Node graph generation     → Gemini Pro → structured JSON
10. Drawing + export          → STEP/STL/3MF export, PDF drawing
11. Frontend wiring           → replace all dummy data with live API calls
```
