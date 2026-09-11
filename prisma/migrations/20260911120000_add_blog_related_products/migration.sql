-- Add per-post related products to the blog, so admin can hand-pick which
-- catalog items show under an article instead of relying on category-text matching.
ALTER TABLE "BlogPost" ADD COLUMN     "relatedProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
