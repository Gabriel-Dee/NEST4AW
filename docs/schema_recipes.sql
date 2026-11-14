-- Apply only after scan, checkout, and the 30 golden cases pass.
-- Requires the pgvector extension on the server.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  steps text NOT NULL,
  source text NOT NULL,
  license text NOT NULL
);

CREATE TABLE recipe_ingredients (
  recipe_id uuid NOT NULL REFERENCES recipes (id) ON DELETE CASCADE,
  food_name text NOT NULL,
  required boolean NOT NULL
);

CREATE TABLE recipe_embeddings (
  recipe_id uuid PRIMARY KEY REFERENCES recipes (id) ON DELETE CASCADE,
  embedding vector(768) NOT NULL
);

CREATE INDEX recipe_embeddings_hnsw
  ON recipe_embeddings
  USING hnsw (embedding vector_cosine_ops);
