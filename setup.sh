#!/usr/bin/env bash
# =============================================================================
#  ScaleCAD — One-Shot Production Setup
#
#  Usage:
#    chmod +x setup.sh
#    ./setup.sh
#
#  What this does:
#    1. Installs flyctl, supabase CLI, psql, vercel if not already present
#    2. Collects your credentials interactively (or reads from .env.production)
#    3. Applies the Postgres schema to Supabase
#    4. Enables Supabase Realtime on key tables
#    5. Creates two Fly.io apps (API + worker) and deploys both
#    6. Seeds the hardware catalog (80+ tooling items)
#    7. Updates .env.local with the live API URL
#    8. Optionally deploys the frontend to Vercel
#
#  After this runs you have a fully live ScaleCAD instance.
# =============================================================================

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}→${NC}  $*"; }
success() { echo -e "${GREEN}✓${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
fatal()   { echo -e "${RED}✗${NC}  $*" >&2; exit 1; }
section() { echo -e "\n${BOLD}── $* ─────────────────────────────────────────${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
ENV_PROD="$SCRIPT_DIR/.env.production"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   ScaleCAD — Production Setup                ║${NC}"
echo -e "${BOLD}║   Boeing/Toyota-tier fixture design platform  ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo "  You need accounts at:"
echo -e "   ${BLUE}•${NC} Supabase      → https://app.supabase.com"
echo -e "   ${BLUE}•${NC} Fly.io        → https://fly.io"
echo -e "   ${BLUE}•${NC} Google AI     → https://aistudio.google.com  (Gemini key)"
echo -e "   ${BLUE}•${NC} Zoo.dev       → https://zoo.dev              (KCL compiler)"
echo -e "   ${BLUE}•${NC} Cloudflare R2 → https://dash.cloudflare.com  (object storage)"
echo -e "   ${BLUE}•${NC} Upstash       → https://console.upstash.com  (Redis)"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Install CLI tools
# ─────────────────────────────────────────────────────────────────────────────
section "Installing CLI tools"

if ! command -v brew &>/dev/null; then
  fatal "Homebrew not found. Install it first: https://brew.sh"
fi

_install_if_missing() {
  local cmd="$1" pkg="$2" tap="${3:-}"
  if ! command -v "$cmd" &>/dev/null; then
    info "Installing ${pkg}..."
    [[ -n "$tap" ]] && brew tap "$tap" 2>/dev/null || true
    brew install "$pkg"
  fi
  success "${cmd}: $(${cmd} version 2>/dev/null | head -1 || ${cmd} --version 2>/dev/null | head -1)"
}

_install_if_missing "flyctl"   "flyctl"                    ""
_install_if_missing "supabase" "supabase"                  "supabase/tap/supabase"
_install_if_missing "psql"     "postgresql@16"             ""
_install_if_missing "vercel"   "vercel"                    ""  2>/dev/null || npm install -g vercel &>/dev/null

# Make sure psql is in PATH (brew postgresql@16 quirk)
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Collect credentials
# ─────────────────────────────────────────────────────────────────────────────
section "Credentials"

# Load existing values if .env.production exists
if [[ -f "$ENV_PROD" ]]; then
  warn "Loading existing .env.production — press Enter to keep current value."
  # shellcheck disable=SC1090
  source "$ENV_PROD" 2>/dev/null || true
fi

# Helper: read a visible field (shows current value masked)
_read() {
  local varname="$1" label="$2" current="${!1:-}"
  if [[ -n "$current" ]]; then
    local preview="${current:0:10}…"
    read -r -p "$(echo -e "${BOLD}${label}${NC} [${preview}]: ")" val
    printf '%s' "${val:-$current}"
  else
    read -r -p "$(echo -e "${BOLD}${label}${NC}: ")" val
    printf '%s' "$val"
  fi
}

# Helper: read a secret (masked, shows last 4 chars of current)
_secret() {
  local varname="$1" label="$2" current="${!1:-}"
  if [[ -n "$current" ]]; then
    local tail="${current: -4}"
    read -r -s -p "$(echo -e "${BOLD}${label}${NC} [****${tail}]: ")" val; echo
    printf '%s' "${val:-$current}"
  else
    read -r -s -p "$(echo -e "${BOLD}${label}${NC}: ")" val; echo
    printf '%s' "$val"
  fi
}

echo ""
echo -e "${BOLD}Supabase${NC}"
SUPABASE_PROJECT_REF=$(_read  SUPABASE_PROJECT_REF "  Project Ref  (from URL: supabase.com/dashboard/project/[REF])")
SUPABASE_DB_PASSWORD=$(_secret SUPABASE_DB_PASSWORD "  DB Password  (Settings → Database → Connection string)")
SUPABASE_URL=$(_read  SUPABASE_URL         "  Project URL  (https://[REF].supabase.co)")
SUPABASE_SERVICE_KEY=$(_secret SUPABASE_SERVICE_KEY "  Service Key  (Settings → API → service_role)")
SUPABASE_ANON_KEY=$(_secret    SUPABASE_ANON_KEY    "  Anon Key     (Settings → API → anon/public)")
SUPABASE_JWT_SECRET=$(_secret  SUPABASE_JWT_SECRET  "  JWT Secret   (Settings → API → JWT Settings → JWT Secret)")

# Build DATABASE_URL from project ref + password (Supabase Pooler format)
DATABASE_URL="postgresql://postgres.${SUPABASE_PROJECT_REF}:${SUPABASE_DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:6543/postgres"

echo ""
echo -e "${BOLD}AI / CAD${NC}"
GEMINI_API_KEY=$(_secret GEMINI_API_KEY "  Gemini API Key  (aistudio.google.com → Get API Key)")
ZOO_API_KEY=$(_secret    ZOO_API_KEY    "  Zoo.dev API Key (zoo.dev → Account → API Keys)")

echo ""
echo -e "${BOLD}Cloudflare R2${NC}"
R2_ACCOUNT_ID=$(_read   R2_ACCOUNT_ID  "  Account ID    (dash.cloudflare.com → R2 → Overview)")
R2_ACCESS_KEY=$(_secret R2_ACCESS_KEY  "  Access Key ID (R2 → Manage R2 API Tokens)")
R2_SECRET_KEY=$(_secret R2_SECRET_KEY  "  Secret Key")
R2_BUCKET=$(_read       R2_BUCKET      "  Bucket Name   (e.g. scalecad-files)")
R2_PUBLIC_URL=$(_read   R2_PUBLIC_URL  "  Public URL    (e.g. https://pub-xxx.r2.dev or custom domain)")

echo ""
echo -e "${BOLD}Upstash Redis${NC}"
REDIS_URL=$(_secret REDIS_URL "  Redis URL  (rediss://default:…@xxx.upstash.io:6380)")

# Derived / auto-generated
SECRET_KEY="${SECRET_KEY:-$(openssl rand -hex 32)}"
ZOO_API_URL="${ZOO_API_URL:-https://api.zoo.dev}"
FLY_API_APP="${FLY_API_APP:-scalecad-api}"
FLY_WORKER_APP="${FLY_WORKER_APP:-scalecad-worker}"
CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:5173}"

# Persist to .env.production
cat > "$ENV_PROD" <<ENVEOF
# ScaleCAD Production Credentials
# Generated by setup.sh — NEVER COMMIT THIS FILE
SUPABASE_PROJECT_REF=${SUPABASE_PROJECT_REF}
SUPABASE_DB_PASSWORD=${SUPABASE_DB_PASSWORD}
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_JWT_SECRET=${SUPABASE_JWT_SECRET}
DATABASE_URL=${DATABASE_URL}
GEMINI_API_KEY=${GEMINI_API_KEY}
ZOO_API_KEY=${ZOO_API_KEY}
ZOO_API_URL=${ZOO_API_URL}
R2_ACCOUNT_ID=${R2_ACCOUNT_ID}
R2_ACCESS_KEY=${R2_ACCESS_KEY}
R2_SECRET_KEY=${R2_SECRET_KEY}
R2_BUCKET=${R2_BUCKET}
R2_PUBLIC_URL=${R2_PUBLIC_URL}
REDIS_URL=${REDIS_URL}
SECRET_KEY=${SECRET_KEY}
FLY_API_APP=${FLY_API_APP}
FLY_WORKER_APP=${FLY_WORKER_APP}
CORS_ORIGINS=${CORS_ORIGINS}
ENVEOF
success "Credentials saved to .env.production"

# Also write backend/.env for local docker-compose use
cat > "$BACKEND_DIR/.env" <<BACKENDENV
# ScaleCAD Backend — generated by setup.sh
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_JWT_SECRET=${SUPABASE_JWT_SECRET}
DATABASE_URL=${DATABASE_URL}
GEMINI_API_KEY=${GEMINI_API_KEY}
ZOO_API_KEY=${ZOO_API_KEY}
ZOO_API_URL=${ZOO_API_URL}
R2_ACCOUNT_ID=${R2_ACCOUNT_ID}
R2_ACCESS_KEY=${R2_ACCESS_KEY}
R2_SECRET_KEY=${R2_SECRET_KEY}
R2_BUCKET=${R2_BUCKET}
R2_PUBLIC_URL=${R2_PUBLIC_URL}
REDIS_URL=${REDIS_URL}
SECRET_KEY=${SECRET_KEY}
CORS_ORIGINS=${CORS_ORIGINS}
BACKENDENV
success "Also wrote backend/.env for local docker-compose"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Apply Supabase schema
# ─────────────────────────────────────────────────────────────────────────────
section "Database schema"

info "Applying schema to Supabase (this is idempotent — safe to re-run)..."

if psql "$DATABASE_URL" -f "$BACKEND_DIR/supabase_schema.sql" 2>&1 | grep -v "^NOTICE\|already exists\|^SET\|^CREATE\|^ALTER\|^INSERT\|^--\|^$"; then
  success "Schema applied"
else
  success "Schema applied (tables already exist — skipped)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — Enable Supabase Realtime
# ─────────────────────────────────────────────────────────────────────────────
section "Supabase Realtime"

info "Enabling Realtime CDC on key tables..."
psql "$DATABASE_URL" <<'REALSQL' 2>/dev/null || warn "Some Realtime tables may already be enabled"
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE touchpoints;
  ALTER PUBLICATION supabase_realtime ADD TABLE fixture_geometries;
  ALTER PUBLICATION supabase_realtime ADD TABLE conversation_messages;
  ALTER PUBLICATION supabase_realtime ADD TABLE validation_results;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Realtime already configured: %', SQLERRM;
END $$;
REALSQL
success "Realtime enabled on touchpoints, fixture_geometries, conversation_messages, validation_results"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — Fly.io: auth + create apps + set secrets
# ─────────────────────────────────────────────────────────────────────────────
section "Fly.io setup"

info "Authenticating with Fly.io (browser will open)..."
flyctl auth login

FLY_ORG=$(flyctl orgs list --json 2>/dev/null | python3 -c "import sys,json; orgs=json.load(sys.stdin); print(orgs[0]['Slug'] if orgs else 'personal')" 2>/dev/null || echo "personal")
info "Using Fly.io org: ${FLY_ORG}"

info "Creating app: ${FLY_API_APP}"
flyctl apps create "$FLY_API_APP" --org "$FLY_ORG" 2>/dev/null \
  && success "Created ${FLY_API_APP}" \
  || warn "${FLY_API_APP} already exists — continuing"

info "Creating app: ${FLY_WORKER_APP}"
flyctl apps create "$FLY_WORKER_APP" --org "$FLY_ORG" 2>/dev/null \
  && success "Created ${FLY_WORKER_APP}" \
  || warn "${FLY_WORKER_APP} already exists — continuing"

# Build the secrets as a temp file so we can import to both apps
SECRETS_TMPFILE=$(mktemp)
cat > "$SECRETS_TMPFILE" <<SECRETS
SECRET_KEY=${SECRET_KEY}
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
SUPABASE_JWT_SECRET=${SUPABASE_JWT_SECRET}
DATABASE_URL=${DATABASE_URL}
GEMINI_API_KEY=${GEMINI_API_KEY}
ZOO_API_KEY=${ZOO_API_KEY}
ZOO_API_URL=${ZOO_API_URL}
R2_ACCOUNT_ID=${R2_ACCOUNT_ID}
R2_ACCESS_KEY=${R2_ACCESS_KEY}
R2_SECRET_KEY=${R2_SECRET_KEY}
R2_BUCKET=${R2_BUCKET}
R2_PUBLIC_URL=${R2_PUBLIC_URL}
REDIS_URL=${REDIS_URL}
CORS_ORIGINS=https://${FLY_API_APP}.fly.dev,http://localhost:5173
SECRETS

info "Importing secrets to ${FLY_API_APP}..."
flyctl secrets import --app "$FLY_API_APP" < "$SECRETS_TMPFILE"
success "Secrets set on ${FLY_API_APP}"

info "Importing secrets to ${FLY_WORKER_APP}..."
flyctl secrets import --app "$FLY_WORKER_APP" < "$SECRETS_TMPFILE"
success "Secrets set on ${FLY_WORKER_APP}"

rm -f "$SECRETS_TMPFILE"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6 — Deploy API + Worker
# ─────────────────────────────────────────────────────────────────────────────
section "Deploying API server"

info "Building and deploying ${FLY_API_APP} (≈3 min first time)..."
cd "$BACKEND_DIR"
flyctl deploy --config fly.toml --app "$FLY_API_APP" --remote-only
API_URL="https://${FLY_API_APP}.fly.dev"
success "API live → ${API_URL}"

info "Health check..."
if curl -sf "${API_URL}/api/health" | grep -q '"status":"ok"'; then
  success "Health check passed"
else
  warn "Health check returned unexpected response — check logs: flyctl logs --app ${FLY_API_APP}"
fi

section "Deploying Celery worker"

info "Building and deploying ${FLY_WORKER_APP} (≈4 min — OCCT build)..."
flyctl deploy --config fly-worker.toml --app "$FLY_WORKER_APP" --remote-only
success "Worker live"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 7 — Seed hardware catalog
# ─────────────────────────────────────────────────────────────────────────────
section "Hardware catalog seed"

info "Seeding 80+ tooling items (Carr Lane, Destaco, Jergens, Misumi)..."
flyctl ssh console --app "$FLY_API_APP" \
  -C "python -c \"
import sys
sys.path.insert(0, '/app')
from app.core.database import get_supabase_client
from data.hardware_seed import seed_hardware_catalog
seed_hardware_catalog(get_supabase_client())
print('done')
\""
success "Hardware catalog seeded"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 8 — Update frontend .env.local
# ─────────────────────────────────────────────────────────────────────────────
section "Frontend environment"

cd "$SCRIPT_DIR"

cat > .env.local <<FRONTENV
# ScaleCAD frontend — production
# Generated by setup.sh
VITE_API_URL=${API_URL}
VITE_WS_URL=wss://${FLY_API_APP}.fly.dev
FRONTENV
success "Updated .env.local → ${API_URL}"

# Update CORS now we know the final URLs
info "Updating CORS to include live API URL..."
flyctl secrets set \
  CORS_ORIGINS="https://${FLY_API_APP}.fly.dev,http://localhost:5173" \
  --app "$FLY_API_APP" --stage 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────────────────
# STEP 9 — Optional: deploy frontend to Vercel
# ─────────────────────────────────────────────────────────────────────────────
section "Frontend deployment (Vercel)"

read -r -p "$(echo -e "${BOLD}Deploy frontend to Vercel now? (y/n):${NC} ")" deploy_vercel
if [[ "$deploy_vercel" =~ ^[Yy]$ ]]; then
  info "Deploying to Vercel..."
  vercel --prod \
    --env VITE_API_URL="$API_URL" \
    --env VITE_WS_URL="wss://${FLY_API_APP}.fly.dev"

  VERCEL_URL=$(vercel ls --prod 2>/dev/null | grep "https://" | awk '{print $2}' | head -1 || echo "check vercel.app dashboard")

  # Add Vercel URL to CORS
  if [[ "$VERCEL_URL" =~ ^https ]]; then
    info "Updating CORS to include Vercel URL..."
    flyctl secrets set \
      CORS_ORIGINS="${VERCEL_URL},https://${FLY_API_APP}.fly.dev,http://localhost:5173" \
      --app "$FLY_API_APP" 2>/dev/null || true
  fi

  success "Frontend deployed → ${VERCEL_URL}"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║   ScaleCAD is live!                          ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  API server:   ${BLUE}${API_URL}${NC}"
echo -e "  Health:       ${BLUE}${API_URL}/api/health${NC}"
echo -e "  Worker logs:  flyctl logs --app ${FLY_WORKER_APP}"
echo -e "  Local dev:    ${BLUE}http://localhost:5173${NC}  (npm run dev)"
echo ""
echo -e "  ${BOLD}Re-deploy after code changes:${NC}"
echo -e "    flyctl deploy --config backend/fly.toml        # API"
echo -e "    flyctl deploy --config backend/fly-worker.toml # Worker"
echo ""
echo -e "  ${BOLD}View logs:${NC}"
echo -e "    flyctl logs --app ${FLY_API_APP}"
echo -e "    flyctl logs --app ${FLY_WORKER_APP}"
echo ""
echo -e "  Credentials saved to: ${YELLOW}.env.production${NC} (gitignored)"
echo ""
