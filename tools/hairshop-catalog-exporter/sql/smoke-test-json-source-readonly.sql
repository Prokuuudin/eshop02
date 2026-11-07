/* JSON/HTTPS source smoke test. Run as the dedicated exporter principal. Read-only. */
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'hairshop_p34s'
    THROW 51000, 'Connected database is not hairshop_p34s.', 1;

IF IS_SRVROLEMEMBER(N'sysadmin') = 1
   OR IS_SRVROLEMEMBER(N'serveradmin') = 1
   OR IS_SRVROLEMEMBER(N'securityadmin') = 1
   OR IS_SRVROLEMEMBER(N'dbcreator') = 1
   OR IS_MEMBER(N'db_owner') = 1
   OR IS_MEMBER(N'db_datawriter') = 1
   OR IS_MEMBER(N'db_ddladmin') = 1
   OR IS_MEMBER(N'db_securityadmin') = 1
   OR HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'CONTROL') = 1
   OR HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'ALTER') = 1
   OR HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'INSERT') = 1
   OR HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'UPDATE') = 1
   OR HAS_PERMS_BY_NAME(DB_NAME(), N'DATABASE', N'DELETE') = 1
    THROW 51000, 'Current principal is not read-only.', 1;

IF EXISTS (
    SELECT 1
    FROM (VALUES
        (N'Product'), (N'Language'), (N'LocalizedProperty'), (N'Category'),
        (N'Product_Category_Mapping'), (N'Manufacturer'),
        (N'Product_Manufacturer_Mapping'), (N'Picture'), (N'Product_Picture_Mapping')
    ) required(TableName)
    WHERE HAS_PERMS_BY_NAME(N'dbo.' + QUOTENAME(required.TableName), N'OBJECT', N'SELECT') <> 1
       OR HAS_PERMS_BY_NAME(N'dbo.' + QUOTENAME(required.TableName), N'OBJECT', N'INSERT') = 1
       OR HAS_PERMS_BY_NAME(N'dbo.' + QUOTENAME(required.TableName), N'OBJECT', N'UPDATE') = 1
       OR HAS_PERMS_BY_NAME(N'dbo.' + QUOTENAME(required.TableName), N'OBJECT', N'DELETE') = 1
       OR HAS_PERMS_BY_NAME(N'dbo.' + QUOTENAME(required.TableName), N'OBJECT', N'ALTER') = 1
       OR HAS_PERMS_BY_NAME(N'dbo.' + QUOTENAME(required.TableName), N'OBJECT', N'CONTROL') = 1
)
    THROW 51000, 'JSON source table permissions are missing or too broad.', 1;

IF EXISTS (
    SELECT 1
    FROM (VALUES
        (N'Product', N'Id'), (N'Product', N'SKU'), (N'Product', N'Gtin'),
        (N'Product', N'Name'), (N'Product', N'ShortDescription'), (N'Product', N'FullDescription'),
        (N'Product', N'MetaKeywords'), (N'Product', N'MetaDescription'), (N'Product', N'MetaTitle'),
        (N'Product', N'Published'), (N'Product', N'Deleted'),
        (N'Product', N'CreatedOnUtc'), (N'Product', N'UpdatedOnUtc'),
        (N'Language', N'Id'), (N'Language', N'LanguageCulture'), (N'Language', N'UniqueSeoCode'),
        (N'LocalizedProperty', N'EntityId'), (N'LocalizedProperty', N'LanguageId'),
        (N'LocalizedProperty', N'LocaleKeyGroup'), (N'LocalizedProperty', N'LocaleKey'),
        (N'LocalizedProperty', N'LocaleValue'),
        (N'Category', N'Id'), (N'Category', N'Name'), (N'Category', N'Deleted'),
        (N'Product_Category_Mapping', N'ProductId'), (N'Product_Category_Mapping', N'CategoryId'),
        (N'Manufacturer', N'Id'), (N'Manufacturer', N'Name'), (N'Manufacturer', N'Deleted'),
        (N'Product_Manufacturer_Mapping', N'ProductId'), (N'Product_Manufacturer_Mapping', N'ManufacturerId'),
        (N'Picture', N'Id'), (N'Picture', N'MimeType'), (N'Picture', N'SeoFilename'),
        (N'Product_Picture_Mapping', N'ProductId'), (N'Product_Picture_Mapping', N'PictureId')
    ) required(TableName, ColumnName)
    LEFT JOIN sys.tables t ON t.name = required.TableName AND SCHEMA_NAME(t.schema_id) = N'dbo'
    LEFT JOIN sys.columns c ON c.object_id = t.object_id AND c.name = required.ColumnName
    WHERE c.column_id IS NULL
)
    THROW 51000, 'One or more standard nopCommerce columns required by JSON source are missing.', 1;

SELECT N'PASS' AS SmokeStatus,
       DB_NAME() AS DatabaseName,
       SUSER_SNAME() AS LoginName,
       USER_NAME() AS DatabaseUser;

SELECT COUNT_BIG(*) AS JsonExportEligibleProducts,
       MIN(p.CreatedOnUtc) AS EarliestCreatedOnUtc,
       MAX(p.CreatedOnUtc) AS LatestCreatedOnUtc
FROM dbo.Product p
WHERE p.Deleted = 0 AND p.Published = 1;

SELECT TOP (5) p.Id AS ProductId, p.SKU, p.Gtin AS EAN, p.Name, p.CreatedOnUtc, p.UpdatedOnUtc
FROM dbo.Product p
WHERE p.Deleted = 0 AND p.Published = 1
ORDER BY p.CreatedOnUtc DESC, p.Id DESC;
