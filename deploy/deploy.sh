#!/usr/bin/env bash
# One-command server deploy for NEST4AW: backend (API, Postgres, OCR, local LLM) + staff web app,
# behind the host's nginx with Let's Encrypt (certbot). Other nginx sites are left untouched.
# Run from the repo root, as root (or with sudo):
#   sudo bash deploy/deploy.sh
# Safe to re-run: secrets in backend/.env are kept, data volumes are kept, seeds are idempotent.
#
# Optional overrides (environment variables):
#   PUBLIC_IP=1.2.3.4            server's public IP (auto-detected)
#   APP_DOMAIN=app.example.com   your own domain for the web app (default: <ip>.sslip.io)
#   API_DOMAIN=api.example.com   your own domain for the API     (default: api.<ip>.sslip.io)
#   OLLAMA_MODEL=qwen2.5:1.5b    recipe model (default picked from RAM)
#   DEMO_PASSWORD=...            password for the fictional demo accounts (default nest-local-demo)
#   RESET_DB=1                   wipe the database volume and start fresh (demo data only)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ENV_FILE="$ROOT/backend/.env"
DEMO_PASSWORD="${DEMO_PASSWORD:-nest-local-demo}"
PROJECT="${COMPOSE_PROJECT_NAME:-backend}" # compose names the project after backend/

step() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mXX  %s\033[0m\n' "$*" >&2; exit 1; }

if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null || die "run as root"
  exec sudo -E bash "$0" "$@"
fi

# ---------------------------------------------------------------- 1. tools
step "Checking tools"
[ "$(uname -s)" = Linux ] || die "this script is for a Linux server"
missing=()
for tool in curl git openssl nginx certbot; do command -v "$tool" >/dev/null || missing+=("$tool"); done
if [ ${#missing[@]} -gt 0 ]; then
  command -v apt-get >/dev/null || die "install these first: ${missing[*]}"
  pkgs=("${missing[@]/certbot/certbot python3-certbot-nginx}")
  echo "Installing ${pkgs[*]}"
  # shellcheck disable=SC2068 # word-split "certbot python3-certbot-nginx" on purpose
  apt-get update -qq && apt-get install -y -qq ${pkgs[@]} ca-certificates
fi
systemctl enable --now nginx >/dev/null 2>&1 || true
if ! command -v docker >/dev/null; then
  echo "Installing Docker (official get.docker.com script)"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version >/dev/null 2>&1 || die "Docker Compose plugin missing: apt-get install docker-compose-plugin"
echo "docker $(docker version --format '{{.Server.Version}}'), compose $(docker compose version --short)"

# ---------------------------------------------------------------- 2. resources
step "Checking memory and disk"
mem_gb=$(awk '/MemTotal/ {printf "%d", $2/1024/1024 + 0.5}' /proc/meminfo)
swap_kb=$(awk '/SwapTotal/ {print $2}' /proc/meminfo)
disk_gb=$(df -Pk /var/lib/docker 2>/dev/null | awk 'NR==2 {printf "%d", $4/1024/1024}')
disk_gb=${disk_gb:-$(df -Pk / | awk 'NR==2 {printf "%d", $4/1024/1024}')}
echo "RAM ${mem_gb} GB, swap $((swap_kb / 1024)) MB, free disk ${disk_gb} GB"
[ "$disk_gb" -ge 12 ] || warn "less than 12 GB free disk; OCR + model images may not fit"
if [ "$mem_gb" -lt 6 ] && [ "$swap_kb" -eq 0 ] && [ ! -e /swapfile ]; then
  echo "Low RAM and no swap: creating a 4 GB /swapfile so builds and models don't get killed"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
# Light model for a CPU server: 1.5B is the one we tested locally; 0.5B for small machines.
if [ -z "${OLLAMA_MODEL:-}" ]; then
  if [ "$mem_gb" -ge 6 ]; then OLLAMA_MODEL=qwen2.5:1.5b; else OLLAMA_MODEL=qwen2.5:0.5b; fi
fi
echo "Recipe model: $OLLAMA_MODEL"

# ---------------------------------------------------------------- 3. addresses
step "Working out public addresses"
PUBLIC_IP="${PUBLIC_IP:-$(curl -fsS -4 --max-time 5 https://api.ipify.org || true)}"
PUBLIC_IP="${PUBLIC_IP:-$(hostname -I | awk '{print $1}')}"
[[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "could not detect the public IPv4; set PUBLIC_IP=..."
DASHED="${PUBLIC_IP//./-}"
APP_DOMAIN="${APP_DOMAIN:-$DASHED.sslip.io}"
API_DOMAIN="${API_DOMAIN:-api.$DASHED.sslip.io}"
echo "IP $PUBLIC_IP, web $APP_DOMAIN, api $API_DOMAIN"

# ---------------------------------------------------------------- 4. backend/.env
step "Preparing backend/.env"
fresh_env=0
if [ ! -f "$ENV_FILE" ]; then
  cp backend/.env.example "$ENV_FILE"
  fresh_env=1
  echo "Created backend/.env from the example"
fi
chmod 600 "$ENV_FILE"
env_get() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- || true; }
env_set() {
  local tmp
  if grep -q "^$1=" "$ENV_FILE"; then
    tmp=$(mktemp)
    awk -v k="$1" -v v="$2" 'index($0, k "=") == 1 { print k "=" v; next } { print }' "$ENV_FILE" > "$tmp"
    cat "$tmp" > "$ENV_FILE" && rm -f "$tmp"
  else
    echo "$1=$2" >> "$ENV_FILE"
  fi
}
# Secrets: only generated when missing or still a placeholder, so existing data stays readable.
for key in POSTGRES_PASSWORD JWT_SECRET PHI_KEY HMAC_KEY OCR_WORKER_SECRET; do
  val=$(env_get "$key")
  if [ -z "$val" ] || [[ "$val" == replace-* ]]; then env_set "$key" "$(openssl rand -hex 32)"; echo "generated $key"; fi
done
[ -n "$(env_get SEED_PASSWORD)" ] || env_set SEED_PASSWORD "$DEMO_PASSWORD"
# Deploy-managed settings: always refreshed.
env_set OLLAMA_MODEL "$OLLAMA_MODEL"
env_set LLM_TIMEOUT 120
env_set OCR_TIMEOUT 60
env_set CORS_ORIGINS "[\"https://$APP_DOMAIN\",\"http://$APP_DOMAIN\",\"http://localhost:5173\",\"http://localhost:8081\"]"

dc() { docker compose -p "$PROJECT" -f backend/compose.yaml -f deploy/compose.prod.yaml --profile ai "$@"; }

if [ "${RESET_DB:-0}" = 1 ]; then
  warn "RESET_DB=1: removing the database volume (all demo data)"
  dc down --remove-orphans || true
  docker volume rm "${PROJECT}_postgres-data" 2>/dev/null || true
elif [ "$fresh_env" = 1 ] && docker volume inspect "${PROJECT}_postgres-data" >/dev/null 2>&1; then
  die "a database volume from an earlier deploy exists, but backend/.env is new, so its password and
    encryption keys won't match. Copy the old .env here (e.g. cp /opt/nest4aw/backend/.env backend/.env)
    and re-run, or re-run with RESET_DB=1 to start with a fresh demo database."
fi

# ---------------------------------------------------------------- 5. ports and firewall
step "Checking ports 8010, 8410, 3410 are free (or already ours)"
# Never stops anything: other apps on this server keep running.
for port in 8010 8410 3410; do
  other=$(docker ps --filter "publish=$port" --format '{{.Names}} {{.Label "com.docker.compose.project"}}' | awk -v p="$PROJECT" '$2 != p {print $1}' | head -1 || true)
  [ -z "$other" ] || die "port $port is used by container '$other' from another project. Free it or change the ports in deploy/compose.prod.yaml."
  holder=$(ss -ltnpH "sport = :$port" 2>/dev/null | grep -v docker-proxy | sed -n 's/.*users:(("\([^"]*\)".*/\1/p' | head -1 || true)
  [ -z "$holder" ] || die "port $port is used by '$holder'. Free it or change the ports in deploy/compose.prod.yaml."
done
if command -v ufw >/dev/null && ufw status | grep -q 'Status: active'; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 8010/tcp >/dev/null
  echo "ufw: opened 80, 443, 8010"
fi

# ---------------------------------------------------------------- 6. backend up
step "Building and starting backend, OCR and Ollama (first run takes a while)"
dc up -d --build --remove-orphans postgres seed api ollama ocr

api_py() { dc exec -T api python -c "$1"; }
api_healthy() { api_py "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)" 2>/dev/null; }
echo -n "waiting for the API"
for _ in $(seq 1 60); do api_healthy && break; echo -n "."; sleep 5; done
echo
api_healthy || die "API did not start; see: docker compose -p $PROJECT -f backend/compose.yaml -f deploy/compose.prod.yaml logs seed api"

# ---------------------------------------------------------------- 7. models
step "Downloading the recipe model ($OLLAMA_MODEL)"
# The Ollama server needs a few seconds after the container starts.
for _ in $(seq 1 30); do dc exec -T ollama ollama list >/dev/null 2>&1 && break; sleep 2; done
pulled=0
for _ in 1 2 3; do dc exec -T ollama ollama pull "$OLLAMA_MODEL" && { pulled=1; break; }; sleep 5; done
[ "$pulled" = 1 ] || warn "model download failed; recipes fall back to stored text until you re-run this script"

step "Downloading and warming the OCR model"
dc exec -T ocr python -c 'from paddleocr import PaddleOCR; PaddleOCR(text_detection_model_name="PP-OCRv5_mobile_det", text_recognition_model_name="en_PP-OCRv5_mobile_rec", use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=True, device="cpu")' >/dev/null 2>&1 ||
  warn "OCR warm-up failed; the first label scan will be slow or unavailable (logs: dc logs ocr)"

# ---------------------------------------------------------------- 8. demo users
step "Creating the same demo accounts as local (@epic.com and @demo.local)"
if ! dc exec -T -e ACCOUNT_SEED_PASSWORD="$DEMO_PASSWORD" api python -m seed.accounts > deploy/accounts.log 2>&1; then
  warn "account seed reported a problem (existing accounts still get the demo password below):"
  tail -5 deploy/accounts.log
fi
chmod 600 deploy/accounts.log
# Accounts made by an earlier deploy may have another password; align the fictional demo ones only.
dc exec -T -e DEMO_PASSWORD="$DEMO_PASSWORD" api python - <<'PY'
import os
import psycopg
from app.auth import password_hash
from app.config import settings
from seed.accounts import account_plan

emails = [a["email"] for domain in ("epic.com", "demo.local") for a in account_plan(domain)]
with psycopg.connect(settings().database_url) as conn:
    cur = conn.execute(
        "UPDATE users SET password_hash=%s, disabled=false WHERE lower(email) = ANY(%s)",
        (password_hash.hash(os.environ["DEMO_PASSWORD"]), emails),
    )
    print(f"{cur.rowcount} demo accounts use the demo password")
PY

# ---------------------------------------------------------------- 9. HTTPS
step "Adding the nginx site for $APP_DOMAIN and $API_DOMAIN (other sites untouched)"
SITE=/etc/nginx/sites-available/nest4aw.conf
# Written once; certbot then adds the HTTPS lines to this same file, so re-runs keep them.
if [ ! -f "$SITE" ] || ! grep -q "server_name $APP_DOMAIN;" "$SITE"; then
  cat > "$SITE" <<EOF
# NEST4AW, written by deploy/deploy.sh
server {
    listen 80;
    listen [::]:80;
    server_name $APP_DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:3410;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
server {
    listen 80;
    listen [::]:80;
    server_name $API_DOMAIN;
    client_max_body_size 9m;
    location / {
        proxy_pass http://127.0.0.1:8410;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 180s;
    }
}
EOF
fi
ln -sf "$SITE" /etc/nginx/sites-enabled/nest4aw.conf
nginx -t || die "nginx config test failed; nothing was reloaded. Remove $SITE and re-run."
systemctl reload nginx

step "Getting HTTPS certificates (Let's Encrypt via certbot)"
https_ok=0
if certbot --nginx -d "$APP_DOMAIN" -d "$API_DOMAIN" --non-interactive --agree-tos \
  --register-unsafely-without-email --redirect --keep-until-expiring; then
  for _ in $(seq 1 12); do
    if curl -fsS --max-time 5 "https://$API_DOMAIN/health" >/dev/null 2>&1; then https_ok=1; break; fi
    sleep 5
  done
fi
if [ "$https_ok" = 1 ]; then
  API_URL="https://$API_DOMAIN"; APP_URL="https://$APP_DOMAIN"
else
  warn "HTTPS not ready (a cloud firewall on 80/443, or certificate limits). Using plain HTTP for now."
  warn "Re-run this script later to switch the web app to HTTPS."
  API_URL="http://$API_DOMAIN"; APP_URL="http://$APP_DOMAIN"
fi

# ---------------------------------------------------------------- 10. frontend
step "Building and starting the web app against $API_URL"
cat > frontend/.env.production <<EOF
# Written by deploy/deploy.sh. Baked into the web app at build time.
NEXT_PUBLIC_API_URL=$API_URL
API_PROXY_TARGET=http://api:8000
EOF
dc up -d --build frontend
web_code() { curl -s -o /dev/null -w '%{http_code}' -L --max-time 10 "$APP_URL/login" || true; }
echo -n "waiting for the web app"
for _ in $(seq 1 40); do [ "$(web_code)" = 200 ] && break; echo -n "."; sleep 3; done
echo

# ---------------------------------------------------------------- 11. checks
step "Checking everything works together"
fail=0
check() { if "${@:2}" >/dev/null 2>&1; then echo "  ok    $1"; else echo "  FAIL  $1"; fail=1; fi; }
web_ok() { [ "$(web_code)" = 200 ]; }
latest_code() { curl -fsS --max-time 10 "$API_URL/openapi.json" | grep -q '/api/v1/checkout/code'; }
staff_login() {
  curl -fsS --max-time 10 -H 'content-type: application/json' \
    -d "{\"email\":\"staff@epic.com\",\"password\":\"$DEMO_PASSWORD\"}" "$API_URL/api/v1/auth/login" | grep -q access_token
}
cors_ok() {
  curl -fsS -o /dev/null -D - --max-time 10 -X OPTIONS -H "Origin: $APP_URL" \
    -H 'Access-Control-Request-Method: POST' "$API_URL/api/v1/auth/login" | grep -qi 'access-control-allow-origin'
}
llm_ok() {
  api_py "import json, urllib.request as u
body = json.dumps({'model': '$OLLAMA_MODEL', 'prompt': 'Reply with: ok', 'stream': False}).encode()
r = u.urlopen(u.Request('http://ollama:11434/api/generate', body, {'content-type': 'application/json'}), timeout=300)
assert json.load(r)['response']"
}
ocr_ok() {
  api_py "import os, urllib.request as u, urllib.error as e
try:
    u.urlopen(u.Request('http://ocr:8001/extract', b'', {'Authorization': 'Bearer ' + os.environ['OCR_WORKER_SECRET']}), timeout=30)
except e.HTTPError as x:
    assert x.code in (400, 413, 415, 422), x.code"
}
check "API health ($API_URL/health)" curl -fsS --max-time 10 "$API_URL/health"
check "web app ($APP_URL/login)" web_ok
check "latest code deployed (checkout code route)" latest_code
check "staff login staff@epic.com" staff_login
check "web app may call the API (CORS)" cors_ok
check "plain-HTTP API fallback (http://$PUBLIC_IP:8010)" curl -fsS --max-time 10 "http://$PUBLIC_IP:8010/health"
check "recipe model answers ($OLLAMA_MODEL)" llm_ok
check "OCR worker reachable from the API" ocr_ok

# ---------------------------------------------------------------- 12. summary
status="NEST4AW is deployed"
[ "$fail" = 0 ] || status="NEST4AW is deployed, but some checks FAILED (see above)"
cat <<EOF

================================================================================
 $status

 Staff web app : $APP_URL
 API           : $API_URL      (docs: $API_URL/docs)
 API over HTTP : http://$PUBLIC_IP:8010
 Recipe model  : $OLLAMA_MODEL (Ollama)    OCR: PaddleOCR

 Demo logins (password: $DEMO_PASSWORD)
   staff@epic.com  admin@epic.com  doctor@epic.com  partner@epic.com
   shoppers: maria, james, asha, luis, helen @epic.com (same names @demo.local)
 New floor card tokens, if any: deploy/accounts.log (keep private)

 Phone app: in mobile/.env.local on your laptop set
   EXPO_PUBLIC_API_URL=$API_URL
 then start Expo with: npx expo start -c --tunnel
================================================================================
EOF
exit "$fail"
