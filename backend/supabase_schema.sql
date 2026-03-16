-- ScaleCAD Supabase / PostgreSQL schema
-- Run this in the Supabase SQL editor or psql

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Projects ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL,
  name                 TEXT NOT NULL,
  part_number          TEXT,
  revision             TEXT,
  template_id          TEXT,
  gdt_standard         TEXT DEFAULT 'ASME Y14.5-2018',
  quality_standard     TEXT,
  status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','active','released','archived')),
  environment_json     JSONB,
  printer_profile_json JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON projects(user_id);
CREATE INDEX ON projects(updated_at DESC);

-- ── Part geometries (STEP upload → OCCT processing) ───────────────────────────
CREATE TABLE IF NOT EXISTS part_geometries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  step_file_url     TEXT NOT NULL,
  gltf_url          TEXT,
  features_json     JSONB,
  processing_status TEXT NOT NULL DEFAULT 'pending'
                      CHECK (processing_status IN ('pending','processing','ready','error')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON part_geometries(project_id);

-- ── Fixture geometries (KCL → Zoo.dev compile) ────────────────────────────────
CREATE TABLE IF NOT EXISTS fixture_geometries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version           INTEGER NOT NULL DEFAULT 1,
  kcl               TEXT,
  gltf_url          TEXT,
  generation_prompt TEXT,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON fixture_geometries(project_id);
CREATE UNIQUE INDEX ON fixture_geometries(project_id, version);

-- ── Node graphs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS node_graphs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nodes_json       JSONB NOT NULL DEFAULT '[]',
  connections_json JSONB NOT NULL DEFAULT '[]',
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON node_graphs(project_id);

-- ── Touchpoints ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS touchpoints (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('locating','clamping','support')),
  face_id    TEXT NOT NULL,
  coords_json JSONB NOT NULL,
  detail     TEXT,
  force_n    NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON touchpoints(project_id);

-- ── Validation results ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS validation_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  method        TEXT NOT NULL CHECK (method IN ('fdm','cnc','laser','functional','standards')),
  issues_json   JSONB NOT NULL DEFAULT '[]',
  error_count   INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  ran_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON validation_results(project_id, ran_at DESC);

-- ── Conversation messages ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  attachments     JSONB NOT NULL DEFAULT '[]',
  linked_node_id  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON conversation_messages(project_id, created_at);

-- ── BOM items ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bom_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_no     INTEGER NOT NULL,
  part_number TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  material    TEXT DEFAULT '',
  finish      TEXT DEFAULT ''
);
CREATE INDEX ON bom_items(project_id);

-- ── Drawings ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drawings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  pdf_url    TEXT,
  svg_json   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON drawings(project_id);

-- ── Organizations + RBAC ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  itar_restricted  BOOLEAN DEFAULT FALSE,
  data_residency   TEXT DEFAULT 'us',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  role       TEXT NOT NULL DEFAULT 'engineer'
               CHECK (role IN ('admin','engineer','reviewer','viewer')),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);
CREATE INDEX ON org_members(org_id);
CREATE INDEX ON org_members(user_id);

-- Add org_id to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(org_id);

-- ── Hardware catalog ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hardware_catalog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_number TEXT NOT NULL,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL CHECK (category IN ('bushing','clamp','locator','support','fastener','flange','suction','pin')),
  supplier    TEXT NOT NULL,
  specs_json  JSONB NOT NULL DEFAULT '{}',
  price_usd   NUMERIC(10,4),
  in_stock    BOOLEAN DEFAULT TRUE,
  preferred   BOOLEAN DEFAULT FALSE,
  search_vec  TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', name || ' ' || part_number || ' ' || supplier)
  ) STORED
);
CREATE INDEX ON hardware_catalog USING GIN(search_vec);
CREATE INDEX ON hardware_catalog(category);
CREATE INDEX ON hardware_catalog(supplier);

-- ── Revisions (ECR workflow) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS revisions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rev_letter   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'in-review'
                 CHECK (status IN ('prototype','in-review','released','obsolete')),
  ecr_number   TEXT,
  description  TEXT NOT NULL DEFAULT '',
  author_id    UUID NOT NULL,
  changes_json JSONB NOT NULL DEFAULT '[]',
  approved_by  UUID,
  approved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON revisions(project_id, created_at DESC);

-- ── Audit log ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID REFERENCES organizations(id),
  user_id       UUID NOT NULL,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  metadata_json JSONB DEFAULT '{}',
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON audit_log(org_id, created_at DESC);
CREATE INDEX ON audit_log(user_id, created_at DESC);

-- ── Row-level security (RLS) — users can only see their own projects ────────────
ALTER TABLE projects           ENABLE ROW LEVEL SECURITY;
ALTER TABLE part_geometries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_geometries ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_graphs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE touchpoints        ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawings           ENABLE ROW LEVEL SECURITY;

-- Projects: owner sees all their rows
CREATE POLICY "owner_access" ON projects
  USING (user_id = auth.uid());

-- Sub-tables: access via project ownership
CREATE POLICY "owner_access" ON part_geometries
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
CREATE POLICY "owner_access" ON fixture_geometries
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
CREATE POLICY "owner_access" ON node_graphs
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
CREATE POLICY "owner_access" ON touchpoints
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
CREATE POLICY "owner_access" ON validation_results
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
CREATE POLICY "owner_access" ON conversation_messages
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
CREATE POLICY "owner_access" ON bom_items
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
CREATE POLICY "owner_access" ON drawings
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
