param([string]$OutDir = "C:\Temp\migration")

$SQL = "C:\Program Files\Microsoft SQL Server\Client SDK\ODBC\180\Tools\Binn\SQLCMD.EXE"
$DB  = "localhost\SQLEXPRESS"
$DB_NAME = "hairshop_p34s"

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
Write-Host "Exporting to $OutDir"

function Export-Query($name, $query) {
    $out = "$OutDir\$name.json"
    Write-Host -NoNewline "  $name... "
    & $SQL -S $DB -d $DB_NAME -C -f 65001 -Q "SET NOCOUNT ON; $query FOR JSON PATH, ROOT('data')" -o $out -y 0 -Y 0
    $size = [math]::Round((Get-Item $out).Length / 1KB, 1)
    Write-Host "OK ($size KB)"
}

function Export-Paged($name, $baseQuery, $pageSize = 5000) {
    $out = "$OutDir\$name.json"
    Write-Host -NoNewline "  $name (paged)... "
    $offset = 0; $all = @(); $page = 0
    do {
        $tmp = "$OutDir\_tmp_${name}_$page.json"
        $pq  = "SET NOCOUNT ON; $baseQuery ORDER BY 1 OFFSET $offset ROWS FETCH NEXT $pageSize ROWS ONLY FOR JSON PATH"
        & $SQL -S $DB -d $DB_NAME -C -f 65001 -Q $pq -o $tmp -y 0 -Y 0
        $raw = (Get-Content $tmp -Raw).Trim()
        if (-not $raw -or $raw -eq "" -or $raw -eq "NULL") { break }
        $parsed = $raw | ConvertFrom-Json
        $all += $parsed
        Remove-Item $tmp -Force
        $offset += $pageSize; $page++
    } while ($parsed.Count -eq $pageSize)
    $all | ConvertTo-Json -Depth 10 -Compress | Set-Content $out -Encoding UTF8
    Write-Host "OK ($($all.Count) rows)"
}

# ── Products ──────────────────────────────────────────────────────────────────
# Source Product.Price/OldPrice are net (pricesincludetax=False in nopCommerce settings).
# The storefront displays VAT-inclusive prices (Latvia VAT 21%), so gross them up on export.
Export-Query "products" @"
SELECT
  CAST(p.Id AS VARCHAR)                                       AS id,
  p.Name                                                      AS title,
  COALESCE(NULLIF(p.FullDescription,''), p.ShortDescription)  AS description,
  COALESCE(m.Name, 'Unknown')                                 AS brand,
  ROUND(p.Price * 1.21, 2)                                    AS price,
  ROUND(NULLIF(p.OldPrice, 0) * 1.21, 2)                       AS oldPrice,
  p.StockQuantity                                             AS stock,
  NULLIF(p.SKU,'')                                            AS sku,
  NULLIF(p.Gtin,'')                                           AS barcode,
  p.MarkAsNew                                                 AS markAsNew,
  CAST(CASE WHEN p.ApprovedTotalReviews > 0
    THEN CAST(p.ApprovedRatingSum AS FLOAT) / p.ApprovedTotalReviews
    ELSE 0 END AS DECIMAL(4,2))                               AS rating,
  p.ApprovedTotalReviews                                      AS ratingCount,
  p.MetaTitle                                                 AS metaTitle,
  p.MetaDescription                                           AS metaDescription,
  p.Published                                                 AS isActive,
  p.CreatedOnUtc                                              AS createdAt,
  p.UpdatedOnUtc                                              AS updatedAt
FROM Product p
LEFT JOIN Product_Manufacturer_Mapping pmm ON pmm.ProductId = p.Id
LEFT JOIN Manufacturer m ON m.Id = pmm.ManufacturerId AND m.Deleted = 0
WHERE p.Deleted = 0
"@

# ── Product categories (ALL tags per product, not just first — see project_category_recategorize memory) ──
Export-Query "product_categories" @"
SELECT pcm.ProductId AS productId, c.Name AS catName
FROM Product_Category_Mapping pcm
JOIN Product p ON p.Id = pcm.ProductId AND p.Deleted = 0
JOIN Category c ON c.Id = pcm.CategoryId AND c.Deleted = 0
"@

# ── Localized product descriptions (EN/LV/RU — see scripts/backfill-descriptions-i18n.ts) ──
Export-Query "localized_descriptions" @"
SELECT lp.EntityId AS productId, lp.LanguageId AS langId, lp.LocaleValue AS text
FROM LocalizedProperty lp
JOIN Product p ON p.Id = lp.EntityId AND p.Deleted = 0
WHERE lp.LocaleKeyGroup='Product' AND lp.LocaleKey='FullDescription' AND lp.LanguageId IN (1,2,3)
  AND NULLIF(lp.LocaleValue,'') IS NOT NULL
"@

# ── Related / cross-sell products ───────────────────────────────────────────────
Export-Query "related_products" @"
SELECT rp.ProductId1 AS productId, rp.ProductId2 AS relatedId
FROM RelatedProduct rp
JOIN Product p1 ON p1.Id = rp.ProductId1 AND p1.Deleted = 0
JOIN Product p2 ON p2.Id = rp.ProductId2 AND p2.Deleted = 0
"@

Export-Query "crosssell_products" @"
SELECT cs.ProductId1 AS productId, cs.ProductId2 AS crossSellId
FROM CrossSellProduct cs
JOIN Product p1 ON p1.Id = cs.ProductId1 AND p1.Deleted = 0
JOIN Product p2 ON p2.Id = cs.ProductId2 AND p2.Deleted = 0
"@

# ── Product images ────────────────────────────────────────────────────────────
Export-Query "product_images" @"
SELECT ppm.ProductId AS productId, pic.Id AS picId, pic.SeoFilename AS seoFilename, ppm.DisplayOrder AS displayOrder
FROM Product_Picture_Mapping ppm
JOIN Picture pic ON pic.Id = ppm.PictureId
WHERE pic.SeoFilename IS NOT NULL AND pic.SeoFilename != ''
"@

# ── Product variant attributes (color/size dropdowns, lost in the first migration pass) ──
Export-Query "product_attributes" @"
SELECT
  pam.ProductId      AS productId,
  pa.Name            AS attrName,
  pam.IsRequired     AS isRequired,
  pav.Name           AS value,
  pav.PriceAdjustment AS priceAdjustment,
  pav.DisplayOrder   AS displayOrder
FROM Product_ProductAttribute_Mapping pam
JOIN ProductAttribute pa ON pa.Id = pam.ProductAttributeId
JOIN ProductAttributeValue pav ON pav.ProductAttributeMappingId = pam.Id
JOIN Product p ON p.Id = pam.ProductId AND p.Deleted = 0
ORDER BY pam.ProductId, pam.Id, pav.DisplayOrder
"@

# ── Users ─────────────────────────────────────────────────────────────────────
Export-Paged "users" @"
SELECT
  CAST(c.CustomerGuid AS VARCHAR(50))              AS id,
  c.Id                                             AS nopId,
  c.Email                                          AS email,
  COALESCE(ga_fn.Value, '')                        AS firstName,
  COALESCE(ga_ln.Value, '')                        AS lastName,
  ga_ph.Value                                      AS phone,
  c.CreatedOnUtc                                   AS createdAt,
  CASE WHEN cr_adm.Customer_Id IS NOT NULL
    THEN 'admin' ELSE 'customer' END               AS role
FROM Customer c
LEFT JOIN GenericAttribute ga_fn
  ON ga_fn.EntityId=c.Id AND ga_fn.KeyGroup='Customer' AND ga_fn.[Key]='FirstName' AND ga_fn.StoreId=0
LEFT JOIN GenericAttribute ga_ln
  ON ga_ln.EntityId=c.Id AND ga_ln.KeyGroup='Customer' AND ga_ln.[Key]='LastName' AND ga_ln.StoreId=0
LEFT JOIN GenericAttribute ga_ph
  ON ga_ph.EntityId=c.Id AND ga_ph.KeyGroup='Customer' AND ga_ph.[Key]='Phone' AND ga_ph.StoreId=0
LEFT JOIN (
  SELECT ccrm.Customer_Id FROM Customer_CustomerRole_Mapping ccrm
  JOIN CustomerRole cr ON cr.Id=ccrm.CustomerRole_Id AND cr.SystemName='Administrators'
) cr_adm ON cr_adm.Customer_Id=c.Id
WHERE c.Deleted=0 AND c.IsSystemAccount=0
  AND c.Email IS NOT NULL AND c.Email != ''
  AND c.PasswordFormatId=1
"@ 5000

# ── Customer nopId→guid map (for order linking) ───────────────────────────────
Export-Query "customer_guid_map" @"
SELECT c.Id AS nopId, CAST(c.CustomerGuid AS VARCHAR(50)) AS guid
FROM Customer c WHERE c.Deleted=0 AND c.IsSystemAccount=0
"@

# ── Orders ────────────────────────────────────────────────────────────────────
Export-Paged "orders" @"
SELECT
  CAST(o.OrderGuid AS VARCHAR(50))  AS id,
  o.Id                              AS nopId,
  o.CustomerId                      AS customerId,
  o.OrderSubtotalExclTax            AS subtotal,
  o.OrderTax                        AS tax,
  o.OrderShippingExclTax            AS delivery,
  o.ShippingMethod                  AS deliveryMethod,
  o.PaymentMethodSystemName         AS paymentMethod,
  o.OrderDiscount                   AS discount,
  o.OrderTotal                      AS total,
  o.PaymentStatusId                 AS paymentStatusId,
  COALESCE(a.FirstName,'')          AS firstName,
  COALESCE(a.LastName,'')           AS lastName,
  COALESCE(c.Email,'')              AS email,
  COALESCE(a.PhoneNumber,'')        AS phone,
  COALESCE(a.Address1,'')           AS address,
  COALESCE(a.City,'')               AS city,
  a.ZipPostalCode                   AS postalCode,
  o.CreatedOnUtc                    AS createdAt
FROM [Order] o
LEFT JOIN Address a ON a.Id=o.BillingAddressId
LEFT JOIN Customer c ON c.Id=o.CustomerId
WHERE o.Deleted=0
"@ 3000

# ── Order items ───────────────────────────────────────────────────────────────
Export-Query "order_items" @"
SELECT
  oi.OrderId          AS orderId,
  oi.Quantity         AS quantity,
  oi.UnitPriceExclTax AS price,
  p.Id                AS productId,
  p.Name              AS productName,
  p.SKU               AS sku
FROM OrderItem oi
JOIN Product p ON p.Id=oi.ProductId
"@

# ── Reviews ───────────────────────────────────────────────────────────────────
Export-Query "reviews" @"
SELECT
  CAST(pr.Id AS VARCHAR)                                          AS id,
  CAST(pr.ProductId AS VARCHAR)                                   AS productId,
  TRIM(COALESCE(ga_fn.Value + ' ' + ga_ln.Value, c.Email, 'Customer')) AS author,
  pr.Rating                                                       AS rating,
  COALESCE(NULLIF(pr.Title,''), 'Review')                         AS title,
  COALESCE(pr.ReviewText,'')                                      AS text,
  pr.CreatedOnUtc                                                 AS createdAt,
  pr.HelpfulYesTotal                                              AS helpful
FROM ProductReview pr
JOIN Customer c ON c.Id=pr.CustomerId
LEFT JOIN GenericAttribute ga_fn
  ON ga_fn.EntityId=c.Id AND ga_fn.KeyGroup='Customer' AND ga_fn.[Key]='FirstName' AND ga_fn.StoreId=0
LEFT JOIN GenericAttribute ga_ln
  ON ga_ln.EntityId=c.Id AND ga_ln.KeyGroup='Customer' AND ga_ln.[Key]='LastName' AND ga_ln.StoreId=0
WHERE pr.IsApproved=1
"@

# ── Blog posts ────────────────────────────────────────────────────────────────
Export-Query "blog_posts" @"
SELECT Id AS id, Title AS title, Body AS body, BodyOverview AS bodyOverview,
  CreatedOnUtc AS createdAt, MetaTitle AS metaTitle, MetaDescription AS metaDescription
FROM BlogPost
WHERE StartDateUtc IS NULL OR StartDateUtc <= GETUTCDATE()
"@

# ── Addresses ─────────────────────────────────────────────────────────────────
Export-Paged "addresses" @"
SELECT
  a.Id AS id, a.Email AS email, a.FirstName AS firstName, a.LastName AS lastName,
  COALESCE(a.PhoneNumber,'') AS phone,
  COALESCE(a.Address1,'') AS address,
  COALESCE(a.City,'') AS city,
  a.ZipPostalCode AS postalCode
FROM Address a
WHERE a.Email IS NOT NULL AND a.Email != ''
  AND a.FirstName IS NOT NULL AND a.FirstName != ''
  AND a.Address1 IS NOT NULL AND a.Address1 != ''
"@ 5000

# ── Promo codes ───────────────────────────────────────────────────────────────
Export-Query "promo_codes" @"
SELECT
  d.Id AS id, d.CouponCode AS code, d.Name AS name,
  d.UsePercentage AS usePercentage,
  d.DiscountPercentage AS discountPercentage,
  d.DiscountAmount AS discountAmount,
  d.EndDateUtc AS endDate,
  d.LimitationTimes AS limitTimes,
  (SELECT COUNT(*) FROM DiscountUsageHistory duh WHERE duh.DiscountId=d.Id) AS usedCount
FROM Discount d
WHERE d.RequiresCouponCode=1 AND d.CouponCode IS NOT NULL AND d.CouponCode != ''
"@

Write-Host "`nExport complete. Files in $OutDir"
Get-ChildItem $OutDir -Filter "*.json" | Select-Object Name, @{N='Size KB';E={[math]::Round($_.Length/1KB,1)}}
