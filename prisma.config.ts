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

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: dbUrl,
  },
});
