import { config } from "dotenv";
config({ path: ".env.local" });
import { defineConfig } from "prisma/config";

// Vercel-Neon integration may use POSTGRES_URL instead of DATABASE_URL
const dbUrl =
  process.env["DATABASE_URL"] ||
  process.env["POSTGRES_PRISMA_URL"] ||
  process.env["POSTGRES_URL"] ||
  process.env["POSTGRES_URL_NON_POOLING"];

if (!dbUrl) {
  throw new Error(
    "No database URL found. Set DATABASE_URL (or POSTGRES_URL / POSTGRES_PRISMA_URL) in Vercel → Settings → Environment Variables and enable it for the Build scope."
  );
}

// prisma migrate holds a session-scoped advisory lock; through the Neon pooler
// (pgbouncer) the lock survives in the pooled connection after the CLI exits and
// blocks every subsequent migrate run with P1002. Migrations must use the direct host.
const directUrl = dbUrl.replace("-pooler.", ".");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: directUrl,
  },
});
