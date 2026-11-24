-- READ-ONLY export of hairshop.lv (nopCommerce) catalog prices for
-- scripts/retail-price-reconciliation.ts. SELECT statements only; no customer, order or
-- address data. Works at database compatibility level 100+ (hairshop.lv backup is 100).
--
-- Run against a FRESH copy taken right before the B2C cutover (a June 2026 backup is
-- not a valid source for migrated prices), e.g. with a read-only login:
--   sqlcmd -S <server> -d <nop-db> -E -C -W -h -1 -s "<TAB>" -f 65001 ^
--     -v AsOf="20261201" -i scripts\sql\nop-retail-price-export.sql -o nop-prices.tsv
-- AsOf (UTC date YYYYMMDD, required by sqlcmd) decides which dated discounts count as
-- active; any other value (e.g. -v AsOf="now") means the current UTC time.
--
-- Columns (tab-separated): ProductId, Sku, Published, Price, OldPrice, TaxCategoryId,
-- TaxRate, IsTaxExempt, PricesIncludeTax, Discounts, Name
-- Discounts: "id:p<percent>|a<amount>:<max amount>:<flags>" joined by ";", flags
-- c = coupon code required, r = has requirements (e.g. customer role), k = cumulative.
-- Only discount types 2 (SKUs), 5 (categories, incl. subcategories when configured)
-- and 6 (manufacturers) are product-price discounts; order-total/shipping types are not.

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON; -- sqlcmd defaults to OFF; required by the XML .value() below
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

-- Compatibility level 100 (SQL Server 2008) safe: no TRY_CONVERT/STRING_AGG.
DECLARE @AsOfText varchar(20) = '$(AsOf)';
DECLARE @AsOf datetime = CASE WHEN @AsOfText LIKE '[12][0-9][0-9][0-9][01][0-9][0-3][0-9]'
  THEN CONVERT(datetime, @AsOfText, 112) ELSE GETUTCDATE() END;

DECLARE @PricesIncludeTax bit = CASE WHEN EXISTS (
  SELECT 1 FROM Setting WHERE Name = 'taxsettings.pricesincludetax' AND StoreId = 0 AND LOWER(Value) = 'true'
) THEN 1 ELSE 0 END;

WITH CategoryAncestors AS (
  SELECT Id AS CategoryId, Id AS AncestorId, 0 AS Depth FROM Category WHERE Deleted = 0
  UNION ALL
  SELECT ca.CategoryId, c.ParentCategoryId, ca.Depth + 1
    FROM CategoryAncestors ca JOIN Category c ON c.Id = ca.AncestorId
   WHERE c.ParentCategoryId <> 0 AND ca.Depth < 20
),
ActiveDiscount AS (
  SELECT d.Id, d.DiscountTypeId, d.UsePercentage, d.DiscountPercentage, d.DiscountAmount, d.MaximumDiscountAmount,
         d.RequiresCouponCode, d.AppliedToSubCategories, d.IsCumulative,
         CASE WHEN EXISTS (SELECT 1 FROM DiscountRequirement r WHERE r.DiscountId = d.Id) THEN 1 ELSE 0 END AS HasRequirements
    FROM Discount d
   WHERE d.DiscountTypeId IN (2, 5, 6)
     AND (d.StartDateUtc IS NULL OR d.StartDateUtc <= @AsOf)
     AND (d.EndDateUtc IS NULL OR d.EndDateUtc >= @AsOf)
),
ProductDiscount AS (
  SELECT m.Product_Id AS ProductId, d.Id AS DiscountId
    FROM Discount_AppliedToProducts m JOIN ActiveDiscount d ON d.Id = m.Discount_Id AND d.DiscountTypeId = 2
  UNION
  SELECT pcm.ProductId, d.Id
    FROM Product_Category_Mapping pcm
    JOIN CategoryAncestors ca ON ca.CategoryId = pcm.CategoryId
    JOIN Discount_AppliedToCategories dc ON dc.Category_Id = ca.AncestorId
    JOIN ActiveDiscount d ON d.Id = dc.Discount_Id AND d.DiscountTypeId = 5 AND (ca.Depth = 0 OR d.AppliedToSubCategories = 1)
  UNION
  SELECT pmm.ProductId, d.Id
    FROM Product_Manufacturer_Mapping pmm
    JOIN Discount_AppliedToManufacturers dm ON dm.Manufacturer_Id = pmm.ManufacturerId
    JOIN ActiveDiscount d ON d.Id = dm.Discount_Id AND d.DiscountTypeId = 6
)
SELECT
  p.Id AS ProductId,
  LTRIM(RTRIM(ISNULL(p.Sku, ''))) AS Sku,
  CAST(p.Published AS int) AS Published,
  CAST(p.Price AS decimal(18, 4)) AS Price,
  CAST(p.OldPrice AS decimal(18, 4)) AS OldPrice,
  p.TaxCategoryId,
  ISNULL((SELECT TOP 1 s.Value FROM Setting s WHERE s.Name = 'tax.taxprovider.fixedrate.taxcategoryid' + CAST(p.TaxCategoryId AS varchar(20))), '') AS TaxRate,
  CAST(p.IsTaxExempt AS int) AS IsTaxExempt,
  CAST(@PricesIncludeTax AS int) AS PricesIncludeTax,
  ISNULL(STUFF((
    SELECT ';' + CAST(d.Id AS varchar(20)) + ':'
             + CASE WHEN d.UsePercentage = 1 THEN 'p' + CAST(CAST(d.DiscountPercentage AS decimal(18, 4)) AS varchar(40))
                    ELSE 'a' + CAST(CAST(d.DiscountAmount AS decimal(18, 4)) AS varchar(40)) END + ':'
             + CAST(CAST(ISNULL(d.MaximumDiscountAmount, 0) AS decimal(18, 4)) AS varchar(40)) + ':'
             + CASE WHEN d.RequiresCouponCode = 1 THEN 'c' ELSE '' END
             + CASE WHEN d.HasRequirements = 1 THEN 'r' ELSE '' END
             + CASE WHEN d.IsCumulative = 1 THEN 'k' ELSE '' END
      FROM ProductDiscount pd JOIN ActiveDiscount d ON d.Id = pd.DiscountId
     WHERE pd.ProductId = p.Id
     ORDER BY d.Id
       FOR XML PATH(''), TYPE).value('.', 'varchar(max)'), 1, 1, ''), '') AS Discounts,
  REPLACE(REPLACE(REPLACE(p.Name, CHAR(9), ' '), CHAR(10), ' '), CHAR(13), ' ') AS Name
FROM Product p
WHERE p.Deleted = 0
ORDER BY p.Id
OPTION (MAXRECURSION 50);
