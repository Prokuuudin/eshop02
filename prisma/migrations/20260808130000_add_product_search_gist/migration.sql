CREATE INDEX IF NOT EXISTS "Product_search_trgm_gist_idx"
  ON "Product" USING gist (
    (
      COALESCE(title, '') || ' ' ||
      COALESCE(brand, '') || ' ' ||
      COALESCE(description, '') || ' ' ||
      COALESCE(sku, '')
    ) gist_trgm_ops
  );
