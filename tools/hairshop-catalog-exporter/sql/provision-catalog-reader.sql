/*
Hairshop catalog exporter: one-time MSSQL provisioning template.

IMPORTANT
1. Run only by an authorized MSSQL administrator after review.
2. This file has NOT been executed by Codex.
3. Execute in SQLCMD mode. Supply CatalogReaderPassword only in a private,
   temporary copy; never commit, email, or place the populated file in webroot.
4. If the server login is created separately (for example, with SSMS), skip
   the first section and execute only the hairshop_p34s section.
*/

:setvar CatalogReaderPassword "REPLACE_AT_EXECUTION_DO_NOT_SAVE"
:on error exit

USE [master];
GO

IF DB_ID(N'hairshop_p34s') IS NULL
    THROW 51000, 'Database hairshop_p34s does not exist on this SQL Server instance.', 1;

IF SUSER_ID(N'hairshop_catalog_reader') IS NOT NULL
    THROW 51000, 'Server login hairshop_catalog_reader already exists; stop and review it instead of reusing it automatically.', 1;

DECLARE @CatalogReaderPassword nvarchar(128) = N'$(CatalogReaderPassword)';

IF @CatalogReaderPassword = N'REPLACE_AT_EXECUTION_DO_NOT_SAVE'
   OR LEN(@CatalogReaderPassword) < 20
   OR LEN(@CatalogReaderPassword) > 128
    THROW 51000, 'Supply a unique 20-128 character service password in SQLCMD mode.', 1;

DECLARE @CreateLoginSql nvarchar(max) =
    N'CREATE LOGIN [hairshop_catalog_reader] WITH PASSWORD = ' +
    QUOTENAME(@CatalogReaderPassword, N'''') +
    N', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF, DEFAULT_DATABASE = [hairshop_p34s];';

EXEC sys.sp_executesql @CreateLoginSql;
GO

USE [hairshop_p34s];
GO

SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    IF USER_ID(N'hairshop_catalog_reader') IS NOT NULL
        THROW 51000, 'Database user hairshop_catalog_reader already exists; stop and review it instead of changing it automatically.', 1;

    CREATE USER [hairshop_catalog_reader] FOR LOGIN [hairshop_catalog_reader];

    GRANT CONNECT TO [hairshop_catalog_reader];
    GRANT SELECT ON OBJECT::[dbo].[Product] TO [hairshop_catalog_reader];
    GRANT SELECT ON OBJECT::[dbo].[Language] TO [hairshop_catalog_reader];
    GRANT SELECT ON OBJECT::[dbo].[LocalizedProperty] TO [hairshop_catalog_reader];
    GRANT SELECT ON OBJECT::[dbo].[Category] TO [hairshop_catalog_reader];
    GRANT SELECT ON OBJECT::[dbo].[Product_Category_Mapping] TO [hairshop_catalog_reader];
    GRANT SELECT ON OBJECT::[dbo].[Manufacturer] TO [hairshop_catalog_reader];
    GRANT SELECT ON OBJECT::[dbo].[Product_Manufacturer_Mapping] TO [hairshop_catalog_reader];
    GRANT SELECT ON OBJECT::[dbo].[Picture] TO [hairshop_catalog_reader];
    GRANT SELECT ON OBJECT::[dbo].[Product_Picture_Mapping] TO [hairshop_catalog_reader];
    GRANT SELECT ON OBJECT::[dbo].[UrlRecord] TO [hairshop_catalog_reader];

    /* Defense in depth: the exporter also verifies effective permissions at runtime. */
    DENY INSERT, UPDATE, DELETE, EXECUTE TO [hairshop_catalog_reader];
    DENY ALTER, CONTROL TO [hairshop_catalog_reader];

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

/* Administrative verification. This returns metadata only; no secret is shown. */
SELECT dp.name AS DatabaseUser,
       dp.type_desc AS PrincipalType,
       perm.state_desc AS PermissionState,
       perm.permission_name AS PermissionName,
       OBJECT_SCHEMA_NAME(perm.major_id) AS ObjectSchema,
       OBJECT_NAME(perm.major_id) AS ObjectName
FROM sys.database_principals AS dp
LEFT JOIN sys.database_permissions AS perm ON perm.grantee_principal_id = dp.principal_id
WHERE dp.name = N'hairshop_catalog_reader'
ORDER BY perm.class_desc, ObjectSchema, ObjectName, perm.permission_name;
GO
