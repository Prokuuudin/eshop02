import fs from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

const normalizeWebServerCommand = (command: string): string => {
  if (command.includes('next dev') && !command.includes('--webpack')) {
    return command.replace('next dev', 'next dev --webpack')
  }

  return command
}

const rawWebServerCommand = process.env.PLAYWRIGHT_WEB_SERVER_COMMAND
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3005'
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
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
})
