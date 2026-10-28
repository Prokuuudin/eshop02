/*
Hairshop catalog exporter: read-only MSSQL schema smoke test.

Run this script while connected AS hairshop_catalog_reader.
It contains SELECT/metadata checks and session SET statements only. It does not
create or change persistent MSSQL objects and does not read price or stock data.
*/

:on error exit

USE [hairshop_p34s];
GO

SET NOCOUNT ON;
SET DEADLOCK_PRIORITY LOW;
SET LOCK_TIMEOUT 5000;

IF DB_NAME() <> N'hairshop_p34s'
    THROW 51000, 'Smoke test connected to an unexpected database.', 1;

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
    THROW 51000, 'Current principal is not SELECT-only.', 1;

IF EXISTS (
    SELECT 1
    FROM (VALUES
        (N'dbo', N'Product'),
        (N'dbo', N'Language'),
        (N'dbo', N'LocalizedProperty'),
        (N'dbo', N'Category'),
        (N'dbo', N'Product_Category_Mapping'),
        (N'dbo', N'Manufacturer'),
        (N'dbo', N'Product_Manufacturer_Mapping'),
        (N'dbo', N'Picture'),
        (N'dbo', N'Product_Picture_Mapping'),
        (N'dbo', N'UrlRecord')
    ) AS required(SchemaName, TableName)
    WHERE HAS_PERMS_BY_NAME(
        QUOTENAME(required.SchemaName) + N'.' + QUOTENAME(required.TableName),
        N'OBJECT',
        N'SELECT'
    ) <> 1
)
    THROW 51000, 'Current principal lacks SELECT on one or more exporter tables.', 1;

IF EXISTS (
    SELECT 1
    FROM (VALUES
        (N'dbo', N'Product'),
        (N'dbo', N'Language'),
        (N'dbo', N'LocalizedProperty'),
        (N'dbo', N'Category'),
        (N'dbo', N'Product_Category_Mapping'),
        (N'dbo', N'Manufacturer'),
        (N'dbo', N'Product_Manufacturer_Mapping'),
        (N'dbo', N'Picture'),
        (N'dbo', N'Product_Picture_Mapping'),
        (N'dbo', N'UrlRecord')
    ) AS required(SchemaName, TableName)
    WHERE HAS_PERMS_BY_NAME(QUOTENAME(required.SchemaName) + N'.' + QUOTENAME(required.TableName), N'OBJECT', N'INSERT') = 1
       OR HAS_PERMS_BY_NAME(QUOTENAME(required.SchemaName) + N'.' + QUOTENAME(required.TableName), N'OBJECT', N'UPDATE') = 1
       OR HAS_PERMS_BY_NAME(QUOTENAME(required.SchemaName) + N'.' + QUOTENAME(required.TableName), N'OBJECT', N'DELETE') = 1
       OR HAS_PERMS_BY_NAME(QUOTENAME(required.SchemaName) + N'.' + QUOTENAME(required.TableName), N'OBJECT', N'ALTER') = 1
       OR HAS_PERMS_BY_NAME(QUOTENAME(required.SchemaName) + N'.' + QUOTENAME(required.TableName), N'OBJECT', N'CONTROL') = 1
)
    THROW 51000, 'Current principal has a write or control permission on an exporter table.', 1;

IF EXISTS (
    SELECT 1
    FROM (VALUES
        (N'Product', N'Id'),
        (N'Product', N'SKU'),
        (N'Product', N'Gtin'),
        (N'Product', N'Name'),
        (N'Product', N'ShortDescription'),
        (N'Product', N'FullDescription'),
        (N'Product', N'MetaKeywords'),
        (N'Product', N'MetaDescription'),
        (N'Product', N'MetaTitle'),
        (N'Product', N'Published'),
        (N'Product', N'CreatedOnUtc'),
        (N'Product', N'UpdatedOnUtc'),
        (N'Product', N'Deleted'),
        (N'Language', N'Id'),
        (N'Language', N'Name'),
        (N'Language', N'LanguageCulture'),
        (N'Language', N'UniqueSeoCode'),
        (N'Language', N'Published'),
        (N'Language', N'DisplayOrder'),
        (N'LocalizedProperty', N'EntityId'),
        (N'LocalizedProperty', N'LanguageId'),
        (N'LocalizedProperty', N'LocaleKeyGroup'),
        (N'LocalizedProperty', N'LocaleKey'),
        (N'LocalizedProperty', N'LocaleValue'),
        (N'Category', N'Id'),
        (N'Category', N'ParentCategoryId'),
        (N'Category', N'Name'),
        (N'Category', N'Description'),
        (N'Category', N'MetaKeywords'),
        (N'Category', N'MetaDescription'),
        (N'Category', N'MetaTitle'),
        (N'Category', N'Published'),
        (N'Category', N'DisplayOrder'),
        (N'Category', N'CreatedOnUtc'),
        (N'Category', N'UpdatedOnUtc'),
        (N'Category', N'Deleted'),
        (N'Product_Category_Mapping', N'ProductId'),
        (N'Product_Category_Mapping', N'CategoryId'),
        (N'Product_Category_Mapping', N'IsFeaturedProduct'),
        (N'Product_Category_Mapping', N'DisplayOrder'),
        (N'Manufacturer', N'Id'),
        (N'Manufacturer', N'Name'),
        (N'Manufacturer', N'Description'),
        (N'Manufacturer', N'MetaKeywords'),
        (N'Manufacturer', N'MetaDescription'),
        (N'Manufacturer', N'MetaTitle'),
        (N'Manufacturer', N'Published'),
        (N'Manufacturer', N'DisplayOrder'),
        (N'Manufacturer', N'CreatedOnUtc'),
        (N'Manufacturer', N'UpdatedOnUtc'),
        (N'Manufacturer', N'Deleted'),
        (N'Product_Manufacturer_Mapping', N'ProductId'),
        (N'Product_Manufacturer_Mapping', N'ManufacturerId'),
        (N'Product_Manufacturer_Mapping', N'IsFeaturedProduct'),
        (N'Product_Manufacturer_Mapping', N'DisplayOrder'),
        (N'Picture', N'Id'),
        (N'Picture', N'MimeType'),
        (N'Picture', N'SeoFilename'),
        (N'Picture', N'AltAttribute'),
        (N'Picture', N'TitleAttribute'),
        (N'Product_Picture_Mapping', N'ProductId'),
        (N'Product_Picture_Mapping', N'PictureId'),
        (N'Product_Picture_Mapping', N'DisplayOrder'),
        (N'UrlRecord', N'Id'),
        (N'UrlRecord', N'EntityId'),
        (N'UrlRecord', N'EntityName'),
        (N'UrlRecord', N'LanguageId'),
        (N'UrlRecord', N'Slug'),
        (N'UrlRecord', N'IsActive')
    ) AS required(TableName, ColumnName)
    LEFT JOIN sys.schemas AS s ON s.name = N'dbo'
    LEFT JOIN sys.tables AS t ON t.schema_id = s.schema_id AND t.name = required.TableName
    LEFT JOIN sys.columns AS c ON c.object_id = t.object_id AND c.name = required.ColumnName
    WHERE c.column_id IS NULL
)
    THROW 51000, 'One or more tables or columns required by the exporter are missing.', 1;

SELECT N'PASS' AS SmokeStatus,
       DB_NAME() AS DatabaseName,
       SUSER_SNAME() AS LoginName,
       USER_NAME() AS DatabaseUser;

SELECT COUNT_BIG(*) AS ProductsTotal,
       SUM(CASE WHEN p.Published = 1 THEN CONVERT(bigint, 1) ELSE CONVERT(bigint, 0) END) AS Published,
       SUM(CASE WHEN p.Published = 0 THEN CONVERT(bigint, 1) ELSE CONVERT(bigint, 0) END) AS Unpublished
FROM dbo.Product AS p
WHERE p.Deleted = 0;

SELECT
    (SELECT COUNT_BIG(*) FROM dbo.Language) AS Languages,
    (SELECT COUNT_BIG(*) FROM dbo.LocalizedProperty WHERE LocaleKeyGroup IN (N'Product', N'Category', N'Manufacturer')) AS LocalizedValues,
    (SELECT COUNT_BIG(*) FROM dbo.Category WHERE Deleted = 0) AS Categories,
    (SELECT COUNT_BIG(*) FROM dbo.Product_Category_Mapping) AS ProductCategoryMappings,
    (SELECT COUNT_BIG(*) FROM dbo.Manufacturer WHERE Deleted = 0) AS Manufacturers,
    (SELECT COUNT_BIG(*) FROM dbo.Product_Manufacturer_Mapping) AS ProductManufacturerMappings,
    (SELECT COUNT_BIG(*) FROM dbo.Product_Picture_Mapping) AS ProductPictureMappings,
    (SELECT COUNT_BIG(*) FROM dbo.UrlRecord WHERE IsActive = 1 AND EntityName IN (N'Product', N'Category', N'Manufacturer')) AS ActiveSlugs;

SELECT TOP (5)
       p.Id AS ProductId,
       p.SKU,
       p.Gtin AS EAN,
       p.Name,
       p.Published,
       p.CreatedOnUtc,
       p.UpdatedOnUtc
FROM dbo.Product AS p
WHERE p.Deleted = 0
ORDER BY p.UpdatedOnUtc DESC, p.Id DESC;

SELECT is_read_committed_snapshot_on AS ReadCommittedSnapshotEnabled,
       snapshot_isolation_state_desc AS SnapshotIsolationState
FROM sys.databases
WHERE name = DB_NAME();
GO
