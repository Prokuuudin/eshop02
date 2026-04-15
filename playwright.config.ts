import fs from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

const webServerCommand = process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ??
  (fs.existsSync('.next/BUILD_ID') ? 'npx next start -p 3005' : 'npx next dev -p 3005')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3005',
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
    }
  ],
  webServer: {
    command: webServerCommand,
    url: 'http://127.0.0.1:3005',
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
})
