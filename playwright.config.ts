import fs from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

const normalizeWebServerCommand = (command: string): string => {
  if (command.includes('next dev') && !command.includes('--webpack')) {
    return command.replace('next dev', 'next dev --webpack')
  }

  return command
}

const rawWebServerCommand = process.env.PLAYWRIGHT_WEB_SERVER_COMMAND
const webServerCommand = rawWebServerCommand
  ? normalizeWebServerCommand(rawWebServerCommand)
  : (fs.existsSync('.next/BUILD_ID') ? 'npx next start -p 3005' : 'npx next dev --webpack -p 3005')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3005',
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
    url: 'http://localhost:3005',
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
})
