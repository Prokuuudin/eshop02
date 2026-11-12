import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import { assertE2eBaseUrlIsSafe, readLocalEnvDatabaseHosts, resolveE2eDatabaseUrl } from './scripts/e2e-database-guard'

// Never .env.local: it points at production. The app under test writes too, so its database is
// overridden below (process env wins over Next's .env files) and mail cannot leave the machine.
loadEnv({ path: '.env.e2e', quiet: true })
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3005'
assertE2eBaseUrlIsSafe(baseURL)
const e2eDatabaseUrl = resolveE2eDatabaseUrl(process.env, readLocalEnvDatabaseHosts())
// The web server starts before globalSetup and a config cannot await, so the database's own
// identity marker is checked here, synchronously, before anything can connect and write.
execFileSync(process.execPath, ['--import', 'tsx', 'scripts/e2e-verify-database.ts'], { stdio: 'inherit', env: process.env })

const normalizeWebServerCommand = (command: string): string => {
  if (command.includes('next dev') && !command.includes('--webpack')) {
    return command.replace('next dev', 'next dev --webpack')
  }

  return command
}

const rawWebServerCommand = process.env.PLAYWRIGHT_WEB_SERVER_COMMAND
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === '1'
const webServerCommand = rawWebServerCommand
  ? normalizeWebServerCommand(rawWebServerCommand)
  : (fs.existsSync('.next/BUILD_ID') ? 'npx next start -p 3005' : 'npx next dev --webpack -p 3005')

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] }
    },
    {
      name: 'mobile-webkit',
      use: { ...devices['iPhone 15'] }
    }
  ],
  webServer: skipWebServer ? undefined : {
    command: webServerCommand,
    url: baseURL,
    // A running server may be connected to any database, so one is never reused.
    reuseExistingServer: false,
    // Every connection variable lib/prisma.ts reads is pinned, so none falls back to .env.local.
    env: {
      DATABASE_URL: e2eDatabaseUrl,
      POSTGRES_PRISMA_URL: e2eDatabaseUrl,
      POSTGRES_URL: e2eDatabaseUrl,
      POSTGRES_URL_NON_POOLING: e2eDatabaseUrl,
      SMTP_HOST: process.env.E2E_SMTP_HOST ?? 'smtp.invalid',
    },
    timeout: 120000
  }
})
