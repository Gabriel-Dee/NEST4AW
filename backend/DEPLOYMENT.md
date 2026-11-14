# Deployment handoff

The owner chose to deploy personally. No public service was created or published during this
implementation. These files support a local synthetic demo and deployment on an existing host;
they do not create a paid account or assume a cloud free tier can run OCR/LLM models.

## One-machine demo with persistent PostgreSQL

Prerequisites: Docker with Compose, sufficient local disk for images/model weights, and a machine
with several GB of available memory. OCR was exercised on Apple Silicon CPU; the 1.5B Ollama model
was exercised on an Apple M4 Max. Linux CPU containers are provided but were not run in this session.

From `backend/`:

```bash
cp .env.example .env
# Set POSTGRES_PASSWORD, JWT_SECRET, PHI_KEY, HMAC_KEY, and OCR_WORKER_SECRET.
# Use independent random URL-safe secrets. Choose SEED_PASSWORD for this deployment.
docker compose up --build -d
# View the five newly issued synthetic card tokens once:
docker compose logs seed
curl http://127.0.0.1:8000/health
```

PostgreSQL uses a named volume, with no public database port. API listens on host loopback.
The seed is idempotent and runs before API startup. The base service works without models;
image extraction reports unavailable and recommendations explicitly fall back.
The seed log contains fictional card credentials: transfer them to demo cards, restrict log
access, and do not publish this log. A repeat seed cannot reveal them again.

Enable inference:

```bash
docker compose --profile ai up --build -d
docker compose exec ollama ollama pull qwen2.5:1.5b
# Warm the OCR model using the actual worker pipeline, with no image or PHI:
docker compose exec ocr python -c 'from paddleocr import PaddleOCR; PaddleOCR(text_detection_model_name="PP-OCRv5_mobile_det", text_recognition_model_name="en_PP-OCRv5_mobile_rec", use_doc_orientation_classify=False, use_doc_unwarping=False, use_textline_orientation=True, device="cpu")'
```

Do not publish Ollama's 11434 port or OCR's 8001 port. API-to-inference traffic uses the internal
Compose network; OCR additionally checks a shared bearer secret. Model caches have named volumes.
macOS users can run native Ollama for Metal acceleration and override API's `OLLAMA_URL` with
`http://host.docker.internal:11434` if the native server is configured to accept that private
connection. Do not open a wildcard unauthenticated Ollama service to the internet.

## Public HTTPS hackathon URL without cloud inference costs

Run the stack on the demo machine and tunnel only the API:

```bash
cloudflared tunnel --url http://localhost:8000
```

[Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)
provide a temporary HTTPS URL without an account/domain. They are development tools, have no
uptime guarantee, and change hostname on restart. This is a public synthetic demo, not a PHI
hosting recommendation. No tunnel was started by this implementation.

Give the printed API HTTPS URL to the frontend/mobile team. They deploy their own UI separately
and set its API base to that URL. Set `CORS_ORIGINS` to a JSON array of the exact deployed frontend
and mobile origins, then recreate the API container. The frontend origin, not the API URL, belongs
in CORS. HTTPS pages must call HTTPS APIs. The backend's `/docs` is a usable public API demo page;
it is not a replacement for the teammate-built web application.

This arrangement keeps database and inference together. It does not require a cloud server to
reach `localhost` on a laptop. If a cloud API is used instead, connect to the laptop's inference
services through a private authenticated network/VPN and TLS; configure reachable private hostnames
and the OCR worker secret. Never point a cloud service at the laptop's loopback address. The API
can run without inference while that private connection is being configured.

## Before sharing a public demo

Use only the supplied fictional clients. Set non-default demo passwords and independent keys.
Keep raw card/session credentials out of screenshots, frontend telemetry, and access logs. Uvicorn
commands disable access logging because the existing contract puts session credentials in some
paths/query strings. At the edge, cap request bodies at 9 MB and rate-limit login, arrivals, and
inference routes; per-instance application code does not provide distributed rate limiting.
The parser itself caps image bytes at 8 MB and decoded images at 12 megapixels.

PostgreSQL is the only persistent application database. If moving it to another host, require
TLS, private connectivity, backups, and a least-privilege runtime role. The demo role can initialize
the schema and is not the recommended production privilege separation. Never expose database,
OCR, or Ollama ports publicly. Keep secrets in deployment secret storage rather than images.

## Verification and rollback

1. Check `/health`, `/docs`, both frontend CORS origins, and a protected route without credentials.
2. Enroll a fictional client; arrive using the returned token and scan a reference product.
3. Add an eligible product, then checkout using staff credentials. Confirm ledger/lot changes.
4. Turn off Ollama; confirm `mode:deterministic_fallback` and working scan/checkout.
5. Run the documented disposable PostgreSQL test suite before changing the shared API contract.

`docker compose down` stops services and preserves volumes. Do not use `down -v` unless deliberately
removing the disposable demo database. Roll back application images together with their API contract;
the only migration is additive nullable columns and does not need destructive rollback. Back up
PostgreSQL and encryption/HMAC keys before moving environments. No workflow deletes ledger history.
