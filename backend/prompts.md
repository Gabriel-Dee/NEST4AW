# Prompt log

## 2026-11-14 — shopping contract [Cursor Grok 4.7] – build

Master backend spec v4. Two apps already parse `/api/v1` scan, cart, checkout, and a
status object (`level`, `label`, `reason`, `limit_qty`, `triggers`). Safety colors stay
on the existing rules engine. Live Open Food Facts imports are yellow until reviewed.
Recommendations and substitutes on these routes use the deterministic fallback until
embeddings and the guardrail log exist. Model remains local Ollama `qwen2.5:1.5b`.
