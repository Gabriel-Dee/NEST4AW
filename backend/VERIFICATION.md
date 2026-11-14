# Verification record — 2026-11-14

## Executed

- **66 pytest tests passed**, including real PostgreSQL integration and one real Ollama API test.
  Command: `RUN_REAL_INFERENCE=1 TEST_DATABASE_URL=postgresql://.../nest_test pytest tests -q --tb=short`.
  Last full run: 5.23 seconds. No skipped tests in this run.
- PostgreSQL 18.6 ran in an isolated local cluster on port 55432. Tests created a dedicated
  `nest_test` database; its schema was reset by the explicitly guarded fixture.
- All 30 golden combinations tested: 27 match the original; 3 use the owner-approved conservative
  unknown corrections. No expected yellow/red/unknown case was made green.
- Authentication: Argon2 verify, invalid credentials, disabled users, expired/bad-signature/unsigned
  JWT rejection, and all five roles across ten protected read-route boundaries.
- Core workflows: encrypted enrollment, profile-to-session synchronization, revoke/reissue,
  queue promotion/lease expiration, exact API error shape, CORS for both team origins,
  scan/cart/checkout, FIFO eligibility, atomic rollback, concurrent last-unit sale, and public report fields.
- Catalog seed: **114 records**, all required coverage classes, provenance, nullable nutrients,
  repeat initialization without duplicate products, card rotation, or replenishment.
- Mocked AI/source tests: valid/invalid schema, hallucinated IDs, out-of-stock/allergy restrictions,
  recipe ingredient/operation checks, unit conversions, missing nutrients, ambiguous OCR fields,
  image rejection, low-confidence/unreadable handling, model timeout and OCR failure.
- ZXing-C++ decoded an actual generated EAN-13 image (`1234567890128`), rather than mocking decoding.
- **Real PaddleOCR smoke test passed**, using PaddleOCR 3.7.0 / PaddlePaddle 3.3.1 on Python 3.13,
  Apple Silicon CPU. Synthetic label result: sodium 120 mg, potassium 80 mg, phosphorus 40 mg,
  added sugar 2 g, carbohydrate 20 g, fiber 3 g, serving 100 g, and ingredients “oats, milk”.
  Minimum recognized-line confidence: 0.969988; cached-weight process run: **2.98 seconds**.
  This is one clear synthetic label, not a real-packaging accuracy benchmark.
- **Real Ollama smoke test passed**, Ollama 0.40.16, `qwen2.5:1.5b`, Q4_K_M. Generated one product
  recommendation and a recipe over constrained synthetic inventory, then passed independent
  validation. Warm standalone run: **1.06 seconds**. A separate test exercised the actual
  `/recommendations` route against seeded PostgreSQL and required `mode:ollama`.
- Live Open Food Facts search retrieved real catalog records. One search returned 503; an alternate
  documented v2 search supplied the remaining fish/shellfish coverage. No fabricated fallback records.
- Live USDA FoodData Central detail call, public `DEMO_KEY`, record 173944: HTTP 200, sodium 1 mg,
  potassium 358 mg, phosphorus 22 mg, protein 1.09 g per 100 g. Runtime key remains configurable;
  no private USDA credential was supplied or stored.
- Ruff check and format check passed; `git diff --check` passed.

One upstream test warning remains: current Starlette deprecates its httpx-based TestClient in favor
of httpx2. It did not cause failures. Core tests ran on Python 3.14; OCR ran separately on 3.13.
`requirements.lock` captures the core/test package versions; OCR versions are pinned in the setup.

## Corrections discovered during actual execution

1. Golden food/allergen evidence contradiction was raised with the user and resolved conservatively.
2. The first real OCR pass exposed cross-line matching of the preceding fiber amount as added sugar.
   Horizontal whitespace matching fixed it; the regression and the real extraction both pass.
3. The first small-model result duplicated recommendations. Dynamic product-ID enums, catalog-sized
   array limits, and a uniqueness instruction improved generation. Independent duplicate rejection
   remains in place; unsafe output still falls back rather than being silently accepted.

## Not claimed or not executed

- Docker/Compose images were not built or launched: Docker is unavailable in this environment.
  YAML and Dockerfile are a deployment handoff, not a successful container deployment claim.
- No public URL or frontend/mobile UI was deployed; the user explicitly chose to deploy personally.
- No real patient data, dietitian sign-off, clinical effectiveness evaluation, or HIPAA assessment.
- No broad blurry/rotated/partial-label OCR benchmark. Those inputs remain review-required when identity
  or extraction is uncertain. Ingredient-name OCR matching cannot establish a verified identity.
- No durable recipe library/embeddings: the repository defers pgvector; recipes are generated responses.
- No longitudinal clinical outcome metrics: the authoritative schema contains no clinical measurements.
- No calorie/protein/fat values invented for golden foods. They remain null unless an actual source
  supplies them. Package quantities are not clinical serving prescriptions or daily intake limits.
- Existing active JWTs remain usable after password change until eight-hour expiry (unless account
  disabled, role changed, or signing key rotated). This follows the supplied stateless JWT schema.
- Candidate recommendations are bounded to 20 products from the first 200 stocked catalog rows;
  this keeps the small model prompt manageable. All selected output is revalidated.
- Distributed rate limiting, login lockout policy, and production secret/key rotation require an
  operational layer. The handoff specifies edge limits and private model services.

## Official references checked

- [PaddleOCR pipeline](https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/OCR.html)
- [PaddleOCR Apache-2.0 license](https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE)
- [Qwen2.5 1.5B Instruct model card/license](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct)
- [Ollama model size and quantization](https://ollama.com/library/qwen2.5:1.5b)
- [Ollama JSON Schema structured outputs](https://docs.ollama.com/capabilities/structured-outputs)
- [Ollama macOS requirements](https://docs.ollama.com/macos)
- [USDA API guide](https://fdc.nal.usda.gov/api-guide/)
- [Open Food Facts API and attribution](https://openfoodfacts.github.io/openfoodfacts-server/api/)
