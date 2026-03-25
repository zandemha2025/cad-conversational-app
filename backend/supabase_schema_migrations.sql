-- ScaleCAD Schema Migrations
-- Apply against: postgresql://postgres.bvlbwhtzythklpkfdbvb:...@aws-1-us-east-1.pooler.supabase.com:5432/postgres

-- ── Extensions (idempotent) ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Ensure base tables exist (from supabase_schema.sql) ───────────────────────
-- (Re-run idempotently; all use CREATE TABLE IF NOT EXISTS)

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
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);

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
CREATE INDEX IF NOT EXISTS idx_part_geometries_pid ON part_geometries(project_id);

CREATE TABLE IF NOT EXISTS fixture_geometries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version           INTEGER NOT NULL DEFAULT 1,
  kcl               TEXT,
  gltf_url          TEXT,
  generation_prompt TEXT,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fixture_geometries_pid ON fixture_geometries(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fixture_geometries_pid_ver ON fixture_geometries(project_id, version);

CREATE TABLE IF NOT EXISTS node_graphs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  nodes_json       JSONB NOT NULL DEFAULT '[]',
  connections_json JSONB NOT NULL DEFAULT '[]',
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_node_graphs_pid ON node_graphs(project_id);

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
CREATE INDEX IF NOT EXISTS idx_touchpoints_pid ON touchpoints(project_id);

CREATE TABLE IF NOT EXISTS validation_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  method        TEXT NOT NULL CHECK (method IN ('fdm','cnc','laser','functional','standards')),
  issues_json   JSONB NOT NULL DEFAULT '[]',
  error_count   INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  ran_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_validation_results_pid ON validation_results(project_id, ran_at DESC);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  attachments     JSONB NOT NULL DEFAULT '[]',
  linked_node_id  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conv_msgs_pid ON conversation_messages(project_id, created_at);

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
CREATE INDEX IF NOT EXISTS idx_bom_items_pid ON bom_items(project_id);

CREATE TABLE IF NOT EXISTS drawings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  pdf_url    TEXT,
  svg_json   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_drawings_pid ON drawings(project_id);

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
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON org_members(user_id);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS idx_projects_org_id ON projects(org_id);

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
CREATE INDEX IF NOT EXISTS idx_hardware_catalog_search ON hardware_catalog USING GIN(search_vec);
CREATE INDEX IF NOT EXISTS idx_hardware_catalog_cat ON hardware_catalog(category);
CREATE INDEX IF NOT EXISTS idx_hardware_catalog_sup ON hardware_catalog(supplier);

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
CREATE INDEX IF NOT EXISTS idx_revisions_pid ON revisions(project_id, created_at DESC);

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
CREATE INDEX IF NOT EXISTS idx_audit_log_org ON audit_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, created_at DESC);

-- ── NEW: Approval_status on projects ──────────────────────────────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'none'
  CHECK (approval_status IN ('none','pending','approved','rejected'));

-- ── NEW: Approvals table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected')),
  submitted_by  UUID NOT NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by   UUID,
  reviewed_at   TIMESTAMPTZ,
  comments      TEXT DEFAULT '',
  revision_ref  TEXT DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approvals_pid ON approvals(project_id, created_at DESC);

-- ── NEW: Assembly constraints table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assembly_constraints (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('fixed','coincident','parallel','perpendicular','distance','angle')),
  part_a      TEXT NOT NULL,
  part_b      TEXT NOT NULL DEFAULT '',
  params_json JSONB NOT NULL DEFAULT '{}',
  is_valid    BOOLEAN DEFAULT NULL,
  error_msg   TEXT DEFAULT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asm_constraints_pid ON assembly_constraints(project_id);

-- ── NEW: Interference results cache table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS interference_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  results_json    JSONB NOT NULL DEFAULT '[]',
  total_pairs     INTEGER NOT NULL DEFAULT 0,
  interfering_pairs INTEGER NOT NULL DEFAULT 0,
  ran_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interference_pid ON interference_results(project_id, ran_at DESC);

-- ── RLS for new tables ────────────────────────────────────────────────────────
ALTER TABLE approvals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE assembly_constraints   ENABLE ROW LEVEL SECURITY;
ALTER TABLE interference_results   ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='approvals' AND policyname='owner_access') THEN
    CREATE POLICY "owner_access" ON approvals
      USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='assembly_constraints' AND policyname='owner_access') THEN
    CREATE POLICY "owner_access" ON assembly_constraints
      USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='interference_results' AND policyname='owner_access') THEN
    CREATE POLICY "owner_access" ON interference_results
      USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
  END IF;
END$$;

-- ── Seed hardware catalog if empty ────────────────────────────────────────────
INSERT INTO hardware_catalog (part_number, name, category, supplier, specs_json, price_usd, in_stock, preferred)
SELECT * FROM (VALUES
  ('SB-12-16', 'Steel Bushing 12mm bore 16mm OD', 'bushing', 'Carr Lane', '{"bore_mm":12,"od_mm":16,"material":"steel"}', 8.50, true, true),
  ('SB-16-22', 'Steel Bushing 16mm bore 22mm OD', 'bushing', 'Carr Lane', '{"bore_mm":16,"od_mm":22,"material":"steel"}', 11.25, true, true),
  ('LC-250-H', 'Toggle Clamp Horizontal 250N', 'clamp', 'Destaco', '{"force_n":250,"type":"horizontal","stroke_mm":15}', 32.00, true, true),
  ('LC-500-V', 'Toggle Clamp Vertical 500N', 'clamp', 'Destaco', '{"force_n":500,"type":"vertical","stroke_mm":25}', 48.50, true, false),
  ('LO-8-M', 'Diamond Locating Pin 8mm', 'locator', 'Carr Lane', '{"diameter_mm":8,"type":"diamond","material":"hardened_steel"}', 15.75, true, true),
  ('LO-12-M', 'Round Locating Pin 12mm', 'locator', 'Carr Lane', '{"diameter_mm":12,"type":"round","material":"hardened_steel"}', 19.50, true, true),
  ('SP-REST-M', 'Adjustable Support Rest', 'support', 'Renishaw', '{"travel_mm":20,"load_n":1000,"thread":"M12"}', 65.00, true, true),
  ('BLT-M8-30', 'Socket Head Cap Screw M8x30', 'fastener', 'Misumi', '{"thread":"M8","length_mm":30,"grade":"12.9","material":"alloy_steel"}', 1.20, true, false),
  ('BLT-M10-40', 'Socket Head Cap Screw M10x40', 'fastener', 'Misumi', '{"thread":"M10","length_mm":40,"grade":"12.9","material":"alloy_steel"}', 1.85, true, false),
  ('FL-PLATE-300', 'Fixture Plate 300x300 Siegmund', 'flange', 'Siegmund', '{"size_mm":"300x300","grid_mm":50,"material":"steel_nitride"}', 245.00, true, true),
  ('VAC-CUP-50', 'Vacuum Suction Cup 50mm', 'suction', 'Schmalz', '{"diameter_mm":50,"max_force_n":120,"bellows":true}', 28.00, true, false),
  ('PIN-D8-H', 'Hardened Dowel Pin D8x30', 'pin', 'Carr Lane', '{"diameter_mm":8,"length_mm":30,"material":"hardened_steel","tolerance":"h6"}', 4.50, true, true),
  ('PIN-D10-H', 'Hardened Dowel Pin D10x40', 'pin', 'Carr Lane', '{"diameter_mm":10,"length_mm":40,"material":"hardened_steel","tolerance":"h6"}', 6.25, true, false),
  ('LC-1000-V', 'Power Clamp Vertical 1000N', 'clamp', 'Destaco', '{"force_n":1000,"type":"vertical","stroke_mm":30,"powered":true}', 125.00, true, true),
  ('SB-20-28', 'Steel Bushing 20mm bore 28mm OD', 'bushing', 'Carr Lane', '{"bore_mm":20,"od_mm":28,"material":"steel"}', 14.00, true, false)
) AS v(part_number, name, category, supplier, specs_json, price_usd, in_stock, preferred)
WHERE NOT EXISTS (SELECT 1 FROM hardware_catalog LIMIT 1);

-- ── Feature 5: Assembly Components ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assembly_components (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id     UUID REFERENCES fixture_geometries(id) ON DELETE CASCADE,
  project_id     UUID REFERENCES projects(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  component_type TEXT,  -- 'base', 'clamp', 'pin', 'spacer', 'bracket', 'bushing', 'custom'
  description    TEXT,
  gltf_url       TEXT,
  position_json  JSONB,  -- {x, y, z} offset from assembly origin
  rotation_json  JSONB,  -- {x, y, z} euler angles
  material       TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assembly_components_project_id ON assembly_components(project_id);
CREATE INDEX IF NOT EXISTS idx_assembly_components_fixture_id ON assembly_components(fixture_id);

-- Done
SELECT 'ScaleCAD migrations applied successfully' AS result;
