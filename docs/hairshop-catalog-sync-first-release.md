# Hairshop catalog sync: first safe release

## Release mode

The first deployment is API-only and fail-closed:

- `HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED=false`;
- the Plesk client remains in dry-run mode (`AllowApply=false`, no `-Apply`);
- no migration is required;
- no new npm dependency is required;
- no scheduled task or production database write is part of this release.

An `apply` request is rejected with HTTP 403 before any product query, transaction,
advisory lock, create, or update is executed. Dry-run reads product identities only.

## New Vercel environment variables

| Name | Vercel type | First-release value | Scope |
|---|---|---|---|
| `HAIRSHOP_CATALOG_SYNC_SECRET` | Secret | A newly generated 32-byte random value encoded as Base64 (44 characters) | Production; use a different value in Preview if preview API testing is needed |
| `HAIRSHOP_CATALOG_SYNC_WRITE_ENABLED` | Config | Exact lowercase string `false` | Production and Preview |

No existing variable is changed. In particular, database, GrinS, checkout, and order
configuration remains untouched.

Generate the production secret once in an administrator PowerShell session:

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes); [Convert]::ToBase64String($bytes) } finally { $rng.Dispose() }
```

Store the output directly as the Vercel Secret. Do not put it in Git, a command-line
argument, deployment logs, or the XML/JSON journal. The protected Plesk key file must
contain the same production value only when the dry-run client is installed.

## Promotion gate

The release may follow the normal pull-request/deployment process after both variables
exist with write disabled. Enabling writes is a separate later release decision and
requires all three gates: Vercel `WRITE_ENABLED=true`, Plesk `AllowApply=true`, and an
explicit client `-Apply` invocation.
