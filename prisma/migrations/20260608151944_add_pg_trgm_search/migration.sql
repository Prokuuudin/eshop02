-- Enable pg_trgm for trigram-based full-text similarity search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index on combined product search fields
CREATE INDEX IF NOT EXISTS "Product_search_trgm_idx"
  ON "Product" USING gin (
    (
      COALESCE(title, '') || ' ' ||
      COALESCE(brand, '') || ' ' ||
      COALESCE(description, '') || ' ' ||
      COALESCE(sku, '')
    ) gin_trgm_ops
  );